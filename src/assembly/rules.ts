// Kiểm tra luật "xe hợp lệ" (PLAN.md mục 2) và tính khối lượng, trọng tâm, chi phí.
// Thuần TypeScript — chạy được trong Node (test), Worker và trình duyệt.
import type { CatalogItem, DesignCheck, PlacedPart, Vec3, VehicleDesign } from '@/shared/types';
import { BUDGET_PER_TEAM_VND, CATALOG_BY_ID } from '@/shared/catalog';
import { makeOBB, obbBounds, obbOverlap, type OBB } from './geometry';
import {
  LIMITS, WHEEL_ITEM_ID, WHEEL_RADIUS, computeFrameMass, controllerPins, frameBox, frameCost, needsPin,
  NAME_MAX, SHARED_PINS,
} from './design';

/** Sai số cho phép khi so vị trí (m). */
const EPS = 0.001;
/** Khoảng sáng gầm tối thiểu để qua bãi đá thoải mái (đá cao tới 1,5 cm). */
const ROCK_CLEARANCE = 0.015;

export const fmtCm = (m: number) => (m * 100).toFixed(1).replace('.', ',');
export const fmtKg = (kg: number) => kg.toFixed(3).replace('.', ',');
export const fmtVnd = (v: number) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;

export function partOBB(part: PlacedPart, item: CatalogItem): OBB {
  return makeOBB(part.position, item.size, part.rotationDeg);
}

/** Hộp bao toàn xe (khung + mọi linh kiện), hệ toạ độ xe. */
export function designBounds(design: VehicleDesign): { min: Vec3; max: Vec3 } {
  const fb = frameBox(design.frame);
  const min: Vec3 = [fb.center[0] - fb.size[0] / 2, fb.center[1] - fb.size[1] / 2, fb.center[2] - fb.size[2] / 2];
  const max: Vec3 = [fb.center[0] + fb.size[0] / 2, fb.center[1] + fb.size[1] / 2, fb.center[2] + fb.size[2] / 2];
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) continue;
    const b = obbBounds(partOBB(p, item));
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  return { min, max };
}

/** Khối lượng, trọng tâm, chi phí (không kiểm tra luật). */
export function computeStats(design: VehicleDesign): Pick<DesignCheck, 'totalMassKg' | 'centerOfMass' | 'totalCostVnd'> {
  const frameMass = computeFrameMass(design.frame);
  const fc = frameBox(design.frame).center;
  let mass = frameMass;
  const moment: Vec3 = [fc[0] * frameMass, fc[1] * frameMass, fc[2] * frameMass];
  let cost = frameCost(design.frame);
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) continue;
    mass += item.massKg;
    for (let i = 0; i < 3; i++) moment[i] += p.position[i] * item.massKg;
    if (!item.providedByBtc) cost += item.priceVnd;
  }
  const com: Vec3 = mass > 0 ? [moment[0] / mass, moment[1] / mass, moment[2] / mass] : [0, 0, 0];
  return {
    totalMassKg: Math.round(mass * 1e4) / 1e4,
    centerOfMass: com.map((v) => Math.round(v * 1e4) / 1e4) as Vec3,
    totalCostVnd: cost,
  };
}

export function checkDesign(design: VehicleDesign): DesignCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = computeStats(design);

  // ---- linh kiện lạ, uid/tên trùng
  const known: { part: PlacedPart; item: CatalogItem }[] = [];
  const uids = new Set<string>();
  const names = new Map<string, string>();
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) {
      errors.push(`Linh kiện "${p.name}" không có trong kho (mã ${p.itemId}). Hãy xoá và gắn lại.`);
      continue;
    }
    if (uids.has(p.uid)) errors.push(`Có hai linh kiện trùng mã nội bộ "${p.uid}". Hãy xoá một cái và gắn lại.`);
    uids.add(p.uid);
    const key = p.name.trim().toLowerCase();
    if (!key) errors.push(`Một ${item.name} chưa có tên. Hãy đặt tên để dùng trong chương trình.`);
    else if (names.has(key)) errors.push(`Tên "${p.name}" bị trùng giữa hai linh kiện. Mỗi linh kiện cần một tên riêng.`);
    else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name) || p.name.length > NAME_MAX) {
      errors.push(`Tên "${p.name}" không hợp lệ: chỉ dùng chữ không dấu, số và _, không bắt đầu bằng số, tối đa ${NAME_MAX} ký tự.`);
    }
    names.set(key, p.uid);
    known.push({ part: p, item });
  }
  const byUid = new Map(known.map((k) => [k.part.uid, k]));

  // ---- 1. Đúng 2 bánh BTC thẳng hàng
  const wheels = known.filter((k) => k.item.category === 'wheel');
  const foreignWheels = wheels.filter((k) => k.item.id !== WHEEL_ITEM_ID);
  if (foreignWheels.length) errors.push('Chỉ được dùng bánh xe do BTC phát.');
  if (wheels.length !== 2) {
    errors.push(`Xe phải có đúng 2 bánh xe BTC (hiện có ${wheels.length}).`);
  } else {
    const [a, b] = wheels.map((w) => w.part);
    if (Math.abs(a.position[2] - b.position[2]) > EPS) {
      errors.push('Hai bánh xe phải thẳng hàng: bánh trước và bánh sau đang lệch ngang nhau. Kéo về cùng một đường thẳng.');
    }
    for (const w of wheels) {
      const axis = partOBB(w.part, w.item).axes[2]; // trục bánh = trục z cục bộ
      if (Math.abs(axis[2]) < 0.999) {
        errors.push(`Bánh "${w.part.name}" đang bị xoay nghiêng. Trục bánh phải nằm ngang, vuông góc với thân xe.`);
      }
      if (Math.abs(w.part.position[1] - WHEEL_RADIUS) > EPS) {
        errors.push(`Bánh "${w.part.name}" không chạm đất (tâm bánh phải cao đúng ${fmtCm(WHEEL_RADIUS)} cm).`);
      }
    }
  }

  // ---- 2. Kích thước
  const bounds = designBounds(design);
  const len = bounds.max[0] - bounds.min[0];
  const hgt = bounds.max[1] - Math.min(0, bounds.min[1]);
  const wid = bounds.max[2] - bounds.min[2];
  if (len > LIMITS.lengthM + 5e-4) errors.push(`Xe dài ${fmtCm(len)} cm, vượt giới hạn ${fmtCm(LIMITS.lengthM)} cm.`);
  if (wid > LIMITS.widthM + 5e-4) errors.push(`Xe rộng ${fmtCm(wid)} cm, vượt giới hạn ${fmtCm(LIMITS.widthM)} cm.`);
  if (hgt > LIMITS.heightM + 5e-4) errors.push(`Xe cao ${fmtCm(hgt)} cm, vượt giới hạn ${fmtCm(LIMITS.heightM)} cm.`);

  // ---- 3. Khối lượng
  if (stats.totalMassKg > LIMITS.massKg) {
    errors.push(`Xe nặng ${fmtKg(stats.totalMassKg)} kg, vượt giới hạn ${fmtKg(LIMITS.massKg)} kg. Hãy bỏ bớt hoặc chọn linh kiện nhẹ hơn.`);
  }

  // ---- 4. Đúng 1 vi điều khiển
  const controllers = known.filter((k) => k.item.category === 'controller');
  if (controllers.length === 0) errors.push('Xe chưa có vi điều khiển (bộ não của xe). Hãy gắn 1 vi điều khiển.');
  else if (controllers.length > 1) errors.push(`Xe chỉ được có 1 vi điều khiển (hiện có ${controllers.length}).`);

  // ---- 5. Bánh đà
  const reactionMotors = known.filter((k) => k.item.motor?.kind === 'reaction');
  const flywheels = known.filter((k) => k.item.category === 'flywheel');
  for (const m of reactionMotors) {
    const disks = flywheels.filter((f) => f.part.attachTo === m.part.uid);
    if (disks.length === 0) errors.push(`Động cơ bánh đà "${m.part.name}" chưa có đĩa bánh đà. Hãy gắn một đĩa bánh đà vào nó.`);
    if (disks.length > 1) errors.push(`Động cơ bánh đà "${m.part.name}" chỉ gắn được 1 đĩa bánh đà.`);
  }
  for (const f of flywheels) {
    const parent = f.part.attachTo ? byUid.get(f.part.attachTo) : undefined;
    if (!parent || parent.item.motor?.kind !== 'reaction') {
      errors.push(`Đĩa bánh đà "${f.part.name}" chưa gắn vào động cơ bánh đà nào.`);
    }
  }
  if (reactionMotors.length === 0) {
    warnings.push('Xe chưa có động cơ bánh đà — rất khó giữ thăng bằng. Nên gắn động cơ bánh đà + đĩa bánh đà.');
  }

  // ---- gắn kết khác
  for (const k of known) {
    if (k.part.attachTo && !byUid.has(k.part.attachTo)) {
      errors.push(`"${k.part.name}" đang gắn vào một linh kiện đã bị xoá. Hãy chọn lại chỗ gắn.`);
    }
  }

  // ---- 6. Không chồng lấn
  const solids = known.map((k) => ({ ...k, obb: partOBB(k.part, k.item) }));
  const related = (a: PlacedPart, b: PlacedPart) => a.attachTo === b.uid || b.attachTo === a.uid;
  const overlapPairs: string[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (related(a.part, b.part)) continue;
      if (obbOverlap(a.obb, b.obb)) overlapPairs.push(`"${a.part.name}" và "${b.part.name}"`);
    }
  }
  for (const pair of overlapPairs) errors.push(`${pair} đang chồng lên nhau. Kéo chúng ra xa một chút.`);

  // ---- 7. Không chạm đất (trừ bánh xe)
  let minClearance = Infinity;
  for (const s of solids) {
    if (s.item.category === 'wheel') continue;
    const bottom = obbBounds(s.obb).min[1];
    if (bottom < 0.0005) errors.push(`"${s.part.name}" chạm đất hoặc thấp hơn mặt đất. Chỉ bánh xe được chạm đất.`);
    else minClearance = Math.min(minClearance, bottom);
  }
  if (minClearance < ROCK_CLEARANCE) {
    warnings.push(`Gầm xe chỉ cao ${fmtCm(minClearance)} cm — có thể vướng bãi đá (đá cao tới 1,5 cm).`);
  }

  // ---- chân cắm
  const controller = controllers[0]?.item;
  const pinsAvailable = new Set(controllerPins(controller?.id));
  const pinUsers = new Map<string, string[]>();
  for (const k of known) {
    if (!k.part.pin) {
      if (needsPin(k.item) && controller) warnings.push(`"${k.part.name}" chưa chọn chân cắm trên vi điều khiển.`);
      continue;
    }
    if (controller && !pinsAvailable.has(k.part.pin)) {
      errors.push(`Chân "${k.part.pin}" của "${k.part.name}" không có trên ${controller.name}.`);
    }
    if (!SHARED_PINS.has(k.part.pin)) pinUsers.set(k.part.pin, [...(pinUsers.get(k.part.pin) ?? []), k.part.name]);
  }
  for (const [pin, users] of pinUsers) {
    if (users.length > 1) errors.push(`Chân ${pin} đang được dùng cho nhiều linh kiện: ${users.join(', ')}. Mỗi chân chỉ nối 1 linh kiện.`);
  }

  // ---- cảnh báo khác
  if (!known.some((k) => k.item.sensor?.kind === 'imu')) {
    warnings.push('Xe chưa có cảm biến IMU nên không đo được góc nghiêng để cân bằng.');
  }
  if (!known.some((k) => k.item.motor?.kind === 'drive')) {
    warnings.push('Xe chưa có động cơ kéo nên chỉ đứng tại chỗ (vẫn tập cân bằng được).');
  }
  if (!known.some((k) => k.item.category === 'power')) warnings.push('Xe chưa có pin.');
  if (design.frame.steerable && !known.some((k) => k.item.motor?.kind === 'servo')) {
    warnings.push('Khung chọn "bánh trước lái được" nhưng chưa có servo lái.');
  }
  if (Math.abs(stats.centerOfMass[2]) > 0.005) {
    warnings.push(`Trọng tâm lệch ngang ${fmtCm(Math.abs(stats.centerOfMass[2]))} cm so với thân xe — xe sẽ dễ đổ về một bên.`);
  }
  if (stats.totalCostVnd > BUDGET_PER_TEAM_VND) {
    warnings.push(`Tổng chi phí ${fmtVnd(stats.totalCostVnd)} vượt ngân sách gợi ý ${fmtVnd(BUDGET_PER_TEAM_VND)}.`);
  }

  return { ok: errors.length === 0, errors: dedupe(errors), warnings: dedupe(warnings), ...stats };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
