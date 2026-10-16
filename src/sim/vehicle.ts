// Phân tích VehicleDesign thành mô hình vật lý: khối lượng, trọng tâm, quán tính của thân,
// thông số 2 bánh, động cơ kéo, bánh đà, servo lái, cảm biến. Hàm thuần, không phụ thuộc Rapier.

import type { CatalogItem, MotorSpec, PlacedPart, SensorSpec, VehicleDesign } from '@/shared/types';
import { CATALOG_BY_ID, FRAME_AREAL_DENSITY } from '@/shared/catalog';
import { add, fromVec3, length, qFromBasis, qFromEulerDeg, qIdentity, qRotate, scale, sub, v3 } from './math';
import type { Q4, V3 } from './math';

export const DEFAULT_LOOP_HZ = 100;
/** Quán tính rotor động cơ bánh đà khi không gắn đĩa (kg·m²) — gần như vô dụng, đúng như xe thật. */
export const BARE_ROTOR_INERTIA = 2e-6;
/** Khung coi như tấm dày 2 cm theo z (hộp bao gồm cả nẹp, ốc). */
export const FRAME_THICKNESS = 0.02;

export interface WheelModel {
  uid: string;
  name: string;
  center: V3;            // hệ toạ độ xe
  radius: number;
  width: number;
  friction: number;
  mass: number;
  /** Quán tính quanh trục bánh (vành + lốp ≈ 0,6·m·r²). */
  spinInertia: number;
  front: boolean;
}

export interface DriveMotorModel {
  uid: string;
  name: string;
  spec: MotorSpec;
  wheelUid: string;
}

export interface ReactionWheelModel {
  uid: string;           // uid động cơ
  name: string;          // tên động cơ (dùng trong motor("..."))
  spec: MotorSpec;
  flywheelUid: string | null;
  flywheelName: string | null;
  position: V3;          // tâm đĩa (hoặc động cơ), hệ xe
  /** Quán tính quay của rotor + đĩa quanh trục quay. */
  spinInertia: number;
  /** +1: trục quay trùng +x của xe, −1: ngược lại (lắp quay 180°). */
  axisSign: 1 | -1;
}

export interface ServoModel {
  uid: string;
  name: string;
  spec: MotorSpec;
  /** Giới hạn góc lái thực tế (độ). */
  maxSteerDeg: number;
  /** Tốc độ quay (độ/giây). */
  slewDegPerS: number;
}

export interface SensorModel {
  uid: string;
  name: string;
  itemId: string;
  spec: SensorSpec;
  position: V3;
  mount: Q4;             // hướng lắp (tia đo theo +x cục bộ)
  /** Khoảng từ tâm hộp tới mặt phát tia (nửa chiều dài theo x cục bộ). */
  faceOffset: number;
  /** encoder: đối tượng đo (động cơ kéo/bánh đà/bánh xe). */
  target?: { type: 'drive' | 'reaction' | 'wheel'; uid: string };
}

export interface ColliderBox { uid: string; center: V3; half: V3; rotation: Q4 }

export interface VehicleModel {
  /** Thân cứng (khung + linh kiện, KHÔNG gồm 2 bánh và phần quay của bánh đà quanh trục). */
  chassis: {
    mass: number;
    com: V3;
    principalInertia: V3;
    inertiaFrame: Q4;
    boxes: ColliderBox[];
  };
  wheels: WheelModel[];
  rear: WheelModel;
  front: WheelModel;
  drives: DriveMotorModel[];
  reactions: ReactionWheelModel[];
  steering: ServoModel | null;
  servos: ServoModel[];
  sensors: SensorModel[];
  loopHz: number;
  totalMass: number;
  centerOfMass: V3;
  warnings: string[];
}

type M3 = number[][]; // 3x3

const zero3 = (): M3 => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

function addInto(a: M3, b: M3): void {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i][j] += b[i][j];
}

/** Ma trận quay từ quaternion (cột = trục). */
function rotMatrix(q: Q4): M3 {
  const c0 = qRotate(q, v3(1, 0, 0));
  const c1 = qRotate(q, v3(0, 1, 0));
  const c2 = qRotate(q, v3(0, 0, 1));
  return [[c0.x, c1.x, c2.x], [c0.y, c1.y, c2.y], [c0.z, c1.z, c2.z]];
}

/** R·diag(d)·Rᵀ */
function rotateDiag(q: Q4, d: V3): M3 {
  const R = rotMatrix(q);
  const D = [d.x, d.y, d.z];
  const out = zero3();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) out[i][j] += R[i][k] * D[k] * R[j][k];
  return out;
}

/** Định lý trục song song: m·(|r|²I − r rᵀ). */
function parallelAxis(m: number, r: V3): M3 {
  const rr = [r.x, r.y, r.z];
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  const out = zero3();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i][j] = m * ((i === j ? r2 : 0) - rr[i] * rr[j]);
  return out;
}

const boxInertia = (m: number, s: V3): V3 =>
  v3((m * (s.y * s.y + s.z * s.z)) / 12, (m * (s.x * s.x + s.z * s.z)) / 12, (m * (s.x * s.x + s.y * s.y)) / 12);

/** Trị riêng/vector riêng ma trận đối xứng 3x3 (Jacobi). Trả về trị riêng và quaternion của hệ trục chính. */
export function principalAxes(Min: M3): { values: V3; frame: Q4 } {
  const a = Min.map((r) => r.slice());
  const V: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-15) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let c0 = v3(V[0][0], V[1][0], V[2][0]);
  const c1 = v3(V[0][1], V[1][1], V[2][1]);
  const c2 = v3(V[0][2], V[1][2], V[2][2]);
  // bảo đảm hệ tay phải
  const det = c0.x * (c1.y * c2.z - c1.z * c2.y) - c0.y * (c1.x * c2.z - c1.z * c2.x) + c0.z * (c1.x * c2.y - c1.y * c2.x);
  if (det < 0) c0 = scale(c0, -1);
  return { values: v3(Math.max(a[0][0], 1e-9), Math.max(a[1][1], 1e-9), Math.max(a[2][2], 1e-9)), frame: qFromBasis(c0, c1, c2) };
}

function item(p: PlacedPart): CatalogItem | undefined {
  return CATALOG_BY_ID[p.itemId];
}

function nearest<T extends { position: V3 }>(pos: V3, list: T[]): T | undefined {
  let best: T | undefined;
  let bd = Infinity;
  for (const x of list) {
    const d = length(sub(x.position, pos));
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

/** Khối lượng khung theo vật liệu nếu thiết kế chưa có. */
export function frameMass(design: VehicleDesign): number {
  const f = design.frame;
  if (f.massKg > 0) return f.massKg;
  return FRAME_AREAL_DENSITY[f.material] * f.wheelbase * Math.max(f.height, 0.02);
}

export class DesignError extends Error {}

export function analyzeVehicle(design: VehicleDesign): VehicleModel {
  const warnings: string[] = [];
  const parts = design.parts;
  const byUid = new Map(parts.map((p) => [p.uid, p]));

  // ------------------------------------------------ bánh xe
  const wheelParts = parts.filter((p) => item(p)?.category === 'wheel');
  if (wheelParts.length !== 2) {
    throw new DesignError(`Xe phải có đúng 2 bánh (đang có ${wheelParts.length}).`);
  }
  const wheels: WheelModel[] = wheelParts.map((p) => {
    const w = item(p)!.wheel ?? { radius: 0.034, width: 0.026, friction: 1 };
    const m = item(p)!.massKg;
    return {
      uid: p.uid, name: p.name, center: fromVec3(p.position), radius: w.radius, width: w.width,
      friction: w.friction, mass: m, spinInertia: 0.6 * m * w.radius * w.radius, front: false,
    };
  });
  wheels.sort((a, b) => a.center.x - b.center.x);
  wheels[1].front = true;
  const [rear, front] = wheels;
  if (Math.abs(rear.center.z - front.center.z) > 0.005) warnings.push('Hai bánh không thẳng hàng (lệch theo z).');

  // ------------------------------------------------ khối lượng thân
  let mass = 0;
  let mom = v3();
  const pieces: { m: number; pos: V3; local: M3 }[] = [];
  const boxes: ColliderBox[] = [];

  const fm = frameMass(design);
  const r = rear.radius;
  const frameSize = v3(Math.max(design.frame.wheelbase, 0.05), Math.max(design.frame.height, 0.02), FRAME_THICKNESS);
  const frameCenter = v3((rear.center.x + front.center.x) / 2, r + frameSize.y / 2, (rear.center.z + front.center.z) / 2);
  pieces.push({ m: fm, pos: frameCenter, local: rotateDiag(qIdentity(), boxInertia(fm, frameSize)) });
  boxes.push({ uid: 'frame', center: frameCenter, half: scale(frameSize, 0.5), rotation: qIdentity() });

  const motorParts = parts.filter((p) => item(p)?.motor);
  const flywheelParts = parts.filter((p) => item(p)?.category === 'flywheel');

  // ghép bánh đà ↔ động cơ bánh đà
  const reactions: ReactionWheelModel[] = [];
  const usedFly = new Set<string>();
  for (const mp of motorParts) {
    const spec = item(mp)!.motor!;
    if (spec.kind !== 'reaction') continue;
    let fly = flywheelParts.find((f) => f.attachTo === mp.uid && !usedFly.has(f.uid));
    if (!fly && mp.attachTo) fly = flywheelParts.find((f) => f.uid === mp.attachTo && !usedFly.has(f.uid));
    if (!fly) {
      const free = flywheelParts.filter((f) => !usedFly.has(f.uid) && !f.attachTo)
        .map((f) => ({ f, position: fromVec3(f.position) }));
      const n = nearest(fromVec3(mp.position), free);
      if (n && length(sub(n.position, fromVec3(mp.position))) < 0.1) fly = n.f;
    }
    if (fly) usedFly.add(fly.uid);
    else warnings.push(`Động cơ bánh đà "${mp.name}" chưa gắn đĩa bánh đà — gần như không tạo được mô-men.`);
    const flyItem = fly ? item(fly) : undefined;
    const q = qFromEulerDeg(fly ? fly.rotationDeg : mp.rotationDeg);
    const ax = qRotate(q, v3(1, 0, 0));
    if (Math.abs(ax.x) < 0.9) warnings.push(`Bánh đà "${fly?.name ?? mp.name}" nên quay quanh trục dọc x của xe.`);
    reactions.push({
      uid: mp.uid, name: mp.name, spec,
      flywheelUid: fly?.uid ?? null, flywheelName: fly?.name ?? null,
      position: fromVec3(fly ? fly.position : mp.position),
      spinInertia: BARE_ROTOR_INERTIA + (flyItem?.flywheel?.inertiaKgM2 ?? 0),
      axisSign: ax.x >= 0 ? 1 : -1,
    });
  }
  const spinByFly = new Map<string, number>();
  for (const rw of reactions) if (rw.flywheelUid) spinByFly.set(rw.flywheelUid, rw.spinInertia - BARE_ROTOR_INERTIA);

  for (const p of parts) {
    const it = item(p);
    if (!it) { warnings.push(`Không rõ linh kiện "${p.itemId}".`); continue; }
    if (it.category === 'wheel') continue;
    const pos = fromVec3(p.position);
    const q = qFromEulerDeg(p.rotationDeg);
    const size = fromVec3(it.size);
    let local: M3;
    if (it.category === 'flywheel' && it.flywheel) {
      // đĩa mỏng: quán tính quanh trục quay tính riêng (trạng thái bánh đà), chỉ đưa 2 trục vuông góc vào thân
      const spin = spinByFly.get(p.uid);
      const Ip = it.flywheel.inertiaKgM2 / 2;
      local = rotateDiag(q, v3(spin !== undefined ? 0 : it.flywheel.inertiaKgM2, Ip, Ip));
    } else {
      local = rotateDiag(q, boxInertia(it.massKg, size));
    }
    pieces.push({ m: it.massKg, pos, local });
    boxes.push({ uid: p.uid, center: pos, half: scale(size, 0.5), rotation: q });
  }

  for (const pc of pieces) {
    mass += pc.m;
    mom = add(mom, scale(pc.pos, pc.m));
  }
  const com = mass > 0 ? scale(mom, 1 / mass) : v3(0, r, 0);
  const I = zero3();
  for (const pc of pieces) {
    addInto(I, pc.local);
    addInto(I, parallelAxis(pc.m, sub(pc.pos, com)));
  }
  const pa = principalAxes(I);

  // ------------------------------------------------ động cơ kéo
  const drives: DriveMotorModel[] = [];
  for (const mp of motorParts) {
    const spec = item(mp)!.motor!;
    if (spec.kind !== 'drive') continue;
    let wheel = wheels.find((w) => w.uid === mp.attachTo) ?? wheels.find((w) => byUid.get(w.uid)?.attachTo === mp.uid);
    if (!wheel) wheel = nearest(fromVec3(mp.position), wheels.map((w) => ({ ...w, position: w.center })));
    if (wheel) drives.push({ uid: mp.uid, name: mp.name, spec, wheelUid: wheel.uid });
  }

  // ------------------------------------------------ servo
  const servos: ServoModel[] = motorParts
    .filter((mp) => item(mp)!.motor!.kind === 'servo')
    .map((mp) => {
      const spec = item(mp)!.motor!;
      return {
        uid: mp.uid, name: mp.name, spec,
        maxSteerDeg: Math.min(spec.rangeDeg ?? 45, 40),
        slewDegPerS: Math.max(60, spec.noLoadRpm * 6),
      };
    });
  let steering: ServoModel | null = null;
  if (design.frame.steerable) {
    if (servos.length === 0) warnings.push('Khung có bánh lái nhưng chưa gắn servo — bánh trước sẽ cố định.');
    else {
      const fpos = front.center;
      steering = servos
        .map((s) => ({ s, d: length(sub(fromVec3(byUid.get(s.uid)!.position), fpos)) }))
        .sort((a, b) => a.d - b.d)[0].s;
    }
  } else if (servos.length > 0) {
    warnings.push('Có servo nhưng khung không bật "bánh lái" — servo không có tác dụng.');
  }

  // ------------------------------------------------ cảm biến
  const sensors: SensorModel[] = [];
  const motorTargets = [
    ...drives.map((d) => ({ type: 'drive' as const, uid: d.uid, position: fromVec3(byUid.get(d.uid)!.position) })),
    ...reactions.map((rw) => ({ type: 'reaction' as const, uid: rw.uid, position: fromVec3(byUid.get(rw.uid)!.position) })),
  ];
  for (const p of parts) {
    const it = item(p);
    if (!it?.sensor) continue;
    const s: SensorModel = {
      uid: p.uid, name: p.name, itemId: p.itemId, spec: it.sensor,
      position: fromVec3(p.position), mount: qFromEulerDeg(p.rotationDeg), faceOffset: it.size[0] / 2,
    };
    if (it.sensor.kind === 'encoder') {
      const parent = p.attachTo ? byUid.get(p.attachTo) : undefined;
      let target = parent ? motorTargets.find((m) => m.uid === parent.uid) : undefined;
      if (!target && parent && reactions.some((rw) => rw.flywheelUid === parent.uid)) {
        const rw = reactions.find((x) => x.flywheelUid === parent.uid)!;
        target = motorTargets.find((m) => m.uid === rw.uid);
      }
      if (target) s.target = { type: target.type, uid: target.uid };
      else if (parent && wheels.some((w) => w.uid === parent.uid)) s.target = { type: 'wheel', uid: parent.uid };
      else {
        const n = nearest(s.position, motorTargets);
        if (n) s.target = { type: n.type, uid: n.uid };
        else {
          const w = nearest(s.position, wheels.map((x) => ({ ...x, position: x.center })));
          if (w) s.target = { type: 'wheel', uid: w.uid };
        }
      }
    }
    sensors.push(s);
  }

  // ------------------------------------------------ vi điều khiển
  const ctrl = parts.map(item).find((it) => it?.controller);
  if (!ctrl) warnings.push(`Chưa có vi điều khiển — dùng chu kỳ mặc định ${DEFAULT_LOOP_HZ} Hz.`);
  const loopHz = ctrl?.controller?.loopHz ?? DEFAULT_LOOP_HZ;

  const totalMass = mass + rear.mass + front.mass;
  const centerOfMass = scale(add(scale(com, mass), add(scale(rear.center, rear.mass), scale(front.center, front.mass))), 1 / totalMass);

  return {
    chassis: { mass, com, principalInertia: pa.values, inertiaFrame: pa.frame, boxes },
    wheels, rear, front, drives, reactions, steering, servos, sensors, loopHz,
    totalMass, centerOfMass, warnings,
  };
}
