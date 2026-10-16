// Hình học thuần (không phụ thuộc three.js) để kiểm tra luật trong Node/Worker.
// Quy ước xoay: Euler XYZ (độ) giống three.js — ma trận R = Rx · Ry · Rz.
import type { Vec3 } from '@/shared/types';

export type Mat3 = [number, number, number, number, number, number, number, number, number]; // hàng trước

const DEG = Math.PI / 180;

export function eulerXYZToMat3(rotationDeg: Vec3): Mat3 {
  const [ax, ay, az] = rotationDeg.map((d) => d * DEG);
  const a = Math.cos(ax), b = Math.sin(ax);
  const c = Math.cos(ay), d = Math.sin(ay);
  const e = Math.cos(az), f = Math.sin(az);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  // Giống Matrix4.makeRotationFromEuler(order 'XYZ') của three.js
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

export function mulMat3Vec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Hộp có hướng: tâm, nửa kích thước, 3 trục cục bộ (cột của ma trận xoay). */
export interface OBB {
  center: Vec3;
  half: Vec3;
  axes: [Vec3, Vec3, Vec3];
}

export function makeOBB(center: Vec3, size: Vec3, rotationDeg: Vec3): OBB {
  const m = eulerXYZToMat3(rotationDeg);
  return {
    center,
    half: [size[0] / 2, size[1] / 2, size[2] / 2],
    axes: [
      [m[0], m[3], m[6]],
      [m[1], m[4], m[7]],
      [m[2], m[5], m[8]],
    ],
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Bán kính chiếu của hộp lên trục `axis`. */
function projectRadius(box: OBB, axis: Vec3): number {
  return (
    box.half[0] * Math.abs(dot(box.axes[0], axis)) +
    box.half[1] * Math.abs(dot(box.axes[1], axis)) +
    box.half[2] * Math.abs(dot(box.axes[2], axis))
  );
}

/**
 * Hai hộp có chồng lấn sâu hơn `tolerance` (m) không — định lý trục phân tách (15 trục).
 * Chạm mặt nhau hoặc lấn ít hơn tolerance coi như không chồng lấn.
 */
export function obbOverlap(a: OBB, b: OBB, tolerance = 0.001): boolean {
  const t: Vec3 = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
  const axes: Vec3[] = [...a.axes, ...b.axes];
  for (const u of a.axes) for (const v of b.axes) {
    const c = cross(u, v);
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len > 1e-6) axes.push([c[0] / len, c[1] / len, c[2] / len]);
  }
  for (const axis of axes) {
    const dist = Math.abs(dot(t, axis));
    if (dist >= projectRadius(a, axis) + projectRadius(b, axis) - tolerance) return false;
  }
  return true;
}

/** Hộp bao thẳng trục (AABB) của một OBB. */
export function obbBounds(box: OBB): { min: Vec3; max: Vec3 } {
  const ext: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const unit: Vec3 = [0, 0, 0];
    unit[i] = 1;
    ext[i] = projectRadius(box, unit);
  }
  return {
    min: [box.center[0] - ext[0], box.center[1] - ext[1], box.center[2] - ext[2]],
    max: [box.center[0] + ext[0], box.center[1] + ext[1], box.center[2] + ext[2]],
  };
}
