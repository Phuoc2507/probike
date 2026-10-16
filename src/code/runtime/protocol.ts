// Message giữa luồng chính và Worker chạy code xe.

import type { ActuatorCommand, ControllerLog, PlotPoint, SensorFrame } from '@/shared/types';
import type { ControllerCoreOptions } from './core';

export type WorkerCoreOptions = Omit<ControllerCoreOptions, 'now'>;

export type ToWorker =
  | { type: 'load'; id: number; nonce: string; source: string; options: WorkerCoreOptions }
  | { type: 'tick'; id: number; frame: SensorFrame }
  | { type: 'params'; params: Record<string, number> };

export interface SerializedError { message: string; detail: string; line?: number }

/** Mọi tin trả về mang nonce bí mật do luồng chính cấp lúc load — tin giả mạo (không có nonce) bị bỏ. */
export type FromWorker =
  | { type: 'loaded'; id: number; nonce: string; ok: boolean; error?: SerializedError; logs: ControllerLog[]; plots: PlotPoint[] }
  | { type: 'ticked'; id: number; nonce: string; cmd?: ActuatorCommand; error?: SerializedError; logs: ControllerLog[]; plots: PlotPoint[] };
