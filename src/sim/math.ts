// Tiện ích toán học nhỏ cho lõi mô phỏng: vector, quaternion, số ngẫu nhiên theo seed.
// Không phụ thuộc three.js để chạy headless (Worker, Vitest).

import type { Quat, Vec3 } from '@/shared/types';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export interface V3 { x: number; y: number; z: number }
export interface Q4 { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const fromVec3 = (a: Vec3): V3 => ({ x: a[0], y: a[1], z: a[2] });
export const toVec3 = (a: V3): Vec3 => [a.x, a.y, a.z];
export const toQuat = (q: Q4): Quat => [q.x, q.y, q.z, q.w];

export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: V3): V3 => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : v3(1, 0, 0);
};

export const qIdentity = (): Q4 => ({ x: 0, y: 0, z: 0, w: 1 });

export function qMul(a: Q4, b: Q4): Q4 {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export const qConj = (q: Q4): Q4 => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qAxisAngle(axis: V3, angle: number): Q4 {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(angle / 2) };
}

/** Xoay vector theo quaternion. */
export function qRotate(q: Q4, v: V3): V3 {
  // v' = v + 2w(u×v) + 2u×(u×v), u = (x,y,z)
  const u = v3(q.x, q.y, q.z);
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}

/** Euler XYZ (độ), cùng quy ước với three.js (R = Rx·Ry·Rz). */
export function qFromEulerDeg(e: Vec3): Q4 {
  const qx = qAxisAngle(v3(1, 0, 0), e[0] * DEG);
  const qy = qAxisAngle(v3(0, 1, 0), e[1] * DEG);
  const qz = qAxisAngle(v3(0, 0, 1), e[2] * DEG);
  return qMul(qMul(qx, qy), qz);
}

/** Quaternion quay trục x thành hướng ngang có góc `heading` (rad, dương quay về +z). */
export function qHeading(heading: number): Q4 {
  // Quay quanh +y một góc dương đưa x về -z, nên dùng -heading.
  return qAxisAngle(v3(0, 1, 0), -heading);
}

/** Ma trận 3x3 → quaternion (cột là các trục). */
export function qFromBasis(c0: V3, c1: V3, c2: V3): Q4 {
  const m00 = c0.x, m10 = c0.y, m20 = c0.z;
  const m01 = c1.x, m11 = c1.y, m21 = c1.z;
  const m02 = c2.x, m12 = c2.y, m22 = c2.z;
  const tr = m00 + m11 + m22;
  let q: Q4;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/**
 * Góc Euler của thân xe theo thứ tự yaw (quanh y) → pitch (quanh z) → roll (quanh x), độ.
 * Dấu theo quy tắc bàn tay phải quanh trục của thân: roll dương = nóc xe nghiêng về +z
 * (hợp đồng gọi +z là "trái"), pitch dương = đầu xe ngóc lên, yaw dương = mũi xe quay từ +x về −z.
 */
export function eulerYZX(q: Q4): { roll: number; pitch: number; yaw: number } {
  const f = qRotate(q, v3(1, 0, 0));
  const u = qRotate(q, v3(0, 1, 0));
  const l = qRotate(q, v3(0, 0, 1));
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
  const yaw = Math.atan2(-f.z, f.x);
  const roll = Math.atan2(-l.y, u.y);
  return { roll: roll * RAD, pitch: pitch * RAD, yaw: yaw * RAD };
}

// ---------------------------------------------------------------- Số ngẫu nhiên theo seed

/** Bộ sinh số ngẫu nhiên mulberry32 — cùng seed cho cùng dãy số trên mọi máy. */
export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  }

  /** Số đều trong [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Phân phối chuẩn N(0, std²) (Box–Muller). */
  gauss(std = 1): number {
    if (std === 0) return 0;
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s * std;
    }
    let u = 0;
    while (u <= 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v) * std;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/** Trộn seed với một hằng số để tách các dòng ngẫu nhiên độc lập (đá, nhiễu cảm biến, đẩy...). */
export function subSeed(seed: number, stream: number): number {
  let h = (Math.floor(seed) * 0x85ebca6b) ^ (stream * 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 13)) >>> 0;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
