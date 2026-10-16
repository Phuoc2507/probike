// ControllerRuntime chạy ngay trên luồng hiện tại (không Worker): dùng cho test, mô phỏng headless trong Node,
// hoặc khi trình duyệt không tạo được Worker. Watchdog vẫn hoạt động nhờ guard chèn vào vòng lặp.

import type { ActuatorCommand, ControllerLog, ControllerRuntime, PlotPoint, SensorFrame } from '@/shared/types';
import { ControllerCore, type ControllerCoreOptions } from './core';

export class LocalControllerRuntime implements ControllerRuntime {
  readonly core: ControllerCore;

  constructor(options: ControllerCoreOptions = {}) {
    this.core = new ControllerCore(options);
  }

  async load(source: string): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.core.load(source);
  }

  /** Bản đồng bộ của load — tiện cho vòng mô phỏng chạy nhanh. */
  loadSync(source: string) {
    return this.core.load(source);
  }

  async tick(frame: SensorFrame): Promise<ActuatorCommand> {
    return this.core.tick(frame);
  }

  /** Bản đồng bộ của tick. */
  tickSync(frame: SensorFrame): ActuatorCommand {
    return this.core.tick(frame);
  }

  setParams(params: Record<string, number>): void {
    this.core.setParams(params);
  }

  drainLogs(): ControllerLog[] {
    return this.core.drainLogs();
  }

  drainPlots(): PlotPoint[] {
    return this.core.drainPlots();
  }

  dispose(): void {
    /* không có tài nguyên cần giải phóng */
  }
}
