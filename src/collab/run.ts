// Kênh "run": một người bấm Thi → cả đội cùng xem.
//   run:start {runId, mapId, seed, by}  — bắt đầu
//   run:frames {runId, frames[]}        — luồng SimSnapshot lấy mẫu ~20 Hz, gửi theo lô để tiết kiệm tin nhắn
//   run:end {runId, result}             — kết quả cuối
// Trạng thái tóm tắt (RunState) còn được ghi vào Yjs doc để người vào sau vẫn thấy kết quả.
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
  /** đồng hồ (test) */
  now?: () => number;
}

type StartCb = (info: RunStartInfo) => void;
type FrameCb = (s: SimSnapshot, runId: string) => void;
type EndCb = (result: RunResult, runId: string) => void;

export class RunChannel {
  private startCbs = new Set<StartCb>();
  private frameCbs = new Set<FrameCb>();
  private endCbs = new Set<EndCb>();
  private offs: (() => void)[] = [];
  private current: string | null = null;
  private lastFrameAt = -Infinity;
  private pending: SimSnapshot[] = [];
  private playback: ReturnType<typeof setTimeout>[] = [];
  private frameHz: number;
  private perMsg: number;
  private now: () => number;

  constructor(
    private transport: Transport | null,
    private doc: Y.Doc,
    private me: { userId: string | null; name: string },
    opts: RunChannelOptions = {},
  ) {
    this.frameHz = opts.frameHz ?? 20;
    this.perMsg = Math.max(1, opts.framesPerMessage ?? 2);
    this.now = opts.now ?? (() => performance.now());
    if (transport) {
      this.offs.push(
        transport.on('run:start', (p) => {
          this.cancelPlayback();
          this.current = p.runId as string;
          const info = { ...(p as unknown as Omit<RunStartInfo, 'local'>), local: false };
          this.startCbs.forEach((cb) => cb(info));
        }),
        transport.on('run:frames', (p) => this.playRemote(p.runId as string, p.frames as SimSnapshot[])),
        transport.on('run:end', (p) => {
          const runId = p.runId as string;
          // Kết thúc sau khi đã phát hết khung đang chờ
          const delay = this.playback.length ? 1000 / this.frameHz : 0;
          setTimeout(() => this.endCbs.forEach((cb) => cb(p.result as RunResult, runId)), delay);
        }),
      );
    }
  }

  /** Lượt chạy hiện tại (theo doc). */
  state(): RunState {
    return getRunState(this.doc);
  }

  /** Bắt đầu lượt chạy trên máy này; trả runId. */
  start(mapId: MapId, seed = Math.floor(Math.random() * 1e9)): string {
    const runId = randomId();
    this.current = runId;
    this.pending = [];
    this.lastFrameAt = -Infinity;
    this.cancelPlayback();
    const by = { userId: this.me.userId, name: this.me.name };
    setRunState(this.doc, { status: 'running', runId, mapId, startedBy: by, startedAt: Date.now(), result: null });
    this.transport?.send('run:start', { runId, mapId, seed, by });
    this.startCbs.forEach((cb) => cb({ runId, mapId, seed, by, local: true }));
    return runId;
  }

  /** Gọi mỗi khi có SimSnapshot mới (bao nhiêu lần cũng được — tự lấy mẫu ~frameHz). */
  frame(s: SimSnapshot) {
    if (!this.current) return;
    const runId = this.current;
    this.frameCbs.forEach((cb) => cb(s, runId));
    const t = this.now();
    if (t - this.lastFrameAt < 1000 / this.frameHz - 1) return;
    this.lastFrameAt = t;
    this.pending.push(s);
    if (this.pending.length >= this.perMsg) this.flushFrames();
  }

  private flushFrames() {
    if (!this.pending.length || !this.current) return;
    this.transport?.send('run:frames', { runId: this.current, frames: this.pending });
    this.pending = [];
  }

  /** Kết thúc lượt chạy (gửi kết quả cho cả đội và ghi vào doc). */
  end(result: RunResult) {
    const runId = this.current;
    if (!runId) return;
    this.flushFrames();
    this.current = null;
    setRunState(this.doc, { status: 'finished', runId, result });
    this.transport?.send('run:end', { runId, result });
    this.endCbs.forEach((cb) => cb(result, runId));
  }

  /** Phát lại khung nhận được, giãn đều theo frameHz để hình mượt. */
  private playRemote(runId: string, frames: SimSnapshot[]) {
    if (runId !== this.current) {
      this.current = runId; // vào giữa chừng
    }
    const step = 1000 / this.frameHz;
    frames.forEach((f, i) => {
      if (i === 0) this.frameCbs.forEach((cb) => cb(f, runId));
      else {
        const h = setTimeout(() => {
          this.playback = this.playback.filter((x) => x !== h);
          this.frameCbs.forEach((cb) => cb(f, runId));
        }, step * i);
        this.playback.push(h);
      }
    });
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

  destroy() {
    this.cancelPlayback();
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
