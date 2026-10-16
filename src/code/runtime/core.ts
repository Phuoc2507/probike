// Lõi chạy code thí sinh — KHÔNG phụ thuộc Worker/DOM, test được trong Node.
// Lớp Worker (controller.worker.ts) chỉ bọc lõi này và trao đổi message.

import type { ActuatorCommand, ControllerLog, PlotPoint, SensorFrame } from '@/shared/types';
import { ApiError, ControllerError, WatchdogError, translateMessage } from './errors';
import { makePIDClass } from './pid';
import { GUARD_NAME, instrumentLoops } from './transform';

export interface ControllerCoreOptions {
  /** Thời gian tối đa cho mỗi lần loop(), ms. Mặc định 50. */
  watchdogMs?: number;
  /** Thời gian tối đa cho phần khai báo + setup(), ms. Mặc định 500. */
  setupWatchdogMs?: number;
  /** dt() ở lần loop đầu tiên, giây. Mặc định 0,01. */
  defaultDt?: number;
  /** Tên các linh kiện chấp hành hợp lệ (motor/servo). null = không kiểm tra tên. */
  actuators?: string[] | null;
  /** Tham số ban đầu cho param(name, macDinh) — nối với thanh trượt Kp/Ki/Kd. */
  params?: Record<string, number>;
  /** Số dòng print tối đa mỗi lần loop (chống tràn). Mặc định 20. */
  maxLogsPerTick?: number;
  /** Số điểm plot tối đa mỗi lần loop. Mặc định 50. */
  maxPlotsPerTick?: number;
  /** Đồng hồ (ms) — cho test. Mặc định performance.now(). */
  now?: () => number;
}

export type LoadResult = { ok: true } | { ok: false; error: string; line?: number };

const SOURCE_URL = 'probike-xe.js';
const STACK_RE_URL = /probike-xe\.js:(\d+):(\d+)/;
const STACK_RE_ANON = /<anonymous>:(\d+):(\d+)/;

/** Tên toàn cục bị chặn (che bằng tham số của hàm bọc). */
export const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'indexedDB', 'caches', 'navigator', 'location', 'postMessage', 'close',
  'window', 'document', 'self', 'globalThis', 'global', 'process', 'require', 'Function',
  'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'localStorage', 'sessionStorage',
] as const;

const NETWORK = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']);
const DOM = new Set(['window', 'document', 'self', 'globalThis', 'global', 'navigator', 'location', 'localStorage', 'sessionStorage', 'requestAnimationFrame']);

function blockedMessage(name: string): string {
  if (NETWORK.has(name)) return `Không được dùng mạng (${name}) trong code xe`;
  if (DOM.has(name)) return `Không được truy cập trình duyệt (${name}) trong code xe`;
  if (name === 'setTimeout' || name === 'setInterval' || name === 'queueMicrotask')
    return `Không dùng ${name} — mọi việc hãy làm trong loop(), dùng millis() để đếm thời gian`;
  return `Không được dùng "${name}" trong code xe`;
}

/** Vật thế chỗ cho tên bị chặn: gọi, đọc thuộc tính hay new đều ném lỗi tiếng Việt. */
function makeBlocked(name: string): unknown {
  const fail = () => { throw new ApiError(blockedMessage(name)); };
  return new Proxy(function blocked() { /* chặn */ }, {
    apply: fail, construct: fail, get: fail, set: fail, has: fail, getPrototypeOf: fail,
  });
}

const ENV = '__pb_env';

/**
 * Bọc code thí sinh. Mọi phần thêm vào đều nằm trên dòng 1 (trước code) hoặc sau dòng cuối → số dòng không lệch.
 * API khai báo ở hàm ngoài, code thí sinh ở hàm trong → thí sinh vẫn đặt lại được tên như min, map...
 */
function wrapSource(src: string, names: string[] = []): string {
  const decl = names.length ? `const {${names.join(',')}} = ${ENV};` : '';
  return `"use strict";${decl}return (function () {${src}\nreturn { setup: typeof setup === "function" ? setup : null, loop: typeof loop === "function" ? loop : null };\n})();\n//# sourceURL=${SOURCE_URL}`;
}

function stackLine(err: unknown): number | undefined {
  const stack = err && typeof err === 'object' && 'stack' in err ? String((err as Error).stack) : '';
  const m = stack.match(STACK_RE_URL) ?? stack.match(STACK_RE_ANON);
  return m ? Number(m[1]) : undefined;
}

// Hiệu chỉnh: dòng 1 của code thí sinh ứng với dòng nào trong stack của engine hiện tại.
let lineOffset: number | null | undefined;
function getLineOffset(): number | null {
  if (lineOffset !== undefined) return lineOffset;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(ENV, wrapSource('throw new Error("x")'))({});
    lineOffset = null;
  } catch (e) {
    const l = stackLine(e);
    lineOffset = l === undefined ? null : l - 1;
  }
  return lineOffset;
}

function userLine(err: unknown, maxLine: number): number | undefined {
  const off = getLineOffset();
  const l = stackLine(err);
  if (off === null || l === undefined) return undefined;
  const line = l - off;
  return line >= 1 && line <= maxLine ? line : undefined;
}

function compileError(src: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(ENV, wrapSource(src));
    return null;
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}

/** Tìm dòng lỗi cú pháp: dòng đầu tiên mà phần code tới dòng đó đã gây ra đúng lỗi này. */
// eof = true khi lỗi do thiếu ngoặc đóng (khi đó báo ở dòng cuối).
export function findSyntaxError(src: string): { line?: number; eof: boolean } | null {
  const full = compileError(src);
  if (!full) return null;
  const lines = src.split('\n');
  if (full === compileError('function __f() {')) return { line: lines.length, eof: true };
  for (let n = 1; n <= lines.length; n++) {
    if (compileError(lines.slice(0, n).join('\n')) === full) return { line: n, eof: false };
  }
  return { eof: false };
}

export function findSyntaxErrorLine(src: string): number | undefined {
  return findSyntaxError(src)?.line;
}

function fmtValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch { return String(v); }
}

function toNumber(v: unknown, what: string): number {
  const x = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  if (typeof v === 'string' && v.trim() === '') throw new ApiError(`${what}: cần một số, nhận được chuỗi rỗng`);
  if (!Number.isFinite(x)) throw new ApiError(`${what}: cần một số hợp lệ, nhận được ${fmtValue(v)}`);
  return x;
}

export class ControllerCore {
  private opts: Required<Omit<ControllerCoreOptions, 'actuators' | 'params'>>;
  private actuators: Set<string> | null;
  private params: Record<string, number>;
  private setupFn: (() => unknown) | null = null;
  private loopFn: (() => unknown) | null = null;
  private lineCount = 0;
  private loaded = false;
  private failed: ControllerError | null = null;

  // Trạng thái theo chu kỳ
  private frame: SensorFrame = { t: 0, values: {}, imu: null };
  private prevT: number | null = null;
  private curDt = 0.01;
  private cmd: ActuatorCommand = {};
  private logs: ControllerLog[] = [];
  private plots: PlotPoint[] = [];
  private logsThisTick = 0;
  private plotsThisTick = 0;
  private logDropped = false;
  private deadline = Infinity;
  private guardCount = 0;
  private budgetMs = 50;
  private phase: 'setup' | 'loop' = 'setup';

  constructor(options: ControllerCoreOptions = {}) {
    this.opts = {
      watchdogMs: options.watchdogMs ?? 50,
      setupWatchdogMs: options.setupWatchdogMs ?? 500,
      defaultDt: options.defaultDt ?? 0.01,
      maxLogsPerTick: options.maxLogsPerTick ?? 20,
      maxPlotsPerTick: options.maxPlotsPerTick ?? 50,
      now: options.now ?? (() => performance.now()),
    };
    this.actuators = options.actuators ? new Set(options.actuators) : null;
    this.params = { ...(options.params ?? {}) };
  }

  setParams(params: Record<string, number>): void {
    Object.assign(this.params, params);
  }

  setActuators(names: string[] | null): void {
    this.actuators = names ? new Set(names) : null;
  }

  /** Biên dịch, chạy phần khai báo toàn cục rồi setup(). */
  load(source: string): LoadResult {
    this.reset();
    this.lineCount = source.split('\n').length;
    const syntax = compileError(source);
    if (syntax) {
      const found = findSyntaxError(source);
      const line = found?.line;
      let detail: string;
      if (found?.eof) {
        detail = 'Thiếu dấu đóng } hoặc ) — kiểm tra các cặp ngoặc';
      } else {
        let raw: Error;
        try { new Function(ENV, wrapSource(source)); raw = new SyntaxError(syntax); } catch (e) { raw = e as Error; }
        detail = translateMessage(raw);
      }
      const err = new ControllerError(detail, line);
      this.failed = err;
      this.pushLog('error', err.message);
      return { ok: false, error: err.message, line };
    }

    const sandbox = this.buildSandbox();
    const names = Object.keys(sandbox);
    const instrumented = instrumentLoops(source);
    let fns: { setup: (() => unknown) | null; loop: (() => unknown) | null } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const factory = new Function(ENV, wrapSource(instrumented, names)) as (env: unknown) => typeof fns;
      this.startWatch(this.opts.setupWatchdogMs, 'setup');
      fns = factory(sandbox);
      if (!fns || !fns.loop) throw new ApiError('Chưa có hàm loop() — hãy viết function loop() { ... }');
      this.setupFn = fns.setup;
      this.loopFn = fns.loop;
      if (this.setupFn) this.setupFn();
      this.stopWatch();
    } catch (e) {
      this.stopWatch();
      const err = this.toControllerError(e);
      this.failed = err;
      this.pushLog('error', err.message);
      return { ok: false, error: err.message, line: err.line };
    }
    this.loaded = true;
    return { ok: true };
  }

  /** Gọi loop() đúng một lần với khung cảm biến này; trả lệnh cơ cấu chấp hành (giữ giá trị từ lần trước). */
  tick(frame: SensorFrame): ActuatorCommand {
    if (this.failed) throw this.failed;
    if (!this.loaded || !this.loopFn) throw new ControllerError('Chưa nạp code (gọi load trước)');
    this.frame = frame;
    this.curDt = this.prevT === null ? this.opts.defaultDt : Math.max(0, frame.t - this.prevT);
    this.prevT = frame.t;
    this.logsThisTick = 0;
    this.plotsThisTick = 0;
    try {
      this.startWatch(this.opts.watchdogMs, 'loop');
      this.loopFn();
      const elapsed = this.stopWatch();
      // Vòng lặp đã có guard; kiểm tra sau để bắt code nặng không có vòng lặp (đệ quy). Nới 2× tránh dừng nhầm khi GC.
      if (elapsed > this.opts.watchdogMs * 2) throw new WatchdogError(this.watchdogMessage());
    } catch (e) {
      this.stopWatch();
      const err = this.toControllerError(e);
      this.failed = err;
      this.pushLog('error', err.message);
      throw err;
    }
    return { ...this.cmd };
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

  get error(): ControllerError | null {
    return this.failed;
  }

  // ------------------------------------------------------------ nội bộ

  private reset(): void {
    this.setupFn = null;
    this.loopFn = null;
    this.loaded = false;
    this.failed = null;
    this.frame = { t: 0, values: {}, imu: null };
    this.prevT = null;
    this.curDt = this.opts.defaultDt;
    this.cmd = {};
    this.logs = [];
    this.plots = [];
    this.logDropped = false;
  }

  private startWatch(ms: number, phase: 'setup' | 'loop'): void {
    this.budgetMs = ms;
    this.phase = phase;
    this.guardCount = 0;
    this.deadline = this.opts.now() + ms;
  }

  private stopWatch(): number {
    const elapsed = this.opts.now() - (this.deadline - this.budgetMs);
    this.deadline = Infinity;
    return elapsed;
  }

  private watchdogMessage(): string {
    return this.phase === 'loop'
      ? `loop() chạy quá ${this.budgetMs} ms — có vòng lặp vô hạn hoặc tính toán quá nặng? loop() được gọi lặp lại sẵn, không cần while(true)`
      : `Phần khởi động (setup) chạy quá ${this.budgetMs} ms — có vòng lặp vô hạn?`;
  }

  private guard = (): boolean => {
    if ((++this.guardCount & 63) === 0 && this.opts.now() > this.deadline) {
      throw new WatchdogError(this.watchdogMessage());
    }
    return true;
  };

  private toControllerError(e: unknown): ControllerError {
    if (e instanceof ControllerError) return e;
    return new ControllerError(translateMessage(e), userLine(e, this.lineCount));
  }

  private pushLog(level: 'log' | 'error', text: string): void {
    if (this.logs.length >= 2000) this.logs.shift();
    this.logs.push({ t: this.frame.t, level, text });
  }

  private checkActuator(fn: string, name: unknown): string {
    if (typeof name !== 'string' || name === '') throw new ApiError(`${fn}(tên, ...): chưa chọn tên linh kiện`);
    if (this.actuators && !this.actuators.has(name)) {
      const list = [...this.actuators].join(', ') || '(chưa có)';
      throw new ApiError(`${fn}("${name}"): xe không có linh kiện tên "${name}". Các tên có: ${list}`);
    }
    return name;
  }

  private readValue(fn: string, name: unknown): number | number[] {
    if (typeof name !== 'string' || name === '') throw new ApiError(`${fn}(tên): chưa chọn tên cảm biến`);
    const v = this.frame.values[name];
    if (v === undefined) {
      const list = Object.keys(this.frame.values).join(', ') || '(chưa có)';
      throw new ApiError(`${fn}("${name}"): không có cảm biến tên "${name}". Các tên đọc được: ${list}`);
    }
    return Array.isArray(v) ? v.slice() : v;
  }

  private imuValue(key: 'roll' | 'pitch' | 'yaw' | 'gx' | 'gy' | 'gz' | 'ax' | 'ay' | 'az'): number {
    const imu = this.frame.imu;
    if (!imu) throw new ApiError('Xe chưa lắp IMU (MPU6050/MPU9250) nên không đọc được imu');
    switch (key) {
      case 'roll': return imu.roll;
      case 'pitch': return imu.pitch;
      case 'yaw': return imu.yaw;
      case 'gx': return imu.gyro[0];
      case 'gy': return imu.gyro[1];
      case 'gz': return imu.gyro[2];
      case 'ax': return imu.acc[0];
      case 'ay': return imu.acc[1];
      case 'az': return imu.acc[2];
    }
  }

  /** Các tên mà code thí sinh nhìn thấy (truyền làm tham số của hàm bọc). */
  private buildSandbox(): Record<string, unknown> {
    const core = this;
    const sb: Record<string, unknown> = {};
    for (const name of BLOCKED_GLOBALS) sb[name] = makeBlocked(name);
    sb[GUARD_NAME] = this.guard;

    const imu = Object.freeze({
      roll: () => core.imuValue('roll'),
      pitch: () => core.imuValue('pitch'),
      yaw: () => core.imuValue('yaw'),
      gyroX: () => core.imuValue('gx'),
      gyroY: () => core.imuValue('gy'),
      gyroZ: () => core.imuValue('gz'),
      accX: () => core.imuValue('ax'),
      accY: () => core.imuValue('ay'),
      accZ: () => core.imuValue('az'),
    });

    Object.assign(sb, {
      imu,
      PID: makePIDClass(),
      millis: () => Math.round(core.frame.t * 1000),
      dt: () => core.curDt,
      read: (name: unknown) => core.readValue('read', name),
      encoder: (name: unknown) => {
        const v = core.readValue('encoder', name);
        return Array.isArray(v) ? v[0] ?? 0 : v;
      },
      motor: (name: unknown, value: unknown) => {
        const n = core.checkActuator('motor', name);
        const v = toNumber(value, `motor("${n}", ...)`);
        core.cmd[n] = Math.max(-1, Math.min(1, v));
      },
      servo: (name: unknown, deg: unknown) => {
        const n = core.checkActuator('servo', name);
        core.cmd[n] = toNumber(deg, `servo("${n}", ...)`);
      },
      print: (...args: unknown[]) => {
        if (core.logsThisTick >= core.opts.maxLogsPerTick) {
          if (!core.logDropped) {
            core.logDropped = true;
            core.pushLog('log', `(print quá ${core.opts.maxLogsPerTick} lần trong một vòng loop — bỏ bớt dòng)`);
          }
          return;
        }
        core.logsThisTick++;
        core.pushLog('log', args.map(fmtValue).join(' '));
      },
      plot: (label: unknown, value: unknown) => {
        if (core.plotsThisTick >= core.opts.maxPlotsPerTick) return;
        core.plotsThisTick++;
        const v = Number(value);
        if (!Number.isFinite(v)) return;
        if (core.plots.length >= 20000) core.plots.shift();
        core.plots.push({ t: core.frame.t, label: String(label), value: v });
      },
      param: (name: unknown, fallback: unknown) => {
        const v = core.params[String(name)];
        return typeof v === 'number' && Number.isFinite(v) ? v : Number(fallback ?? 0);
      },
      constrain: (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi),
      map: (x: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
        inMax === inMin ? outMin : ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      sqrt: Math.sqrt,
      pow: Math.pow,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      atan2: Math.atan2,
      PI: Math.PI,
    });
    return sb;
  }
}
