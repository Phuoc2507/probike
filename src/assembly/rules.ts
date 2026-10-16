// Kiểm tra luật "xe hợp lệ" (PLAN.md mục 2) và tính khối lượng, trọng tâm, chi phí.
// Thuần TypeScript — chạy được trong Node (test), Worker và trình duyệt.
// Lưu ý: linh kiện được phép đặt xuyên qua tấm khung (coi như khoét lỗ hoặc bắt vít lên khung),
// nên KHÔNG tính chồng lấn giữa linh kiện và khung — chỉ tính giữa các linh kiện với nhau.
import type { CatalogItem, DesignCheck, PlacedPart, Vec3, VehicleDesign, VehicleFrame } from '@/shared/types';
import { BUDGET_PER_TEAM_VND, CATALOG_BY_ID } from '@/shared/catalog';
import { makeOBB, obbBounds, obbOverlap, type OBB } from './geometry';
import {
  FRAME_MATERIAL_LABEL, FRAME_RANGE, LIMITS, WHEEL_ITEM_ID, WHEEL_RADIUS, attachCandidates, computeFrameMass,
  controllerPins, frameBox, frameCost, needsPin, NAME_MAX, SHARED_PINS,
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

/** Hộp bao toàn xe (khung + mọi linh kiện), hệ toạ độ xe. Bỏ qua khung/linh kiện có số không hợp lệ. */
export function designBounds(design: VehicleDesign): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  if (frameErrors(design.frame).length === 0) {
    const fb = frameBox(design.frame);
    for (let i = 0; i < 3; i++) {
      min[i] = fb.center[i] - fb.size[i] / 2;
      max[i] = fb.center[i] + fb.size[i] / 2;
    }
  }
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item || !isVec3(p.position) || !isVec3(p.rotationDeg)) continue;
    const b = obbBounds(partOBB(p, item));
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  for (let i = 0; i < 3; i++) if (!Number.isFinite(min[i])) { min[i] = 0; max[i] = 0; }
  return { min, max };
}

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/**
 * Lỗi thông số khung (thiết kế có thể đến từ Yjs/CSDL, không qua thanh trượt nên phải tự kiểm).
 * Trả mảng rỗng nếu khung hợp lệ.
 */
export function frameErrors(frame: VehicleFrame | undefined): string[] {
  if (!frame || typeof frame !== 'object') return ['Thiết kế thiếu thông số khung xe.'];
  const out: string[] = [];
  const inRange = (v: unknown, r: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) && v >= r.min - 1e-9 && v <= r.max + 1e-9;
  if (!inRange(frame.wheelbase, FRAME_RANGE.wheelbase)) {
    out.push(`Khoảng cách 2 trục bánh không hợp lệ: phải từ ${fmtCm(FRAME_RANGE.wheelbase.min)} đến ${fmtCm(FRAME_RANGE.wheelbase.max)} cm.`);
  }
  if (!inRange(frame.height, FRAME_RANGE.height)) {
    out.push(`Chiều cao khung không hợp lệ: phải từ ${fmtCm(FRAME_RANGE.height.min)} đến ${fmtCm(FRAME_RANGE.height.max)} cm.`);
  }
  if (!Object.prototype.hasOwnProperty.call(FRAME_MATERIAL_LABEL, frame.material)) {
    out.push(`Vật liệu khung "${String(frame.material)}" không có trong danh sách.`);
  }
  return out;
}

/** Khối lượng, trọng tâm, chi phí (không kiểm tra luật). Khung sai thông số thì tính khung = 0. */
export function computeStats(design: VehicleDesign): Pick<DesignCheck, 'totalMassKg' | 'centerOfMass' | 'totalCostVnd'> {
  const frameOk = frameErrors(design.frame).length === 0;
  const frameMass = frameOk ? computeFrameMass(design.frame) : 0;
  const fc = frameOk ? frameBox(design.frame).center : [0, 0, 0];
  let mass = frameMass;
  const moment: Vec3 = [fc[0] * frameMass, fc[1] * frameMass, fc[2] * frameMass];
  let cost = frameOk ? frameCost(design.frame) : 0;
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) continue;
    mass += item.massKg;
    if (isVec3(p.position)) for (let i = 0; i < 3; i++) moment[i] += p.position[i] * item.massKg;
    if (!item.providedByBtc) cost += item.priceVnd;
  }
  const com: Vec3 = mass > 0 ? [moment[0] / mass, moment[1] / mass, moment[2] / mass] : [0, 0, 0];
  return {
    totalMassKg: Math.round(mass * 1e4) / 1e4,
    centerOfMass: com.map((v) => Math.round(v * 1e4) / 1e4) as Vec3,
    totalCostVnd: cost,
  };
}

/** Như checkDesign, kèm danh sách uid linh kiện đang vi phạm (để tô đỏ trong 3D). */
export function checkDesignDetailed(design: VehicleDesign): DesignCheck & { problemUids: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bad = new Set<string>();
  const err = (msg: string, ...uids: string[]) => {
    errors.push(msg);
    for (const u of uids) bad.add(u);
  };
  const stats = computeStats(design);

  // ---- 0. Thông số khung và số liệu phải hợp lệ (không tin dữ liệu từ Yjs/CSDL)
  const frameErrs = frameErrors(design.frame);
  for (const e of frameErrs) err(e);
  const frameOk = frameErrs.length === 0;
  if (!Number.isFinite(stats.totalMassKg) || !Number.isFinite(stats.totalCostVnd)) {
    err('Không tính được khối lượng hoặc chi phí vì thiết kế có số liệu sai. Hãy tải lại xe mẫu.');
  }

  // ---- linh kiện lạ, uid/tên trùng
  const known: { part: PlacedPart; item: CatalogItem }[] = [];
  const uids = new Set<string>();
  const names = new Map<string, string>();
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item) {
      err(`Linh kiện "${p.name}" không có trong kho (mã ${p.itemId}). Hãy xoá và gắn lại.`);
      continue;
    }
    if (!isVec3(p.position) || !isVec3(p.rotationDeg)) {
      err(`"${p.name}" có vị trí hoặc góc xoay không hợp lệ (không phải số). Hãy nhập lại vị trí hoặc xoá và gắn lại.`, p.uid);
      continue;
    }
    if (uids.has(p.uid)) err(`Có hai linh kiện trùng mã nội bộ "${p.uid}". Hãy xoá một cái và gắn lại.`);
    uids.add(p.uid);
    const key = p.name.trim().toLowerCase();
    if (!key) err(`Một ${item.name} chưa có tên. Hãy đặt tên để dùng trong chương trình.`);
    else if (names.has(key)) err(`Tên "${p.name}" bị trùng giữa hai linh kiện. Mỗi linh kiện cần một tên riêng.`, p.uid, names.get(key)!);
    else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name) || p.name.length > NAME_MAX) {
      err(`Tên "${p.name}" không hợp lệ: chỉ dùng chữ không dấu, số và _, không bắt đầu bằng số, tối đa ${NAME_MAX} ký tự.`, p.uid);
    }
    names.set(key, p.uid);
    known.push({ part: p, item });
  }
  const byUid = new Map(known.map((k) => [k.part.uid, k]));

  // ---- 1. Đúng 2 bánh BTC thẳng hàng
  const wheels = known.filter((k) => k.item.category === 'wheel');
  const foreignWheels = wheels.filter((k) => k.item.id !== WHEEL_ITEM_ID);
  if (foreignWheels.length) err('Chỉ được dùng bánh xe do BTC phát.');
  if (wheels.length !== 2) {
    err(`Xe phải có đúng 2 bánh xe BTC (hiện có ${wheels.length}).`);
  } else {
    const [a, b] = wheels.map((w) => w.part).sort((p, q) => p.position[0] - q.position[0]);
    if (Math.abs(a.position[2] - b.position[2]) > EPS) {
      err('Hai bánh xe phải thẳng hàng: bánh trước và bánh sau đang lệch ngang nhau. Kéo về cùng một đường thẳng.', a.uid, b.uid);
    }
    // bánh phải nằm đúng trục của khung (càng bánh ở x = ±wheelbase/2, z = 0)
    if (frameOk) {
      const half = design.frame.wheelbase / 2;
      for (const [w, x] of [[a, -half], [b, half]] as const) {
        if (Math.abs(w.position[0] - x) > EPS || Math.abs(w.position[2]) > EPS) {
          err(`Bánh "${w.name}" không nằm đúng trục bánh của khung. Hãy chỉnh lại khung để bánh tự về chỗ.`, w.uid);
        }
      }
    }
    for (const w of wheels) {
      const axis = partOBB(w.part, w.item).axes[2]; // trục bánh = trục z cục bộ
      if (Math.abs(axis[2]) < 0.999) {
        err(`Bánh "${w.part.name}" đang bị xoay nghiêng. Trục bánh phải nằm ngang, vuông góc với thân xe.`, w.part.uid);
      }
      if (Math.abs(w.part.position[1] - WHEEL_RADIUS) > EPS) {
        err(`Bánh "${w.part.name}" không chạm đất (tâm bánh phải cao đúng ${fmtCm(WHEEL_RADIUS)} cm).`, w.part.uid);
      }
    }
  }

  // ---- 2. Kích thước
  const bounds = designBounds(design);
  const len = bounds.max[0] - bounds.min[0];
  const hgt = bounds.max[1] - Math.min(0, bounds.min[1]);
  const wid = bounds.max[2] - bounds.min[2];
  if (len > LIMITS.lengthM + 5e-4) err(`Xe dài ${fmtCm(len)} cm, vượt giới hạn ${fmtCm(LIMITS.lengthM)} cm.`);
  if (wid > LIMITS.widthM + 5e-4) err(`Xe rộng ${fmtCm(wid)} cm, vượt giới hạn ${fmtCm(LIMITS.widthM)} cm.`);
  if (hgt > LIMITS.heightM + 5e-4) err(`Xe cao ${fmtCm(hgt)} cm, vượt giới hạn ${fmtCm(LIMITS.heightM)} cm.`);

  // ---- 3. Khối lượng
  if (stats.totalMassKg > LIMITS.massKg) {
    err(`Xe nặng ${fmtKg(stats.totalMassKg)} kg, vượt giới hạn ${fmtKg(LIMITS.massKg)} kg. Hãy bỏ bớt hoặc chọn linh kiện nhẹ hơn.`);
  }

  // ---- 4. Đúng 1 vi điều khiển
  const controllers = known.filter((k) => k.item.category === 'controller');
  if (controllers.length === 0) err('Xe chưa có vi điều khiển (bộ não của xe). Hãy gắn 1 vi điều khiển.');
  else if (controllers.length > 1) err(`Xe chỉ được có 1 vi điều khiển (hiện có ${controllers.length}).`);

  // ---- 5. Bánh đà
  const reactionMotors = known.filter((k) => k.item.motor?.kind === 'reaction');
  const flywheels = known.filter((k) => k.item.category === 'flywheel');
  for (const m of reactionMotors) {
    const disks = flywheels.filter((f) => f.part.attachTo === m.part.uid);
    if (disks.length === 0) err(`Động cơ bánh đà "${m.part.name}" chưa có đĩa bánh đà. Hãy gắn một đĩa bánh đà vào nó.`, m.part.uid);
    if (disks.length > 1) err(`Động cơ bánh đà "${m.part.name}" chỉ gắn được 1 đĩa bánh đà.`, m.part.uid);
  }
  for (const f of flywheels) {
    const parent = f.part.attachTo ? byUid.get(f.part.attachTo) : undefined;
    if (!parent || parent.item.motor?.kind !== 'reaction') {
      err(`Đĩa bánh đà "${f.part.name}" chưa gắn vào động cơ bánh đà nào.`, f.part.uid);
    } else if (!flywheelOnShaft(f.part, f.item, parent.part, parent.item)) {
      err(
        `Đĩa bánh đà "${f.part.name}" phải nằm ngay trên trục của động cơ "${parent.part.name}" (cùng trục, sát đầu trục).`,
        f.part.uid, parent.part.uid,
      );
    }
  }
  if (reactionMotors.length === 0) {
    warnings.push('Xe chưa có động cơ bánh đà — rất khó giữ thăng bằng. Nên gắn động cơ bánh đà + đĩa bánh đà.');
  }

  // ---- gắn kết khác
  for (const k of known) {
    const target = k.part.attachTo;
    if (!target) continue;
    if (target === k.part.uid) {
      err(`"${k.part.name}" đang gắn vào chính nó. Hãy chọn lại chỗ gắn.`, k.part.uid);
    } else if (!byUid.has(target)) {
      err(`"${k.part.name}" đang gắn vào một linh kiện không tồn tại (đã bị xoá). Hãy chọn lại chỗ gắn.`, k.part.uid);
    } else if (!attachCandidates(design, k.part).some((c) => c.uid === target)) {
      err(`"${k.part.name}" không gắn được vào "${byUid.get(target)!.part.name}". Hãy chọn lại chỗ gắn.`, k.part.uid);
    }
  }

  // ---- 6. Không chồng lấn (giữa linh kiện với nhau; không tính với tấm khung — xem đầu file)
  const solids = known.map((k) => ({ ...k, obb: partOBB(k.part, k.item) }));
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (mayTouch(a, b) || mayTouch(b, a)) continue;
      if (obbOverlap(a.obb, b.obb)) {
        err(`"${a.part.name}" và "${b.part.name}" đang chồng lên nhau. Kéo chúng ra xa một chút.`, a.part.uid, b.part.uid);
      }
    }
  }

  // ---- 7. Không chạm đất (trừ bánh xe)
  let minClearance = Infinity;
  for (const s of solids) {
    if (s.item.category === 'wheel') continue;
    const bottom = obbBounds(s.obb).min[1];
    if (bottom < 0.0005) err(`"${s.part.name}" chạm đất hoặc thấp hơn mặt đất. Chỉ bánh xe được chạm đất.`, s.part.uid);
    else minClearance = Math.min(minClearance, bottom);
  }
  if (minClearance < ROCK_CLEARANCE) {
    warnings.push(`Gầm xe chỉ cao ${fmtCm(minClearance)} cm — có thể vướng bãi đá (đá cao tới 1,5 cm).`);
  }

  // ---- chân cắm
  const controller = controllers[0]?.item;
  const pinsAvailable = new Set(controllerPins(controller?.id).map(normalizePin));
  const pinUsers = new Map<string, PlacedPart[]>();
  for (const k of known) {
    const pin = typeof k.part.pin === 'string' ? normalizePin(k.part.pin) : '';
    if (!pin) {
      if (needsPin(k.item) && controller) warnings.push(`"${k.part.name}" chưa chọn chân cắm trên vi điều khiển.`);
      continue;
    }
    if (controller && !pinsAvailable.has(pin)) {
      err(`Chân "${k.part.pin}" của "${k.part.name}" không có trên ${controller.name}.`, k.part.uid);
    }
    if (!SHARED_PINS.has(pin)) pinUsers.set(pin, [...(pinUsers.get(pin) ?? []), k.part]);
  }
  for (const [pin, users] of pinUsers) {
    if (users.length > 1) {
      err(
        `Chân ${pin} đang được dùng cho nhiều linh kiện: ${users.map((u) => u.name).join(', ')}. Mỗi chân chỉ nối 1 linh kiện.`,
        ...users.map((u) => u.uid),
      );
    }
  }

  // ---- cảnh báo khác
  if (!known.some((k) => k.item.sensor?.kind === 'imu')) {
    warnings.push('Xe chưa có cảm biến IMU nên không đo được góc nghiêng để cân bằng.');
  }
  if (!known.some((k) => k.item.motor?.kind === 'drive')) {
    warnings.push('Xe chưa có động cơ kéo nên chỉ đứng tại chỗ (vẫn tập cân bằng được).');
  }
  if (!known.some((k) => k.item.battery)) warnings.push('Xe chưa có pin.');
  if (design.frame.steerable && !known.some((k) => k.item.motor?.kind === 'servo')) {
    warnings.push('Khung chọn "bánh trước lái được" nhưng chưa có servo lái.');
  }
  if (Math.abs(stats.centerOfMass[2]) > 0.005) {
    warnings.push(`Trọng tâm lệch ngang ${fmtCm(Math.abs(stats.centerOfMass[2]))} cm so với thân xe — xe sẽ dễ đổ về một bên.`);
  }
  if (stats.totalCostVnd > BUDGET_PER_TEAM_VND) {
    warnings.push(`Tổng chi phí ${fmtVnd(stats.totalCostVnd)} vượt ngân sách gợi ý ${fmtVnd(BUDGET_PER_TEAM_VND)}.`);
  }

  return { ok: errors.length === 0, errors: dedupe(errors), warnings: dedupe(warnings), ...stats, problemUids: [...bad] };
}

export function checkDesign(design: VehicleDesign): DesignCheck {
  const r = checkDesignDetailed(design);
  return { ok: r.ok, errors: r.errors, warnings: r.warnings, totalMassKg: r.totalMassKg, centerOfMass: r.centerOfMass, totalCostVnd: r.totalCostVnd };
}

/** Chuẩn hoá tên chân để so sánh: bỏ khoảng trắng, chữ hoa ('d9 ' → 'D9'). */
export function normalizePin(pin: string): string {
  return pin.trim().toUpperCase();
}

type Solid = { part: PlacedPart; item: CatalogItem };

/**
 * Cặp được phép chạm/lồng nhau vì gắn cơ khí trực tiếp: đĩa bánh đà trên trục động cơ bánh đà,
 * encoder gắn vào động cơ hoặc bánh nó đo. Các cặp attachTo khác (động cơ kéo – bánh, servo – bánh) vẫn tính chồng lấn.
 */
function mayTouch(child: Solid, parent: Solid): boolean {
  if (child.part.attachTo !== parent.part.uid) return false;
  if (child.item.category === 'flywheel') return parent.item.motor?.kind === 'reaction';
  if (child.item.sensor?.kind === 'encoder') return parent.item.category === 'motor' || parent.item.category === 'wheel';
  return false;
}

/** Đĩa bánh đà cùng trục với động cơ (trục x cục bộ) và nằm sát đầu trục. */
function flywheelOnShaft(fw: PlacedPart, fwItem: CatalogItem, motor: PlacedPart, motorItem: CatalogItem): boolean {
  const m = partOBB(motor, motorItem);
  const f = partOBB(fw, fwItem);
  const shaft = m.axes[0];
  const d: Vec3 = [fw.position[0] - motor.position[0], fw.position[1] - motor.position[1], fw.position[2] - motor.position[2]];
  const along = d[0] * shaft[0] + d[1] * shaft[1] + d[2] * shaft[2];
  const off = Math.hypot(d[0] - along * shaft[0], d[1] - along * shaft[1], d[2] - along * shaft[2]);
  const parallel = Math.abs(f.axes[0][0] * shaft[0] + f.axes[0][1] * shaft[1] + f.axes[0][2] * shaft[2]);
  const maxAlong = motorItem.size[0] / 2 + fwItem.size[0] / 2 + 0.015; // trục động cơ dài tối đa ~1,5 cm
  return parallel > 0.999 && off <= 0.002 && Math.abs(along) <= maxAlong;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
