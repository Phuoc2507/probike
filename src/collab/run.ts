// Kênh "run": một người bấm Thi → cả đội cùng xem.
//   run:start {runId, mapId, seed, by}  — bắt đầu
//   run:frames {runId, frames[]}        — luồng SimSnapshot lấy mẫu ~20 Hz, gửi theo lô để tiết kiệm tin nhắn
//   run:hb {runId}                      — nhịp tim mỗi ~2 s (người chạy còn sống)
//   run:end {runId, result}             — kết quả cuối
// Trạng thái tóm tắt (RunState) còn được ghi vào Yjs doc để người vào sau vẫn thấy kết quả.
//
// Mỗi đội chỉ một lượt chạy tại một thời điểm: start() trả null nếu đồng đội đang chạy.
// Hai người bấm gần như cùng lúc → lượt có runId nhỏ hơn thắng, bên kia nhận onCancel và phải dừng mô phỏng.
// Người chạy đóng tab → không còn nhịp tim → sau staleMs mọi máy coi lượt đó đã dừng (trạng thái về 'idle').
import type * as Y from 'yjs';
import type { MapId, RunResult, SimSnapshot } from '@/shared/types';
import { getRunState, setRunState, type RunState } from './doc';
import { randomId, type Transport } from './transport';

export interface RunStartInfo {
  runId: string;
  mapId: MapId;
  seed: number;
  by: { userId: string | null; name: string };
  /** true nếu lượt chạy do chính máy này khởi động (máy này chạy vật lý) */
  local: boolean;
}

export interface RunChannelOptions {
  /** tần số lấy mẫu SimSnapshot, Hz */
  frameHz?: number;
  /** số khung gom trong một tin nhắn (1 = gửi ngay từng khung) */
  framesPerMessage?: number;
  /** quá khoảng này không thấy tin của người chạy → coi lượt chạy đã dừng (ms) */
  staleMs?: number;
  /** chu kỳ nhịp tim (ms) */
  heartbeatMs?: number;
  /** đồng hồ đơn điệu cho lấy mẫu khung (test) */
  now?: () => number;
  /** đồng hồ thời gian thực cho hạn lượt chạy (test) */
  clock?: () => number;
}

type StartCb = (info: RunStartInfo) => void;
type FrameCb = (s: SimSnapshot, runId: string) => void;
type EndCb = (result: RunResult, runId: string) => void;
type CancelCb = (runId: string, reason: string) => void;

export class RunChannel {
  private startCbs = new Set<StartCb>();
  private frameCbs = new Set<FrameCb>();
  private endCbs = new Set<EndCb>();
  private cancelCbs = new Set<CancelCb>();
  private offs: (() => void)[] = [];
  /** lượt máy này đang chạy */
  private localRunId: string | null = null;
  /** lượt của đồng đội đang xem */
  private viewRunId: string | null = null;
  private lastFrameAt = -Infinity;
  private lastActivity = 0;
  private readonly joinedAt: number;
  private pending: SimSnapshot[] = [];
  private playback: ReturnType<typeof setTimeout>[] = [];
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private frameHz: number;
  private perMsg: number;
  private staleMs: number;
  private heartbeatMs: number;
  private now: () => number;
  private clock: () => number;

  constructor(
    private transport: Transport | null,
    private doc: Y.Doc,
    private me: { userId: string | null; name: string },
    opts: RunChannelOptions = {},
  ) {
    this.frameHz = opts.frameHz ?? 20;
    this.perMsg = Math.max(1, opts.framesPerMessage ?? 2);
    this.staleMs = opts.staleMs ?? 6000;
    this.heartbeatMs = opts.heartbeatMs ?? 2000;
    this.now = opts.now ?? (() => performance.now());
    this.clock = opts.clock ?? (() => Date.now());
    this.joinedAt = this.clock();
    if (transport) {
      this.offs.push(
        transport.on('run:start', (p) => this.onRemoteStart(p)),
        transport.on('run:frames', (p) => this.onRemoteFrames(p.runId as string, p.frames as SimSnapshot[])),
        transport.on('run:hb', (p) => {
          if (p.runId === this.activeRemoteId()) this.lastActivity = this.clock();
        }),
        transport.on('run:end', (p) => this.onRemoteEnd(p.runId as string, p.result as RunResult)),
      );
      this.watchdog = setInterval(() => this.checkStale(), Math.max(500, this.heartbeatMs));
    }
  }

  /** Lượt chạy hiện tại (theo doc). */
  state(): RunState {
    return getRunState(this.doc);
  }

  /** runId của lượt đồng đội đang chạy (theo doc hoặc theo tin đã nhận). */
  private activeRemoteId(): string | null {
    const s = this.state();
    if (s.status === 'running' && s.runId && s.runId !== this.localRunId) return s.runId;
    return this.viewRunId;
  }

  private isStale(): boolean {
    return this.clock() - Math.max(this.lastActivity, this.joinedAt) > this.staleMs;
  }

  /** Lượt chạy của đồng đội đang diễn ra (còn sống), hoặc null nếu đội đang rảnh. */
  busy(): RunState | null {
    const s = this.state();
    if (s.status !== 'running' || !s.runId || s.runId === this.localRunId) return null;
    return this.isStale() ? null : s;
  }

  /** true nếu máy này đang chạy một lượt */
  get runningLocally(): boolean {
    return this.localRunId !== null;
  }

  /**
   * Bắt đầu lượt chạy trên máy này; trả runId, hoặc null nếu đồng đội đang chạy (xem busy()).
   * Trả về runId mới → mỗi bước gọi frame(), cuối cùng end(result). Nghe onCancel để dừng nếu bị nhường.
   */
  start(mapId: MapId, seed = Math.floor(Math.random() * 1e9)): string | null {
    if (this.busy() || this.localRunId) return null;
    const runId = randomId();
    this.localRunId = runId;
    this.viewRunId = null;
    this.pending = [];
    this.lastFrameAt = -Infinity;
    this.cancelPlayback();
    const by = { userId: this.me.userId, name: this.me.name };
    setRunState(this.doc, { status: 'running', runId, mapId, startedBy: by, startedAt: this.clock(), result: null });
    this.transport?.send('run:start', { runId, mapId, seed, by });
    this.startCbs.forEach((cb) => cb({ runId, mapId, seed, by, local: true }));
    if (this.transport) {
      this.hbTimer = setInterval(() => this.transport?.send('run:hb', { runId }), this.heartbeatMs);
    }
    return runId;
  }

  /** Gọi mỗi khi có SimSnapshot mới (bao nhiêu lần cũng được — tự lấy mẫu ~frameHz). */
  frame(s: SimSnapshot) {
    const runId = this.localRunId;
    if (!runId) return;
    this.frameCbs.forEach((cb) => cb(s, runId));
    const t = this.now();
    if (t - this.lastFrameAt < 1000 / this.frameHz - 1) return;
    this.lastFrameAt = t;
    this.pending.push(s);
    if (this.pending.length >= this.perMsg) this.flushFrames();
  }

  private flushFrames() {
    if (!this.pending.length || !this.localRunId) return;
    this.transport?.send('run:frames', { runId: this.localRunId, frames: this.pending });
    this.pending = [];
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
  }

  /** Kết thúc lượt chạy (gửi kết quả cho cả đội và ghi vào doc). */
  end(result: RunResult) {
    const runId = this.localRunId;
    if (!runId) return;
    this.flushFrames();
    this.stopHeartbeat();
    this.localRunId = null;
    setRunState(this.doc, { status: 'finished', runId, result });
    this.transport?.send('run:end', { runId, result });
    this.endCbs.forEach((cb) => cb(result, runId));
  }

  /** Huỷ lượt đang chạy trên máy này (không có kết quả). */
  abort(reason = 'Đã dừng') {
    const runId = this.localRunId;
    if (!runId) return;
    this.stopHeartbeat();
    this.pending = [];
    this.localRunId = null;
    if (this.state().runId === runId) setRunState(this.doc, { status: 'idle' });
    this.transport?.send('run:end', { runId, result: null });
    this.cancelCbs.forEach((cb) => cb(runId, reason));
  }

  private onRemoteStart(p: Record<string, unknown>) {
    const runId = p.runId as string;
    if (this.localRunId) {
      // Hai người bấm cùng lúc: runId nhỏ hơn thắng
      if (runId > this.localRunId) return;
      const mine = this.localRunId;
      this.stopHeartbeat();
      this.pending = [];
      this.localRunId = null;
      this.cancelCbs.forEach((cb) => cb(mine, `${(p.by as { name?: string })?.name ?? 'Đồng đội'} đã bấm chạy trước`));
    }
    this.cancelPlayback();
    this.viewRunId = runId;
    this.lastActivity = this.clock();
    const info = { ...(p as unknown as Omit<RunStartInfo, 'local'>), local: false };
    this.startCbs.forEach((cb) => cb(info));
  }

  /** Phát lại khung nhận được, giãn đều theo frameHz để hình mượt. Bỏ khung không thuộc lượt đang xem. */
  private onRemoteFrames(runId: string, frames: SimSnapshot[]) {
    if (this.localRunId) return; // đang tự chạy — không xem lượt khác
    if (this.viewRunId && runId !== this.viewRunId) return;
    if (!this.viewRunId) {
      // vào giữa chừng: chỉ nhận lượt doc đang ghi nhận là running (nếu doc đã đồng bộ)
      const s = this.state();
      if (s.runId && s.runId !== runId) return;
      this.viewRunId = runId;
    }
    this.lastActivity = this.clock();
    const step = 1000 / this.frameHz;
    frames.forEach((f, i) => {
      if (i === 0) this.frameCbs.forEach((cb) => cb(f, runId));
      else {
        const h = setTimeout(() => {
          this.playback = this.playback.filter((x) => x !== h);
          if (this.viewRunId === runId) this.frameCbs.forEach((cb) => cb(f, runId));
        }, step * i);
        this.playback.push(h);
      }
    });
  }

  private onRemoteEnd(runId: string, result: RunResult | null) {
    if (this.localRunId || (this.viewRunId && runId !== this.viewRunId)) return;
    // Kết thúc sau khi đã phát hết khung đang chờ
    const delay = this.playback.length ? 1000 / this.frameHz : 0;
    setTimeout(() => {
      if (this.viewRunId && this.viewRunId !== runId) return;
      this.viewRunId = null;
      if (result) this.endCbs.forEach((cb) => cb(result, runId));
      else this.cancelCbs.forEach((cb) => cb(runId, 'Lượt chạy đã bị dừng'));
    }, delay);
  }

  /** Người chạy mất tích (đóng tab) → giải phóng trạng thái 'running' kẹt trong doc. */
  private checkStale() {
    const s = this.state();
    if (s.status !== 'running' || !s.runId || s.runId === this.localRunId) return;
    if (!this.isStale()) return;
    const runId = s.runId;
    setRunState(this.doc, { status: 'idle' });
    if (this.viewRunId === runId) {
      this.viewRunId = null;
      this.cancelPlayback();
      this.cancelCbs.forEach((cb) => cb(runId, 'Mất kết nối với người đang chạy'));
    }
  }

  private cancelPlayback() {
    this.playback.forEach(clearTimeout);
    this.playback = [];
  }

  onStart(cb: StartCb) {
    this.startCbs.add(cb);
    return () => void this.startCbs.delete(cb);
  }
  onFrame(cb: FrameCb) {
    this.frameCbs.add(cb);
    return () => void this.frameCbs.delete(cb);
  }
  onEnd(cb: EndCb) {
    this.endCbs.add(cb);
    return () => void this.endCbs.delete(cb);
  }
  /** Lượt chạy bị huỷ: bị đồng đội giành trước, người chạy mất tích, hoặc abort(). */
  onCancel(cb: CancelCb) {
    this.cancelCbs.add(cb);
    return () => void this.cancelCbs.delete(cb);
  }

  destroy() {
    if (this.localRunId) this.abort('Rời trang');
    this.stopHeartbeat();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.cancelPlayback();
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
