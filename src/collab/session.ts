// Một phiên làm việc: Yjs doc + đồng bộ + presence + lưu snapshot + kênh run.
// Không phụ thuộc React — hook useTeamWorkspace chỉ bọc lớp này.
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
  run?: RunChannelOptions;
}

export interface SessionState {
  status: TransportStatus;
  /** đã nạp snapshot + đồng bộ với đồng đội — trước đó không nên cho sửa */
  ready: boolean;
  peers: PresenceInfo[];
  saving: boolean;
  lastSavedAt: number | null;
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
  private save: ReturnType<typeof debounceMax>;
  private me: PresenceInfo;
  state: SessionState;

  constructor(private opts: WorkspaceSessionOptions) {
    this.kind = opts.kind;
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

  private onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === 'snapshot') return;
    this.dirty = true;
    this.save();
  };

  /** Nạp snapshot → kết nối → đồng bộ → seed mặc định nếu doc trống. */
  async start() {
    try {
      const snap = await this.opts.store.load();
      if (this.destroyed) return;
      if (snap && snap.length) Y.applyUpdate(this.doc, snap, 'snapshot');
    } catch (e) {
      this.set({ error: `Không tải được bản lưu: ${(e as Error).message}` });
    }

    const t = this.opts.transport;
    if (!t) {
      seedIfEmpty(this.doc, this.opts.seed);
      this.set({ ready: true });
      return;
    }
    this.offs.push(
      t.onStatus((status) => this.set({ status })),
      t.onPresence((peers) => this.set({ peers })),
    );
    this.provider = new YjsBroadcastProvider(this.doc, t, { syncTimeoutMs: this.opts.providerSyncTimeoutMs });
    await t.connect();
    if (this.destroyed) return;
    t.track(this.me);
    this.provider.requestSync();
    this.provider.onSynced(() => {
      if (this.destroyed) return;
      seedIfEmpty(this.doc, this.opts.seed);
      this.set({ ready: true });
    });
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
    if (!this.dirty || !this.state.ready) return;
    if (!force && !this.shouldSave()) return;
    this.dirty = false;
    this.set({ saving: true });
    try {
      await this.opts.store.save(Y.encodeStateAsUpdate(this.doc), getDesign(this.doc));
      this.set({ saving: false, lastSavedAt: Date.now(), error: null });
    } catch (e) {
      this.dirty = true;
      this.set({ saving: false, error: `Lưu thất bại: ${(e as Error).message}` });
    }
  }

  destroy() {
    if (this.destroyed) return;
    // Rời phòng: lưu nốt nếu còn thay đổi (bỏ qua bầu chọn vì mình sắp đi)
    if (this.dirty && this.state.ready) void this.saveNow(true);
    this.save.cancel();
    this.destroyed = true;
    this.provider?.destroy();
    this.run.destroy();
    this.offs.forEach((f) => f());
    this.opts.transport?.close();
    this.doc.off('update', this.onUpdate);
    this.listeners.clear();
  }
}
