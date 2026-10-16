// Một phiên làm việc: Yjs doc + đồng bộ + presence + lưu snapshot + kênh run.
// Không phụ thuộc React — hook useTeamWorkspace chỉ bọc lớp này.
//
// An toàn dữ liệu: nếu KHÔNG tải được bản lưu (mạng lỗi...), phiên không gieo giá trị mặc định và không lưu gì
// (tránh ghi đè bản lưu thật của đội bằng doc trống). Tự thử tải lại có giãn cách; gọi retryLoad() để thử ngay.
import * as Y from 'yjs';
import { getDesign, seedIfEmpty, type SeedDefaults } from './doc';
import { YjsBroadcastProvider } from './provider';
import { RunChannel, type RunChannelOptions } from './run';
import { debounceMax, isElectedSaver, type SnapshotStore } from './persistence';
import type { PresenceInfo, Transport, TransportStatus } from './transport';

export type WorkspaceKind = 'team' | 'personal';

export interface SessionUser {
  userId: string | null;
  name: string;
  color?: string;
}

export interface WorkspaceSessionOptions {
  kind: WorkspaceKind;
  /** null = chạy một mình (chế độ cá nhân) */
  transport: Transport | null;
  store: SnapshotStore;
  user: SessionUser;
  seed?: SeedDefaults;
  saveWaitMs?: number;
  saveMaxWaitMs?: number;
  providerSyncTimeoutMs?: number;
  /** giãn cách thử lại (tải/lưu) — tăng gấp đôi mỗi lần tới tối đa retryMaxMs */
  retryBaseMs?: number;
  retryMaxMs?: number;
  run?: RunChannelOptions;
}

export interface SessionState {
  status: TransportStatus;
  /** đã nạp snapshot + đồng bộ với đồng đội — trước đó không nên cho sửa */
  ready: boolean;
  /** đã tải được bản lưu (hoặc chưa có bản lưu nào) — false thì không được lưu */
  loaded: boolean;
  /** lỗi tải bản lưu (đang khoá lưu, tự thử lại) */
  loadError: string | null;
  peers: PresenceInfo[];
  saving: boolean;
  lastSavedAt: number | null;
  /** lỗi lưu gần nhất (đang tự thử lại) */
  error: string | null;
}

const COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];

export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export class WorkspaceSession {
  readonly doc = new Y.Doc();
  readonly run: RunChannel;
  readonly kind: WorkspaceKind;
  private provider: YjsBroadcastProvider | null = null;
  private listeners = new Set<() => void>();
  private offs: (() => void)[] = [];
  private dirty = false;
  private destroyed = false;
  private synced = false;
  private save: ReturnType<typeof debounceMax>;
  private me: PresenceInfo;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadAttempt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveAttempt = 0;
  private retryBase: number;
  private retryMax: number;
  state: SessionState;

  constructor(private opts: WorkspaceSessionOptions) {
    this.kind = opts.kind;
    this.retryBase = opts.retryBaseMs ?? 2000;
    this.retryMax = opts.retryMaxMs ?? 30000;
    const sessionId = opts.transport?.id ?? 'local';
    this.me = {
      sessionId,
      userId: opts.user.userId,
      name: opts.user.name,
      color: opts.user.color ?? colorFor(opts.user.userId ?? sessionId),
      joinedAt: Date.now(),
    };
    this.state = {
      status: opts.transport ? 'connecting' : 'local',
      ready: false,
      loaded: false,
      loadError: null,
      peers: opts.transport ? [] : [this.me],
      saving: false,
      lastSavedAt: null,
      error: null,
    };
    this.run = new RunChannel(opts.transport, this.doc, { userId: opts.user.userId, name: opts.user.name }, opts.run);
    this.save = debounceMax(() => void this.saveNow(), opts.saveWaitMs ?? (opts.kind === 'team' ? 3000 : 800), opts.saveMaxWaitMs ?? 15000);
    this.doc.on('update', this.onUpdate);
  }

  get sessionId() {
    return this.me.sessionId;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private backoff(attempt: number) {
    return Math.min(this.retryMax, this.retryBase * 2 ** Math.max(0, attempt - 1));
  }

  private onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === 'snapshot') return;
    this.dirty = true;
    if (this.state.loaded) this.save();
  };

  /** Nạp snapshot → kết nối → đồng bộ → seed mặc định nếu doc trống. */
  async start() {
    await this.tryLoad();
    if (this.destroyed) return;

    const t = this.opts.transport;
    if (!t) {
      this.synced = true;
      this.maybeReady();
      return;
    }
    this.offs.push(
      t.onStatus((status) => this.set({ status })),
      t.onPresence((peers) => this.onPeers(peers)),
    );
    this.provider = new YjsBroadcastProvider(this.doc, t, { syncTimeoutMs: this.opts.providerSyncTimeoutMs });
    await t.connect();
    if (this.destroyed) return;
    t.track(this.me);
    this.provider.requestSync();
    this.provider.onSynced(() => {
      this.synced = true;
      this.maybeReady();
    });
  }

  private async tryLoad(): Promise<boolean> {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.loadAttempt++;
    try {
      const snap = await this.opts.store.load();
      if (this.destroyed) return false;
      if (snap && snap.length) Y.applyUpdate(this.doc, snap, 'snapshot');
      this.loadAttempt = 0;
      this.set({ loaded: true, loadError: null });
      this.maybeReady();
      // Có thay đổi trong lúc chờ tải (từ đồng đội) → lưu bình thường
      if (this.dirty) this.save();
      return true;
    } catch (e) {
      if (this.destroyed) return false;
      this.set({ loadError: `Không tải được bản lưu: ${(e as Error).message}. Đang thử lại…` });
      this.loadTimer = setTimeout(() => void this.tryLoad(), this.backoff(this.loadAttempt));
      return false;
    }
  }

  /** Thử tải lại bản lưu ngay (nút "Thử lại"). */
  retryLoad() {
    if (this.state.loaded || this.destroyed) return Promise.resolve(this.state.loaded);
    this.loadAttempt = 0;
    return this.tryLoad();
  }

  private maybeReady() {
    if (this.destroyed || this.state.ready || !this.synced) return;
    if (this.state.loaded) {
      seedIfEmpty(this.doc, this.opts.seed);
      this.set({ ready: true });
    }
    // Chưa tải được bản lưu: không seed, không cho sửa — chờ tryLoad thành công
  }

  private onPeers(peers: PresenceInfo[]) {
    this.set({ peers });
    // Người lưu có thể vừa rời phòng → máy này có thể là người được bầu mới
    if (this.dirty && this.state.loaded && this.shouldSave()) this.save();
  }

  /** Cập nhật "đang làm gì" để đồng đội thấy. */
  setFocus(focus: string | undefined) {
    this.me = { ...this.me, focus };
    if (this.opts.transport) this.opts.transport.track(this.me);
    else this.set({ peers: [this.me] });
  }

  /** Có nên lưu từ máy này không (đội: chỉ phiên được bầu). */
  shouldSave(): boolean {
    if (this.kind === 'personal') return true;
    const others = this.state.peers.map((p) => p.sessionId).filter((id) => id !== this.me.sessionId);
    return isElectedSaver(this.me.sessionId, others);
  }

  async saveNow(force = false) {
    if (!this.dirty || !this.state.loaded || this.destroyed && !force) return;
    if (!force && !this.shouldSave()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.dirty = false;
    this.set({ saving: true });
    try {
      await this.opts.store.save(Y.encodeStateAsUpdate(this.doc), getDesign(this.doc));
      this.saveAttempt = 0;
      this.set({ saving: false, lastSavedAt: Date.now(), error: null });
    } catch (e) {
      this.dirty = true;
      this.saveAttempt++;
      this.set({ saving: false, error: `Lưu thất bại: ${(e as Error).message}. Đang thử lại…` });
      if (!this.destroyed) this.saveTimer = setTimeout(() => void this.saveNow(), this.backoff(this.saveAttempt));
    }
  }

  /** Đóng phiên mà KHÔNG lưu thay đổi còn lại (dùng khi xoá bài luyện tập cá nhân). */
  discard() {
    this.dirty = false;
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    // Rời phòng: lưu nốt nếu còn thay đổi (bỏ qua bầu chọn vì mình sắp đi)
    if (this.dirty && this.state.loaded && this.state.ready) void this.saveNow(true);
    this.save.cancel();
    this.destroyed = true;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.provider?.destroy();
    this.run.destroy();
    this.offs.forEach((f) => f());
    this.opts.transport?.close();
    this.doc.off('update', this.onUpdate);
    this.listeners.clear();
  }
}
