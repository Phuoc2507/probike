// Các hàm thuần để tạo/sửa VehicleDesign. Mọi hàm trả về thiết kế MỚI (không sửa tại chỗ)
// để dùng được với component có kiểm soát và Yjs.
import type { CatalogItem, PlacedPart, Vec3, VehicleDesign, VehicleFrame } from '@/shared/types';
import { CATALOG_BY_ID, FRAME_AREAL_DENSITY, FRAME_PRICE_VND } from '@/shared/catalog';
import { eulerXYZToMat3, mulMat3Vec } from './geometry';

export const WHEEL_ITEM_ID = 'wheel_btc';
export const WHEEL_RADIUS = CATALOG_BY_ID[WHEEL_ITEM_ID].wheel!.radius;

/** Luật xe (PLAN.md mục 2). */
export const LIMITS = {
  lengthM: 0.35,
  widthM: 0.15,
  heightM: 0.3,
  massKg: 1.5,
} as const;

/** Giới hạn thanh trượt khung. */
export const FRAME_RANGE = {
  wheelbase: { min: 0.1, max: 0.28, step: 0.005 },
  height: { min: 0.04, max: 0.24, step: 0.005 },
} as const;

/** Bước lưới khi di chuyển linh kiện (m) và bước xoay (độ). */
export const GRID_STEP = 0.005;
export const ROTATE_STEP_DEG = 15;

export const FRAME_THICKNESS = 0.003;

export type FrameMaterial = VehicleFrame['material'];

export const FRAME_MATERIAL_LABEL: Record<FrameMaterial, string> = {
  mica: 'Mica 3 mm',
  pla: 'Nhựa in 3D (PLA)',
  aluminum: 'Nhôm tấm',
  carton: 'Carton cứng',
};

/** Khối lượng khung: tấm dọc dài = chiều dài trục bánh, cao = chiều cao khung, cộng phần càng bánh. */
export function computeFrameMass(frame: Pick<VehicleFrame, 'wheelbase' | 'height' | 'material'>): number {
  const forkArea = 2 * 2 * 0.012 * (WHEEL_RADIUS + 0.01); // 2 càng × 2 nhánh
  const area = frame.wheelbase * frame.height + forkArea;
  return round(area * FRAME_AREAL_DENSITY[frame.material], 4);
}

export function frameCost(frame: VehicleFrame): number {
  return FRAME_PRICE_VND[frame.material] ?? 0;
}

/** Tâm và kích thước hộp bao của tấm khung (dùng tính trọng tâm, kích thước xe). */
export function frameBox(frame: VehicleFrame): { center: Vec3; size: Vec3 } {
  return {
    center: [0, WHEEL_RADIUS + frame.height / 2, 0],
    size: [frame.wheelbase, frame.height, FRAME_THICKNESS],
  };
}

/** Vị trí chuẩn của bánh sau (x âm) và bánh trước (x dương). */
export function wheelPosition(frame: VehicleFrame, which: 'rear' | 'front'): Vec3 {
  const x = (which === 'rear' ? -1 : 1) * (frame.wheelbase / 2);
  return [round(x, 4), WHEEL_RADIUS, 0];
}

// ---------------------------------------------------------------- Tên & chân cắm

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const NAME_MAX = 24;

/** Kiểm tra tên mới cho linh kiện. Trả về thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePartName(design: VehicleDesign, uid: string, name: string): string | null {
  const n = name.trim();
  if (!n) return 'Tên không được để trống.';
  if (n.length > NAME_MAX) return `Tên dài tối đa ${NAME_MAX} ký tự.`;
  if (!NAME_RE.test(n)) {
    return 'Tên chỉ gồm chữ cái không dấu, chữ số và dấu _, không bắt đầu bằng số (ví dụ: laserTruoc).';
  }
  const dup = design.parts.find((p) => p.uid !== uid && p.name.toLowerCase() === n.toLowerCase());
  if (dup) return `Tên "${n}" đã được dùng cho linh kiện khác. Hãy chọn tên khác.`;
  return null;
}

/** Tên mặc định gợi ý theo loại linh kiện (dùng trong code: read("laserTruoc")). */
export function defaultBaseName(item: CatalogItem): string {
  switch (item.id) {
    case 'wheel_btc': return 'banhXe';
    case 'mpu6050': case 'mpu9250': case 'bno055': return 'imu';
    case 'mini560': return 'haAp';
    case 'switch_power': return 'congTac';
    case 'standoff_m3': return 'truDo';
    case 'encoder_hall': return 'encoder';
    case 'hcsr04': return 'sieuAmTruoc';
    case 'vl53l0x': case 'vl53l1x': return 'laserTruoc';
    case 'sharp_gp2y0a21': return 'hongNgoai';
    case 'tcrt5000': return 'doVach';
    case 'lidar_ld06': return 'lidar';
    case 'servo_sg90': case 'servo_mg90s': return 'lai';
    case 'tb6612': case 'l298n': return 'driver';
    case 'battery_18650x2': case 'lipo_2s_1000': return 'pin';
    case 'buck_lm2596': return 'haAp';
    case 'bracket_3d': return 'giaDo';
  }
  if (item.motor?.kind === 'reaction') return 'banhDa';
  if (item.motor?.kind === 'drive') return 'dongCoSau';
  if (item.category === 'flywheel') return 'diaBanhDa';
  if (item.category === 'controller') return 'viDieuKhien';
  return 'linhKien';
}

export function uniqueName(design: VehicleDesign, base: string): string {
  const used = new Set(design.parts.map((p) => p.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

/** Chân bus I2C dùng chung được cho nhiều cảm biến. */
export const SHARED_PINS = new Set(['I2C']);

/** Danh sách chân cắm có thể chọn theo vi điều khiển. */
export function controllerPins(controllerItemId: string | undefined): string[] {
  switch (controllerItemId) {
    case 'arduino_nano':
      return ['I2C', ...range(2, 13).map((i) => `D${i}`), ...range(0, 7).map((i) => `A${i}`)];
    case 'esp32':
      return ['I2C', ...[2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39].map((i) => `GPIO${i}`)];
    case 'stm32_bluepill':
      return ['I2C', ...range(0, 15).map((i) => `PA${i}`), ...range(0, 15).filter((i) => i !== 6 && i !== 7).map((i) => `PB${i}`)];
    default:
      return [];
  }
}

/** Linh kiện có cần nối chân vào vi điều khiển không. */
export function needsPin(item: CatalogItem): boolean {
  return item.category === 'sensor' || item.category === 'motor' || item.category === 'driver';
}

/** Linh kiện cha hợp lệ cho `attachTo` (vd: đĩa bánh đà → động cơ bánh đà). */
export function attachCandidates(design: VehicleDesign, part: PlacedPart): PlacedPart[] {
  const item = CATALOG_BY_ID[part.itemId];
  if (!item) return [];
  const others = design.parts.filter((p) => p.uid !== part.uid);
  const byKind = (pred: (it: CatalogItem) => boolean) =>
    others.filter((p) => { const it = CATALOG_BY_ID[p.itemId]; return !!it && pred(it); });
  if (item.category === 'flywheel') return byKind((it) => it.motor?.kind === 'reaction');
  if (item.motor?.kind === 'drive' || item.motor?.kind === 'servo') return byKind((it) => it.category === 'wheel');
  if (item.sensor?.kind === 'encoder') return byKind((it) => it.category === 'motor' || it.category === 'wheel');
  return [];
}

// ---------------------------------------------------------------- Tạo/sửa thiết kế

let uidCounter = 0;
export function newUid(prefix = 'p'): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeFrame(patch: Partial<VehicleFrame> = {}): VehicleFrame {
  const f: VehicleFrame = {
    wheelbase: 0.2,
    height: 0.12,
    material: 'mica',
    massKg: 0,
    steerable: false,
    ...patch,
  };
  return { ...f, massKg: computeFrameMass(f) };
}

/** Thiết kế trống: khung + 2 bánh BTC đặt đúng trục. */
export function createEmptyDesign(name = 'Xe của đội'): VehicleDesign {
  const frame = makeFrame();
  return {
    version: 1,
    name,
    frame,
    parts: [
      { uid: 'wheel_rear', itemId: WHEEL_ITEM_ID, name: 'banhSau', position: wheelPosition(frame, 'rear'), rotationDeg: [0, 0, 0] },
      { uid: 'wheel_front', itemId: WHEEL_ITEM_ID, name: 'banhTruoc', position: wheelPosition(frame, 'front'), rotationDeg: [0, 0, 0] },
    ],
  };
}

/** Bánh sau/trước hiện có (theo vị trí x). */
export function findWheels(design: VehicleDesign): { rear?: PlacedPart; front?: PlacedPart } {
  const wheels = design.parts.filter((p) => p.itemId === WHEEL_ITEM_ID).sort((a, b) => a.position[0] - b.position[0]);
  if (wheels.length === 0) return {};
  if (wheels.length === 1) return { rear: wheels[0] };
  return { rear: wheels[0], front: wheels[wheels.length - 1] };
}

/**
 * Đổi thông số khung. Hai bánh tự về đúng trục, khối lượng khung tự tính lại,
 * linh kiện gắn vào bánh (động cơ kéo, servo lái...) dịch theo bánh.
 */
export function setFrame(design: VehicleDesign, patch: Partial<Omit<VehicleFrame, 'massKg'>>): VehicleDesign {
  const frame = makeFrame({ ...design.frame, ...patch });
  const { rear, front } = findWheels(design);
  let next: VehicleDesign = { ...design, frame };
  if (rear) next = movePart(next, rear.uid, { position: wheelPosition(frame, 'rear'), rotationDeg: [0, 0, 0] });
  if (front) next = movePart(next, front.uid, { position: wheelPosition(frame, 'front'), rotationDeg: [0, 0, 0] });
  return next;
}

export function getPart(design: VehicleDesign, uid: string): PlacedPart | undefined {
  return design.parts.find((p) => p.uid === uid);
}

/** Sửa thuộc tính không liên quan vị trí (tên, chân cắm, gắn vào...). */
export function updatePart(design: VehicleDesign, uid: string, patch: Partial<Omit<PlacedPart, 'uid'>>): VehicleDesign {
  return { ...design, parts: design.parts.map((p) => (p.uid === uid ? { ...p, ...patch } : p)) };
}

/**
 * Di chuyển/xoay một linh kiện. Các linh kiện gắn vào nó (attachTo, nhiều cấp) đi theo như vật rắn.
 */
export function movePart(
  design: VehicleDesign,
  uid: string,
  pose: { position?: Vec3; rotationDeg?: Vec3 },
): VehicleDesign {
  const target = getPart(design, uid);
  if (!target) return design;
  const newPos = pose.position ?? target.position;
  const newRot = pose.rotationDeg ?? target.rotationDeg;
  const rotChanged = !sameVec(newRot, target.rotationDeg);

  // Tập con cháu
  const descendants = new Set<string>();
  const stack = [uid];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of design.parts) {
      if (p.attachTo === cur && p.uid !== uid && !descendants.has(p.uid)) {
        descendants.add(p.uid);
        stack.push(p.uid);
      }
    }
  }

  const r0 = eulerXYZToMat3(target.rotationDeg);
  const r1 = eulerXYZToMat3(newRot);
  return {
    ...design,
    parts: design.parts.map((p) => {
      if (p.uid === uid) return { ...p, position: roundVec(newPos), rotationDeg: roundVec(newRot, 3) };
      if (!descendants.has(p.uid)) return p;
      // vị trí cục bộ so với cha cũ, rồi đặt lại theo cha mới
      const rel: Vec3 = sub(p.position, target.position);
      const local = mulMat3Vec(transpose(r0), rel);
      const world = add(newPos, mulMat3Vec(r1, local));
      let rotationDeg = p.rotationDeg;
      if (rotChanged) {
        // xoay con: R_con_mới = R1 · R0ᵀ · R_con
        const rc = mulMat3(mulMat3(r1, transpose(r0)), eulerXYZToMat3(p.rotationDeg));
        rotationDeg = mat3ToEulerXYZ(rc);
      }
      return { ...p, position: roundVec(world), rotationDeg: roundVec(rotationDeg, 3) };
    }),
  };
}

/** Xoá linh kiện; con của nó được tháo ra (attachTo bỏ trống) chứ không bị xoá. */
export function removePart(design: VehicleDesign, uid: string): VehicleDesign {
  return {
    ...design,
    parts: design.parts
      .filter((p) => p.uid !== uid)
      .map((p) => (p.attachTo === uid ? { ...p, attachTo: undefined } : p)),
  };
}

/** Hướng mặc định khi mới gắn (cảm biến nhìn theo trục +x cục bộ). */
export function defaultRotation(item: CatalogItem): Vec3 {
  if (item.sensor?.kind === 'ir_reflect') return [0, 0, -90]; // dò vạch: nhìn xuống đất
  return [0, 0, 0];
}

/**
 * Thêm linh kiện từ kho. Nếu không truyền vị trí sẽ đặt ở chỗ hợp lý.
 * Đĩa bánh đà tự gắn vào động cơ bánh đà còn trống; động cơ kéo tự gắn bánh sau; servo gắn bánh trước.
 * Trả về thiết kế mới và uid linh kiện vừa thêm.
 */
export function addPart(
  design: VehicleDesign,
  itemId: string,
  opts: { position?: Vec3; rotationDeg?: Vec3; name?: string } = {},
): { design: VehicleDesign; uid: string } {
  const item = CATALOG_BY_ID[itemId];
  if (!item) throw new Error(`Không có linh kiện "${itemId}" trong kho.`);
  const uid = newUid(item.category);
  const name = opts.name ?? uniqueName(design, defaultBaseName(item));
  let position: Vec3 = opts.position ?? defaultPosition(design, item);
  let rotationDeg: Vec3 = opts.rotationDeg ?? defaultRotation(item);
  let attachTo: string | undefined;

  const { rear, front } = findWheels(design);
  if (item.category === 'flywheel') {
    const motor = design.parts.find((p) => {
      const it = CATALOG_BY_ID[p.itemId];
      return it?.motor?.kind === 'reaction' && !design.parts.some((c) => c.attachTo === p.uid && CATALOG_BY_ID[c.itemId]?.category === 'flywheel');
    });
    if (motor) {
      const mItem = CATALOG_BY_ID[motor.itemId];
      attachTo = motor.uid;
      rotationDeg = motor.rotationDeg;
      // trục động cơ hướng +x cục bộ: đĩa nằm ngay đầu trục
      const offset = mItem.size[0] / 2 + item.size[0] / 2 + 0.004;
      position = add(motor.position, mulMat3Vec(eulerXYZToMat3(motor.rotationDeg), [offset, 0, 0]));
    }
  } else if (item.motor?.kind === 'drive' && rear) {
    attachTo = rear.uid;
    if (!opts.position) position = [rear.position[0], rear.position[1], wheelSideZ(item)];
  } else if (item.motor?.kind === 'servo' && front) {
    attachTo = front.uid;
    if (!opts.position) position = [front.position[0], WHEEL_RADIUS * 2 + item.size[1] / 2 + 0.006, 0];
  } else if (item.sensor?.kind === 'encoder') {
    const motor = design.parts.find((p) => CATALOG_BY_ID[p.itemId]?.motor?.kind === 'reaction');
    if (motor) attachTo = motor.uid;
  }

  const part: PlacedPart = { uid, itemId, name, position: roundVec(position), rotationDeg, ...(attachTo ? { attachTo } : {}) };
  return { design: { ...design, parts: [...design.parts, part] }, uid };
}

/** Động cơ kéo đặt cạnh bánh, lệch sang trái để không chồng lên bánh. */
function wheelSideZ(item: CatalogItem): number {
  const wheelHalf = CATALOG_BY_ID[WHEEL_ITEM_ID].size[2] / 2;
  return wheelHalf + item.size[2] / 2 + 0.003;
}

function defaultPosition(design: VehicleDesign, item: CatalogItem): Vec3 {
  const top = WHEEL_RADIUS + design.frame.height;
  const sideZ = FRAME_THICKNESS / 2 + item.size[2] / 2 + 0.001;
  const front = design.frame.wheelbase / 2 - WHEEL_RADIUS - 0.01;
  if (item.category === 'sensor' && item.sensor && item.sensor.kind !== 'imu' && item.sensor.kind !== 'encoder') {
    if (item.sensor.kind === 'ir_reflect') return [front, WHEEL_RADIUS - 0.005, sideZ];
    if (item.sensor.kind === 'lidar_360') return [0, top + item.size[1] / 2 + 0.002, 0];
    return [front, WHEEL_RADIUS + 0.03, sideZ];
  }
  if (item.category === 'power') return [0, WHEEL_RADIUS + item.size[1] / 2 + 0.005, sideZ];
  if (item.motor?.kind === 'reaction') return [-0.03, top - 0.05, 0];
  return [0, top - item.size[1] / 2 - 0.01, sideZ];
}

// ---------------------------------------------------------------- tiện ích số học

export function round(v: number, digits = 4): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
export function roundVec(v: Vec3, digits = 4): Vec3 {
  return [round(v[0], digits), round(v[1], digits), round(v[2], digits)];
}
export function snap(v: number, step = GRID_STEP): number {
  return round(Math.round(v / step) * step, 4);
}
export function snapVec(v: Vec3, step = GRID_STEP): Vec3 {
  return [snap(v[0], step), snap(v[1], step), snap(v[2], step)];
}
function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
function sameVec(a: Vec3, b: Vec3) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
type M3 = ReturnType<typeof eulerXYZToMat3>;
function transpose(m: M3): M3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
function mulMat3(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return o;
}
/** Ngược của eulerXYZToMat3 (giống Euler.setFromRotationMatrix 'XYZ' của three.js). */
function mat3ToEulerXYZ(m: M3): Vec3 {
  const m11 = m[0], m12 = m[1], m13 = m[2], m22 = m[4], m23 = m[5], m32 = m[7], m33 = m[8];
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  let x: number, z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m23, m33);
    z = Math.atan2(-m12, m11);
  } else {
    x = Math.atan2(m32, m22);
    z = 0;
  }
  const d = 180 / Math.PI;
  return [x * d, y * d, z * d];
}
