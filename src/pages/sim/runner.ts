// Vòng lặp mô phỏng chạy ngoài luồng render React:
//   mỗi chu kỳ điều khiển: frame = engine.sensors() → cmd = await runtime.tick(frame) → engine.step(cmd)
// Chạy theo lát thời gian (mỗi lát tối đa ~10 ms CPU) bám theo đồng hồ thật, nhường luồng chính giữa các lát
// để giao diện không bị đứng. Trong test (realtime = false) chạy hết tốc lực.
import type {
  ActuatorCommand, ControllerLog, ControllerRuntime, PlotPoint, RunResult, SimConfig, SimSnapshot, VehicleDesign,
} from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { createSimEngine, type RapierSimEngine } from '@/sim';
import { createControllerRuntime } from '@/code';

type ParamRuntime = ControllerRuntime & { setParams(p: Record<string, number>): void };

export interface RunnerOptions {
  config: SimConfig;
  code: string;
  params: Record<string, number>;
  /** true (mặc định): bám đồng hồ thật. false: chạy nhanh nhất có thể (test). */
  realtime?: boolean;
  /** Hệ số tốc độ so với thời gian thật (1 = thật). */
  timeScale?: number;
  /** Gọi sau mỗi lát (≈ mỗi khung hình) — không gây render React. */
  onFrame?: (snap: SimSnapshot, engine: RapierSimEngine) => void;
  onPlots?: (points: PlotPoint[]) => void;
  onLogs?: (logs: ControllerLog[]) => void;
  /** Runtime tuỳ chọn (test truyền runtime chạy tại chỗ). */
  runtime?: ParamRuntime;
}

/** Tên các cơ cấu chấp hành (động cơ, servo) của thiết kế — runtime chỉ cho điều khiển những tên này. */
export function actuatorNames(design: VehicleDesign): string[] {
  return design.parts.filter((p) => CATALOG_BY_ID[p.itemId]?.motor).map((p) => p.name);
}

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    } else setTimeout(resolve, 0);
  });

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SimRunner {
  readonly engine: RapierSimEngine = createSimEngine();
  private runtime: ParamRuntime;
  private stopRequested: { reason: 'stopped' | 'code_error'; message?: string } | null = null;
  private pushQueue: number[] = [];
  private disposed = false;

  constructor(private opts: RunnerOptions) {
    this.runtime =
      opts.runtime ??
      createControllerRuntime({ actuators: actuatorNames(opts.config.design), params: opts.params, watchdogMs: 50 });
    if (opts.runtime) opts.runtime.setParams(opts.params);
  }

  /** Chạy tới khi kết thúc; trả kết quả. Lỗi nạp code → kết quả 'code_error'. */
  async run(): Promise<RunResult> {
    const { config, code } = this.opts;
    const e = this.engine;
    await e.init(config);
    const loaded = await this.runtime.load(code);
    this.flush();
    if (!loaded.ok) {
      e.abort('code_error', loaded.error);
      return this.finish();
    }
    const realtime = this.opts.realtime ?? true;
    const scale = this.opts.timeScale ?? 1;
    const t0 = now();
    while (!e.result() && !this.disposed) {
      const sliceStart = now();
      const target = realtime ? ((sliceStart - t0) / 1000) * scale : Infinity;
      // Không cho tụt quá xa (máy chậm): chấp nhận chạy chậm hơn thời gian thật
      while (!e.result() && e.time < target && now() - sliceStart < 10) {
        if (this.stopRequested) {
          e.abort(this.stopRequested.reason, this.stopRequested.message);
          break;
        }
        while (this.pushQueue.length) e.push(this.pushQueue.shift()!);
        let cmd: ActuatorCommand;
        try {
          cmd = await this.runtime.tick(e.sensors());
        } catch (err) {
          e.abort('code_error', err instanceof Error ? err.message : String(err));
          break;
        }
        e.step(cmd);
      }
      if (this.stopRequested && !e.result()) e.abort(this.stopRequested.reason, this.stopRequested.message);
      this.flush();
      if (this.disposed) break;
      this.opts.onFrame?.(e.snapshot(), e);
      if (!e.result()) await (realtime ? waitFrame() : yieldToUi());
    }
    if (!e.result()) e.abort('stopped');
    return this.finish();
  }

  private finish(): RunResult {
    const r = this.engine.result()!;
    this.flush();
    return r;
  }

  private flush() {
    const plots = this.runtime.drainPlots();
    if (plots.length) this.opts.onPlots?.(plots);
    const logs = this.runtime.drainLogs();
    if (logs.length) this.opts.onLogs?.(logs);
  }

  setParams(p: Record<string, number>) {
    this.runtime.setParams(p);
  }

  /** Xung lực ngang (N·s), dương đẩy sang phải. */
  push(impulse: number) {
    this.pushQueue.push(impulse);
  }

  stop(reason: 'stopped' | 'code_error' = 'stopped', message?: string) {
    this.stopRequested = { reason, message };
  }

  /** Giải phóng engine và Worker (gọi sau khi run() xong hoặc khi rời trang). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.dispose();
    // engine.dispose sau khi vòng lặp thoát (tránh dùng engine đã giải phóng)
    setTimeout(() => this.engine.dispose(), 50);
  }
}

function waitFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'undefined') return yieldToUi();
  // rAF dừng khi tab ẩn → dùng thêm hẹn giờ dự phòng
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(fin);
    setTimeout(fin, 50);
  });
}
