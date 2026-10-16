// Thiết kế xe mẫu + bộ điều khiển PID mẫu (TypeScript) — dùng cho test, hướng dẫn và làm điểm xuất phát.
// Xe: ESP32, MPU6050, động cơ bánh đà BLDC Nidec 24H + đĩa thép Ø100, N20 kéo bánh sau, pin 18650 ×2.

import type { ActuatorCommand, SensorFrame, VehicleDesign } from '@/shared/types';

const R = 0.034; // bán kính bánh BTC

export const SAMPLE_DESIGN: VehicleDesign = {
  version: 1,
  name: 'Xe mẫu ProBike',
  frame: { wheelbase: 0.16, height: 0.12, material: 'mica', massKg: 0, steerable: false },
  parts: [
    { uid: 'w_rear', itemId: 'wheel_btc', name: 'banhSau', position: [-0.08, R, 0], rotationDeg: [0, 0, 0] },
    { uid: 'w_front', itemId: 'wheel_btc', name: 'banhTruoc', position: [0.08, R, 0], rotationDeg: [0, 0, 0] },
    { uid: 'mcu', itemId: 'esp32', name: 'esp32', position: [0.05, 0.1, 0], rotationDeg: [0, 0, 0] },
    { uid: 'imu', itemId: 'mpu6050', name: 'imu', position: [0, 0.09, 0], rotationDeg: [0, 0, 0], pin: 'I2C' },
    { uid: 'rw_motor', itemId: 'motor_rw_bldc', name: 'banhDa', position: [-0.02, 0.12, 0], rotationDeg: [0, 0, 0], pin: 'D25' },
    { uid: 'rw_disc', itemId: 'flywheel_steel_100', name: 'diaBanhDa', position: [0, 0.12, 0], rotationDeg: [0, 0, 0], attachTo: 'rw_motor' },
    { uid: 'rw_enc', itemId: 'encoder_hall', name: 'encBanhDa', position: [-0.035, 0.12, 0], rotationDeg: [0, 0, 0], attachTo: 'rw_motor', pin: 'D34' },
    { uid: 'drive', itemId: 'motor_n20', name: 'dongCoSau', position: [-0.08, R, 0.022], rotationDeg: [0, 90, 0], attachTo: 'w_rear', pin: 'D26' },
    { uid: 'drv', itemId: 'tb6612', name: 'driver', position: [0.03, 0.07, 0], rotationDeg: [0, 0, 0] },
    { uid: 'bat', itemId: 'battery_18650x2', name: 'pin', position: [0, 0.06, 0], rotationDeg: [0, 0, 0] },
  ],
};

export interface BalanceGains {
  /** Hệ số theo góc nghiêng (1/độ). */
  kp: number;
  /** Hệ số theo tốc độ nghiêng (1/(độ/s)). */
  kd: number;
  /** Hệ số theo tốc độ bánh đà (1/(vòng/s)) — xả dần động lượng để bánh đà không bão hoà. */
  kw: number;
  /** Tích phân góc (1/(độ·s)) — bù lệch lắp IMU. */
  ki: number;
}

export const SAMPLE_GAINS: BalanceGains = { kp: 0.4, kd: 0.035, kw: 0.07, ki: 0 };

/**
 * Bộ điều khiển cân bằng mẫu. Quy ước dấu (giống ví dụ PLAN mục 7): lệnh bánh đà dương đẩy thân
 * nghiêng về phía roll dương, nên lệnh = −(Kp·roll + Kd·gyroX) + Kw·tốcĐộBánhĐà.
 */
export class SampleBalanceController {
  private integ = 0;
  /** Góc nghiêng mong muốn (độ). Khi vào cua phải nghiêng vào trong: atan(v²/(R·g)). */
  rollTarget = 0;

  constructor(
    public gains: BalanceGains = SAMPLE_GAINS,
    public names = { flywheel: 'banhDa', encoder: 'encBanhDa', drive: 'dongCoSau' },
    /** Lệnh động cơ kéo (−1..1). 0 = đứng yên giữ thăng bằng. */
    public drive = 0,
  ) {}

  update(frame: SensorFrame, dt: number): ActuatorCommand {
    const imu = frame.imu;
    if (!imu) return { [this.names.flywheel]: 0, [this.names.drive]: 0 };
    const { kp, kd, kw, ki } = this.gains;
    const w = Number(frame.values[this.names.encoder] ?? 0);
    const err = imu.roll - this.rollTarget;
    this.integ = Math.max(-20, Math.min(20, this.integ + err * dt));
    const u = -(kp * err + kd * imu.gyro[0] + ki * this.integ) + kw * w;
    return {
      [this.names.flywheel]: Math.max(-1, Math.min(1, u)),
      [this.names.drive]: Math.abs(imu.roll) < 30 ? this.drive : 0,
    };
  }

  reset(): void {
    this.integ = 0;
  }
}

/** Cùng thuật toán viết theo API thí sinh (PLAN mục 7) — mẫu cho trình soạn code. */
export const SAMPLE_BALANCE_CODE = `// Cân bằng bằng bánh đà: PD theo góc nghiêng + xả tốc độ bánh đà
const Kp = ${SAMPLE_GAINS.kp};    // theo góc (độ)
const Kd = ${SAMPLE_GAINS.kd};  // theo tốc độ nghiêng (độ/giây)
const Kw = ${SAMPLE_GAINS.kw};  // theo tốc độ bánh đà (vòng/giây)

function setup() {
  print("Xe mẫu khởi động");
}

function loop() {
  const goc = imu.roll();
  const tocDoGoc = imu.gyroX();
  const w = encoder("encBanhDa");
  const u = -(Kp * goc + Kd * tocDoGoc) + Kw * w;
  motor("banhDa", constrain(u, -1, 1));
  motor("dongCoSau", 0.5);
  plot("goc", goc);
}
`;
