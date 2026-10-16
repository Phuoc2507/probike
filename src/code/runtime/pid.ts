// Bộ điều khiển PID dùng trong code thí sinh: const pid = new PID(kp, ki, kd); pid.update(saiSo, dt)

export interface PIDLike {
  kp: number;
  ki: number;
  kd: number;
  update(error: number, dt: number): number;
  reset(): void;
}

/** Tạo một lớp PID mới (mỗi sandbox một lớp riêng để code thí sinh sửa prototype không ảnh hưởng nơi khác). */
export function makePIDClass() {
  return class PID implements PIDLike {
    kp: number;
    ki: number;
    kd: number;
    /** Giới hạn đầu ra (mặc định không giới hạn). Đặt bằng pid.setLimits(min, max). */
    outMin = -Infinity;
    outMax = Infinity;
    integral = 0;
    prevError = 0;
    private first = true;

    constructor(kp = 0, ki = 0, kd = 0) {
      this.kp = Number(kp);
      this.ki = Number(ki);
      this.kd = Number(kd);
    }

    update(error: number, dt: number): number {
      const e = Number(error);
      const h = Number(dt);
      if (!Number.isFinite(e)) throw new Error('PID.update: sai số (error) không phải số hợp lệ');
      let derivative = 0;
      if (Number.isFinite(h) && h > 0) {
        this.integral += e * h;
        if (!this.first) derivative = (e - this.prevError) / h;
      }
      this.first = false;
      this.prevError = e;
      let out = this.kp * e + this.ki * this.integral + this.kd * derivative;
      // Chống bão hoà tích phân (anti-windup): nếu đầu ra bị kẹp thì không tích luỹ thêm
      if (out > this.outMax) {
        if (Number.isFinite(h) && h > 0 && this.ki !== 0 && e > 0) this.integral -= e * h;
        out = this.outMax;
      } else if (out < this.outMin) {
        if (Number.isFinite(h) && h > 0 && this.ki !== 0 && e < 0) this.integral -= e * h;
        out = this.outMin;
      }
      return out;
    }

    setLimits(min: number, max: number): void {
      this.outMin = Number(min);
      this.outMax = Number(max);
    }

    setTunings(kp: number, ki: number, kd: number): void {
      this.kp = Number(kp);
      this.ki = Number(ki);
      this.kd = Number(kd);
    }

    reset(): void {
      this.integral = 0;
      this.prevError = 0;
      this.first = true;
    }
  };
}

export const PID = makePIDClass();
export type PIDInstance = InstanceType<typeof PID>;
