// ControllerRuntime chạy code thí sinh trong Web Worker, khoá bước với mô phỏng:
// mỗi tick() gửi một SensorFrame, Worker gọi loop() một lần rồi trả ActuatorCommand.
// Hai lớp watchdog: guard trong Worker (mặc định 50 ms) và hẹn giờ ở luồng chính — nếu Worker treo hẳn
// (không trả lời sau hardTimeoutMs) thì terminate và báo lỗi.

import type { ActuatorCommand, ControllerLog, ControllerRuntime, PlotPoint, SensorFrame } from '@/shared/types';
import { ControllerError } from './errors';
import { LocalControllerRuntime } from './local-runtime';
import type { FromWorker, ToWorker, WorkerCoreOptions } from './protocol';

/** Giao diện tối thiểu của Worker (để test thay bằng worker giả). */
export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  addEventListener(type: 'message', fn: (ev: MessageEvent<FromWorker>) => void): void;
  addEventListener(type: 'error', fn: (ev: ErrorEvent) => void): void;
  terminate(): void;
}

export interface WorkerRuntimeOptions extends WorkerCoreOptions {
  /** Thời gian chờ tối đa ở luồng chính cho một tick, ms. Mặc định 1000. */
  hardTimeoutMs?: number;
  /** Thời gian chờ tối đa cho load, ms. Mặc định 3000. */
  loadTimeoutMs?: number;
  createWorker?: () => WorkerLike;
}

function defaultCreateWorker(): WorkerLike {
  return new Worker(new URL('./controller.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

function makeNonce(): string {
  const a = new Uint32Array(4);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16)).join('');
}

interface Pending {
  resolve: (msg: FromWorker) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerControllerRuntime implements ControllerRuntime {
  private options: WorkerRuntimeOptions;
  private worker: WorkerLike | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private logs: ControllerLog[] = [];
  private plots: PlotPoint[] = [];
  private params: Record<string, number>;
  private dead: ControllerError | null = null;
  private nonce = '';

  constructor(options: WorkerRuntimeOptions = {}) {
    this.options = options;
    this.params = { ...(options.params ?? {}) };
  }

  async load(source: string): Promise<{ ok: true } | { ok: false; error: string }> {
    this.restartWorker();
    const o = this.options;
    const coreOpts: WorkerCoreOptions = {
      watchdogMs: o.watchdogMs, setupWatchdogMs: o.setupWatchdogMs, defaultDt: o.defaultDt, actuators: o.actuators,
      maxLogsPerTick: o.maxLogsPerTick, maxPlotsPerTick: o.maxPlotsPerTick,
    };
    const msg = await this.request(
      { type: 'load', id: this.nextId++, nonce: this.nonce, source, options: { ...coreOpts, params: this.params } },
      this.options.loadTimeoutMs ?? 3000,
      'Phần khởi động chạy quá lâu, đã dừng (vòng lặp vô hạn?)',
    ).catch((e: Error) => e);
    if (msg instanceof Error) return { ok: false, error: msg.message };
    this.collect(msg);
    if (msg.type === 'loaded' && !msg.ok) return { ok: false, error: msg.error?.message ?? 'Lỗi không rõ' };
    return { ok: true };
  }

  async tick(frame: SensorFrame): Promise<ActuatorCommand> {
    if (this.dead) throw this.dead;
    if (!this.worker) throw new ControllerError('Chưa nạp code (gọi load trước)');
    const msg = await this.request(
      { type: 'tick', id: this.nextId++, frame },
      this.options.hardTimeoutMs ?? 1000,
      'Code không phản hồi, đã dừng (vòng lặp vô hạn?)',
    );
    this.collect(msg);
    if (msg.type !== 'ticked') throw new ControllerError('Phản hồi lạ từ Worker');
    if (msg.error) {
      const err = new ControllerError(msg.error.detail, msg.error.line);
      err.message = msg.error.message;
      throw err;
    }
    return this.sanitize(msg.cmd ?? {});
  }

  /** Cập nhật tham số cho param(name, macDinh) (thanh trượt Kp/Ki/Kd) mà không cần nạp lại code. */
  setParams(params: Record<string, number>): void {
    Object.assign(this.params, params);
    this.worker?.postMessage({ type: 'params', params });
  }

  drainLogs(): ControllerLog[] {
    const out = this.logs;
    this.logs = [];
    return out;
  }

  drainPlots(): PlotPoint[] {
    const out = this.plots;
    this.plots = [];
    return out;
  }

  dispose(): void {
    this.killWorker(new ControllerError('Đã dừng chạy code'));
  }

  // ------------------------------------------------------------ nội bộ

  /** Kiểm lại lệnh ở luồng chính (phòng Worker bị can thiệp): chỉ tên hợp lệ, số hữu hạn. */
  private sanitize(cmd: ActuatorCommand): ActuatorCommand {
    const allowed = this.options.actuators ? new Set(this.options.actuators) : null;
    const out: ActuatorCommand = {};
    for (const [k, v] of Object.entries(cmd)) {
      if (allowed && !allowed.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  }

  private collect(msg: FromWorker): void {
    if (msg.logs.length) this.logs.push(...msg.logs);
    if (msg.plots.length) this.plots.push(...msg.plots);
    if (this.logs.length > 5000) this.logs.splice(0, this.logs.length - 5000);
    if (this.plots.length > 50000) this.plots.splice(0, this.plots.length - 50000);
  }

  private restartWorker(): void {
    this.killWorker(new ControllerError('Đã nạp lại code'));
    this.dead = null;
    this.nonce = makeNonce();
    const w = (this.options.createWorker ?? defaultCreateWorker)();
    w.addEventListener('message', (ev: MessageEvent<FromWorker>) => {
      if (!ev.data || ev.data.nonce !== this.nonce) return; // tin không do runtime gửi
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(ev.data.id);
      p.resolve(ev.data);
    });
    w.addEventListener('error', (ev: ErrorEvent) => {
      this.killWorker(new ControllerError(`Lỗi Worker: ${ev.message ?? 'không rõ'}`));
    });
    this.worker = w;
  }

  private killWorker(reason: ControllerError): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.dead = reason;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(reason);
    }
    this.pending.clear();
  }

  private request(msg: ToWorker & { id: number }, timeoutMs: number, timeoutText: string): Promise<FromWorker> {
    const w = this.worker;
    if (!w) return Promise.reject(this.dead ?? new ControllerError('Worker chưa sẵn sàng'));
    return new Promise<FromWorker>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        const err = new ControllerError(timeoutText);
        reject(err);
        this.killWorker(err);
      }, timeoutMs);
      this.pending.set(msg.id, { resolve, reject, timer });
      w.postMessage(msg);
    });
  }
}

export type RuntimeMode = 'worker' | 'local';

/** Tạo runtime: 'worker' (mặc định trong trình duyệt) hoặc 'local' (Node/test). */
export function createControllerRuntime(
  options: WorkerRuntimeOptions & { mode?: RuntimeMode } = {},
): ControllerRuntime & { setParams(p: Record<string, number>): void } {
  const mode = options.mode ?? (typeof Worker !== 'undefined' ? 'worker' : 'local');
  if (mode === 'worker') return new WorkerControllerRuntime(options);
  return new LocalControllerRuntime(options);
}
