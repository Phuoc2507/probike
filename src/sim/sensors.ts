// Mô hình cảm biến: lấy mẫu đúng tần số rateHz, trả giá trị sau độ trễ latencyMs, cộng nhiễu Gauss
// theo seed. Mức "độ thực tế" nhân hệ số nhiễu/độ trễ. Đơn vị đọc: khoảng cách cm, encoder vòng/giây,
// IMU độ, độ/giây, m/s², IR phản xạ 0/1, LiDAR mảng cm (mỗi độ một tia nếu samples = 360).

import type { Realism, SensorFrame, SensorValue, Vec3 } from '@/shared/types';
import { DEG, RAD, Rng, eulerYZX, qConj, qMul, qRotate, v3 } from './math';
import type { Q4, V3 } from './math';
import type { SensorModel } from './vehicle';

export const NOISE_FACTOR: Record<Realism, number> = { low: 0.25, medium: 1, high: 2 };
export const LATENCY_FACTOR: Record<Realism, number> = { low: 0.5, medium: 1, high: 1.5 };

export const GRAVITY = 9.81;

export interface RayHit {
  dist: number;     // m
  normal: V3;       // pháp tuyến bề mặt (thế giới)
  white: boolean;   // bề mặt trắng (vách, vạch sơn) — dùng cho IR phản xạ
}

/** Những gì cảm biến được phép "nhìn" từ lõi vật lý tại thời điểm lấy mẫu. */
export interface SensorContext {
  t: number;
  position: V3;          // gốc xe (thế giới)
  rotation: Q4;          // hướng thân
  angvel: V3;            // rad/s, thế giới
  /** Gia tốc tuyến tính (m/s², thế giới) tại một điểm trên thân, hệ xe. */
  accelAt(local: V3): V3;
  castRay(origin: V3, dir: V3, maxDist: number): RayHit | null;
  /** Tốc độ trục (vòng/giây) của động cơ kéo / bánh đà / bánh xe, dấu dương = chiều lệnh dương. */
  shaftRps(target: NonNullable<SensorModel['target']>): number;
}

export type ImuReading = NonNullable<SensorFrame['imu']>;

interface Pending { ready: number; value: SensorValue | ImuReading }

// ---------------------------------------------------------------- Sharp GP2Y0A21

/** Đường cong điện áp (V) theo khoảng cách (cm) của Sharp GP2Y0A21: đỉnh ~3,1 V ở 7 cm, gập lại khi gần hơn. */
export function sharpVoltage(dCm: number): number {
  const PEAK = 7;
  const v = (d: number) => 27.86 / (d + 0.42) * 0.83 + 0.1;
  if (dCm >= PEAK) return v(dCm);
  return 0.25 + (v(PEAK) - 0.25) * Math.max(0, dCm) / PEAK;
}

/** Khoảng cách (cm) suy ngược từ điện áp — công thức tra bảng thường dùng. */
export function sharpDistance(volt: number): number {
  return 27.86 * 0.83 / Math.max(volt - 0.1, 0.05) - 0.42;
}

// ---------------------------------------------------------------- Kênh cảm biến

export class SensorChannel {
  readonly model: SensorModel;
  readonly period: number;
  readonly latency: number;
  private next = 0;
  private queue: Pending[] = [];
  current: SensorValue | ImuReading;
  private readonly nf: number;
  private readonly rng: Rng;
  // IMU: sai số lắp đặt & lệch không của gyro, cố định trong một lượt chạy
  private readonly rollBias: number;
  private readonly pitchBias: number;
  private readonly gyroBias: Vec3;
  private readonly yawDrift: number;

  constructor(model: SensorModel, realism: Realism, rng: Rng, ctx: SensorContext) {
    this.model = model;
    this.rng = rng;
    this.nf = NOISE_FACTOR[realism];
    this.period = 1 / Math.max(1, model.spec.rateHz);
    this.latency = (model.spec.latencyMs / 1000) * LATENCY_FACTOR[realism];
    const isImu = model.spec.kind === 'imu';
    this.rollBias = isImu ? rng.gauss(0.2 * this.nf) : 0;
    this.pitchBias = isImu ? rng.gauss(0.2 * this.nf) : 0;
    this.gyroBias = isImu ? [rng.gauss(0.2 * this.nf), rng.gauss(0.2 * this.nf), rng.gauss(0.2 * this.nf)] : [0, 0, 0];
    // MPU6050 không có la bàn → yaw trôi dần; MPU9250 có la bàn → không trôi
    this.yawDrift = isImu && model.itemId === 'mpu6050' ? 0.02 * this.nf * rng.sign() : 0;
    // giá trị khởi động: đo ngay tại t = 0, không trễ
    this.current = this.measure(ctx);
    this.next = this.period;
  }

  /** Gọi mỗi bước vật lý: lấy mẫu nếu tới lịch, đẩy giá trị đã hết trễ ra `current`. */
  update(ctx: SensorContext): void {
    const t = ctx.t;
    while (this.next <= t + 1e-9) {
      this.queue.push({ ready: this.next + this.latency, value: this.measure(ctx) });
      this.next += this.period;
    }
    while (this.queue.length && this.queue[0].ready <= t + 1e-9) {
      this.current = this.queue.shift()!.value;
    }
  }

  private worldPose(ctx: SensorContext, localDir: V3): { origin: V3; dir: V3 } {
    const origin = v3(...addV(ctx.position, qRotate(ctx.rotation, this.model.position)));
    const dir = qRotate(qMul(ctx.rotation, this.model.mount), localDir);
    return { origin, dir };
  }

  measure(ctx: SensorContext): SensorValue | ImuReading {
    const s = this.model.spec;
    const nf = this.nf;
    const rng = this.rng;
    switch (s.kind) {
      case 'imu': {
        const e = eulerYZX(ctx.rotation);
        const inv = qConj(ctx.rotation);
        const w = qRotate(inv, ctx.angvel);
        const a = ctx.accelAt(this.model.position);
        const f = qRotate(inv, v3(a.x, a.y + GRAVITY, a.z));
        const n = s.noiseStd * nf;
        return {
          roll: e.roll + this.rollBias + rng.gauss(n),
          pitch: e.pitch + this.pitchBias + rng.gauss(n),
          yaw: e.yaw + this.yawDrift * ctx.t + rng.gauss(n),
          gyro: [
            w.x * RAD + this.gyroBias[0] + rng.gauss(2 * n),
            w.y * RAD + this.gyroBias[1] + rng.gauss(2 * n),
            w.z * RAD + this.gyroBias[2] + rng.gauss(2 * n),
          ],
          acc: [f.x + rng.gauss(0.1 * n), f.y + rng.gauss(0.1 * n), f.z + rng.gauss(0.1 * n)],
        };
      }
      case 'encoder': {
        const rps = this.model.target ? ctx.shaftRps(this.model.target) : 0;
        return rps + rng.gauss(s.noiseStd * nf);
      }
      case 'ultrasonic': {
        const maxR = s.maxRange ?? 4;
        const minR = s.minRange ?? 0.02;
        if (rng.next() < 0.01 * nf) return maxR * 100; // mất tiếng vọng
        const half = ((s.fovDeg ?? 15) / 2) * DEG;
        let best = Infinity;
        for (const [elev, n] of [[0, 1], [half / 2, 6], [half, 8]] as [number, number][]) {
          for (let k = 0; k < n; k++) {
            const az = (k / n) * 2 * Math.PI;
            const local = v3(Math.cos(elev), Math.sin(elev) * Math.cos(az), Math.sin(elev) * Math.sin(az));
            const { origin, dir } = this.worldPose(ctx, local);
            const hit = ctx.castRay(origin, dir, maxR);
            if (!hit) continue;
            // sóng âm tới quá xiên (> 55° so với pháp tuyến) phản xạ đi nơi khác, không về cảm biến
            const cosInc = Math.abs(dir.x * hit.normal.x + dir.y * hit.normal.y + dir.z * hit.normal.z);
            if (cosInc < Math.cos(55 * DEG)) continue;
            best = Math.min(best, hit.dist);
          }
        }
        if (!isFinite(best)) return maxR * 100;
        const d = Math.max(best, minR) * 100 + rng.gauss(s.noiseStd * nf);
        return clampCm(d, minR, maxR);
      }
      case 'tof_laser': {
        const maxR = s.maxRange ?? 2;
        const minR = s.minRange ?? 0.03;
        const { origin, dir } = this.worldPose(ctx, v3(1, 0, 0));
        const hit = ctx.castRay(origin, dir, maxR);
        if (!hit) return maxR * 100;
        const dCm = hit.dist * 100;
        const d = Math.max(hit.dist, minR) * 100 + rng.gauss(s.noiseStd * nf * (1 + dCm / 100));
        return clampCm(d, minR, maxR);
      }
      case 'ir_distance': {
        const maxR = s.maxRange ?? 0.8;
        const { origin, dir } = this.worldPose(ctx, v3(1, 0, 0));
        // tia đo dài hơn tầm danh định để mô phỏng đường cong ngoài tầm
        const hit = ctx.castRay(origin, dir, maxR * 1.5);
        const dTrue = hit ? hit.dist * 100 : maxR * 150;
        // nhiễu cộng vào điện áp → sai số tăng nhanh theo khoảng cách (phi tuyến)
        const volt = sharpVoltage(dTrue) + rng.gauss(0.03 * s.noiseStd * nf);
        const d = sharpDistance(volt);
        return Math.max(4, Math.min(maxR * 150, d));
      }
      case 'ir_reflect': {
        const maxR = s.maxRange ?? 0.015;
        const { origin, dir } = this.worldPose(ctx, v3(1, 0, 0));
        const hit = ctx.castRay(origin, dir, maxR);
        if (!hit) return 0;
        // bề mặt trắng phản xạ mạnh trong toàn tầm; nền xám chỉ "thấy" khi rất gần
        return hit.white || hit.dist <= maxR * 0.4 ? 1 : 0;
      }
      case 'lidar_360': {
        const maxR = s.maxRange ?? 12;
        const minR = s.minRange ?? 0.02;
        const n = Math.max(4, s.samples ?? 360);
        const out: number[] = new Array(n);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 2 * Math.PI;
          const { origin, dir } = this.worldPose(ctx, v3(Math.cos(a), 0, Math.sin(a)));
          const hit = ctx.castRay(origin, dir, maxR);
          if (!hit) { out[i] = maxR * 100; continue; }
          out[i] = clampCm(Math.max(hit.dist, minR) * 100 + rng.gauss(s.noiseStd * nf), minR, maxR);
        }
        return out;
      }
    }
  }
}

function clampCm(d: number, minR: number, maxR: number): number {
  return Math.max(minR * 100, Math.min(maxR * 100, d));
}

function addV(a: V3, b: V3): [number, number, number] {
  return [a.x + b.x, a.y + b.y, a.z + b.z];
}

/** Gốc tia/hướng tia của cảm biến trong thế giới — để phần hiển thị vẽ tia đo nếu cần. */
export function sensorRay(model: SensorModel, position: V3, rotation: Q4): { origin: V3; dir: V3 } {
  const origin = v3(...addV(position, qRotate(rotation, model.position)));
  const dir = qRotate(qMul(rotation, model.mount), v3(1, 0, 0));
  return { origin, dir };
}

