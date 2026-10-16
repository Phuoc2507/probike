import { describe, expect, it } from 'vitest';
import type { VehicleDesign } from '@/shared/types';
import { BUDGET_PER_TEAM_VND, CATALOG_BY_ID } from '@/shared/catalog';
import { checkDesign, computeStats } from './rules';
import {
  addPart, computeFrameMass, createEmptyDesign, findWheels, movePart, removePart, setFrame, updatePart, validatePartName, WHEEL_RADIUS,
} from './design';
import { PRESETS } from './presets';
import { eulerXYZToMat3, makeOBB, obbOverlap } from './geometry';

const base = () => PRESETS[0].create();
const partByName = (d: VehicleDesign, name: string) => d.parts.find((p) => p.name === name)!;
const hasError = (d: VehicleDesign, re: RegExp) => checkDesign(d).errors.some((e) => re.test(e));

describe('xe mẫu', () => {
  for (const preset of PRESETS) {
    it(`"${preset.title}" hợp lệ`, () => {
      const r = checkDesign(preset.create());
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
  it('xe "Mạnh mẽ" bị cảnh báo vượt ngân sách nhưng vẫn hợp lệ', () => {
    const r = checkDesign(PRESETS[1].create());
    expect(r.totalCostVnd).toBeGreaterThan(BUDGET_PER_TEAM_VND);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('vượt ngân sách'))).toBe(true);
  });
});

describe('bánh xe', () => {
  it('thiếu bánh hoặc thừa bánh là lỗi', () => {
    const d = base();
    expect(hasError(removePart(d, findWheels(d).front!.uid), /đúng 2 bánh/)).toBe(true);
    const three = addPart(d, 'wheel_btc', { position: [0, WHEEL_RADIUS, 0.06] }).design;
    expect(hasError(three, /đúng 2 bánh/)).toBe(true);
  });
  it('hai bánh lệch ngang là lỗi', () => {
    const d = base();
    const front = findWheels(d).front!;
    const moved = updatePart(d, front.uid, { position: [front.position[0], front.position[1], 0.01] });
    expect(hasError(moved, /thẳng hàng/)).toBe(true);
  });
  it('bánh bị xoay nghiêng hoặc không chạm đất là lỗi', () => {
    const d = base();
    const front = findWheels(d).front!;
    expect(hasError(updatePart(d, front.uid, { rotationDeg: [0, 30, 0] }), /xoay nghiêng/)).toBe(true);
    expect(hasError(updatePart(d, front.uid, { position: [front.position[0], 0.05, 0] }), /không chạm đất/)).toBe(true);
    // xoay quanh trục bánh thì không sao
    expect(hasError(updatePart(d, front.uid, { rotationDeg: [0, 0, 45] }), /xoay nghiêng/)).toBe(false);
  });
  it('đổi khung thì bánh tự về đúng trục, linh kiện gắn bánh đi theo', () => {
    const d = setFrame(base(), { wheelbase: 0.25 });
    const { rear, front } = findWheels(d);
    expect(rear!.position).toEqual([-0.125, WHEEL_RADIUS, 0]);
    expect(front!.position).toEqual([0.125, WHEEL_RADIUS, 0]);
    expect(partByName(d, 'dongCoSau').position[0]).toBeCloseTo(-0.125, 6);
  });
});

describe('kích thước và khối lượng', () => {
  it('xe dài quá 35 cm là lỗi', () => {
    // gắn laser chìa ra xa phía trước
    const d = addPart(base(), 'vl53l0x', { position: [0.23, 0.12, 0], name: 'laserXa' }).design;
    expect(hasError(d, /dài .* vượt giới hạn 35,0 cm/)).toBe(true);
  });
  it('xe rộng quá 15 cm là lỗi', () => {
    const d = addPart(base(), 'bracket_3d', { position: [0, 0.12, 0.1] }).design;
    expect(hasError(d, /rộng .* vượt giới hạn 15,0 cm/)).toBe(true);
  });
  it('xe cao quá 30 cm là lỗi', () => {
    const d = addPart(base(), 'bracket_3d', { position: [0, 0.3, 0] }).design;
    expect(hasError(d, /cao .* vượt giới hạn 30,0 cm/)).toBe(true);
  });
  it('xe nặng quá 1,5 kg là lỗi', () => {
    let d = base();
    for (let i = 0; i < 6; i++) {
      d = addPart(d, 'flywheel_steel_100', { position: [-0.1 + i * 0.03, 0.25, 0.03] }).design;
    }
    expect(checkDesign(d).totalMassKg).toBeGreaterThan(1.5);
    expect(hasError(d, /nặng .* vượt giới hạn 1,500 kg/)).toBe(true);
  });
  it('tính khối lượng, chi phí, trọng tâm', () => {
    const d = base();
    const s = computeStats(d);
    const partsMass = d.parts.reduce((m, p) => m + CATALOG_BY_ID[p.itemId].massKg, 0);
    expect(s.totalMassKg).toBeCloseTo(partsMass + d.frame.massKg, 3);
    const partsCost = d.parts.reduce((c, p) => c + (CATALOG_BY_ID[p.itemId].providedByBtc ? 0 : CATALOG_BY_ID[p.itemId].priceVnd), 0);
    expect(s.totalCostVnd).toBe(partsCost + 60_000); // khung mica
    expect(Math.abs(s.centerOfMass[2])).toBeLessThan(0.005);
    expect(s.centerOfMass[1]).toBeGreaterThan(0);
  });
  it('trọng tâm = trung bình có trọng số giữa khung và linh kiện', () => {
    const d: VehicleDesign = { ...createEmptyDesign(), parts: [] };
    const one = addPart(d, 'battery_18650x2', { position: [0.05, 0.2, 0.01] }).design;
    const s = computeStats(one);
    const fm = computeFrameMass(one.frame), bm = 0.1;
    expect(s.centerOfMass[0]).toBeCloseTo((0.05 * bm) / (fm + bm), 4);
  });
});

describe('vi điều khiển và bánh đà', () => {
  it('không có hoặc có 2 vi điều khiển là lỗi', () => {
    const d = base();
    expect(hasError(removePart(d, partByName(d, 'viDieuKhien').uid), /chưa có vi điều khiển/)).toBe(true);
    const two = addPart(d, 'esp32', { position: [0.04, 0.2, 0] }).design;
    expect(hasError(two, /chỉ được có 1 vi điều khiển/)).toBe(true);
  });
  it('động cơ bánh đà thiếu đĩa là lỗi', () => {
    const d = base();
    expect(hasError(removePart(d, partByName(d, 'diaBanhDa').uid), /chưa có đĩa bánh đà/)).toBe(true);
  });
  it('đĩa bánh đà không gắn động cơ là lỗi', () => {
    const d = base();
    const fw = partByName(d, 'diaBanhDa');
    const r = checkDesign(updatePart(d, fw.uid, { attachTo: undefined }));
    expect(r.errors.some((e) => /chưa gắn vào động cơ bánh đà/.test(e))).toBe(true);
  });
  it('thêm đĩa bánh đà tự gắn vào động cơ bánh đà còn trống', () => {
    const b = base();
    const d = removePart(b, partByName(b, 'diaBanhDa').uid);
    const motor = d.parts.find((p) => p.itemId === 'motor_rw_dc')!;
    const r = addPart(d, 'flywheel_al_80');
    const fw = r.design.parts.find((p) => p.uid === r.uid)!;
    expect(fw.attachTo).toBe(motor.uid);
  });
  it('không có động cơ bánh đà thì chỉ cảnh báo', () => {
    let d = base();
    d = removePart(d, partByName(d, 'diaBanhDa').uid);
    d = removePart(d, partByName(d, 'banhDa').uid);
    const r = checkDesign(d);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('bánh đà'))).toBe(true);
  });
});

describe('chồng lấn và chạm đất', () => {
  it('hai linh kiện chồng lên nhau là lỗi', () => {
    const d = base();
    const imu = partByName(d, 'imu');
    const moved = movePart(d, partByName(d, 'driver').uid, { position: imu.position });
    expect(hasError(moved, /"imu" và "driver" đang chồng lên nhau|"driver" và "imu" đang chồng lên nhau/)).toBe(true);
  });
  it('đĩa bánh đà gắn vào động cơ thì không tính chồng lấn với động cơ', () => {
    const d = base();
    const r = checkDesign(d);
    expect(r.errors.some((e) => e.includes('chồng'))).toBe(false);
  });
  it('linh kiện chạm đất là lỗi, gầm thấp thì cảnh báo', () => {
    const d = base();
    const pin = partByName(d, 'pin');
    expect(hasError(movePart(d, pin.uid, { position: [0, 0.005, 0] }), /"pin" chạm đất/)).toBe(true);
    const low = checkDesign(movePart(d, pin.uid, { position: [0, 0.018, 0] }));
    expect(low.ok).toBe(true);
    expect(low.warnings.some((w) => w.includes('bãi đá'))).toBe(true);
  });
});

describe('tên và chân cắm', () => {
  it('kiểm tra tên trùng / sai định dạng', () => {
    const d = base();
    const imu = partByName(d, 'imu');
    expect(validatePartName(d, imu.uid, 'laserTruoc')).toMatch(/đã được dùng/);
    expect(validatePartName(d, imu.uid, 'LASERTRUOC')).toMatch(/đã được dùng/);
    expect(validatePartName(d, imu.uid, 'cảm biến')).toMatch(/không dấu/);
    expect(validatePartName(d, imu.uid, '1abc')).toMatch(/không bắt đầu bằng số/);
    expect(validatePartName(d, imu.uid, '')).toMatch(/trống/);
    expect(validatePartName(d, imu.uid, 'imuChinh')).toBeNull();
    expect(validatePartName(d, imu.uid, 'imu')).toBeNull(); // giữ nguyên tên mình
    expect(hasError(updatePart(d, imu.uid, { name: 'laserTruoc' }), /bị trùng/)).toBe(true);
  });
  it('trùng chân cắm là lỗi, bus I2C dùng chung được', () => {
    const d = base();
    const drv = partByName(d, 'driver');
    expect(hasError(updatePart(d, drv.uid, { pin: 'D9' }), /Chân D9 đang được dùng/)).toBe(true);
    expect(hasError(updatePart(d, drv.uid, { pin: 'GPIO4' }), /không có trên Arduino Nano/)).toBe(true);
    expect(checkDesign(d).errors).toEqual([]); // imu + laser cùng I2C
  });
});

describe('di chuyển có linh kiện con', () => {
  it('di chuyển động cơ bánh đà thì đĩa đi theo', () => {
    const d = base();
    const motor = partByName(d, 'banhDa');
    const fw0 = partByName(d, 'diaBanhDa');
    const moved = movePart(d, motor.uid, { position: [motor.position[0], motor.position[1] + 0.01, motor.position[2]] });
    expect(partByName(moved, 'diaBanhDa').position[1]).toBeCloseTo(fw0.position[1] + 0.01, 6);
  });
  it('xoay động cơ 90° quanh y thì đĩa xoay quanh động cơ', () => {
    const d = base();
    const motor = partByName(d, 'banhDa');
    const fw0 = partByName(d, 'diaBanhDa');
    const dx = fw0.position[0] - motor.position[0];
    const moved = movePart(d, motor.uid, { rotationDeg: [0, 90, 0] });
    const fw = partByName(moved, 'diaBanhDa');
    expect(fw.position[0]).toBeCloseTo(motor.position[0], 4);
    expect(fw.position[2]).toBeCloseTo(motor.position[2] - dx, 4);
    expect(fw.rotationDeg[1]).toBeCloseTo(90, 3);
  });
});

describe('hình học', () => {
  it('ma trận xoay khớp three.js (z 90°: x → y)', () => {
    const m = eulerXYZToMat3([0, 0, 90]);
    expect(m[3]).toBeCloseTo(1); // cột x = (0,1,0)
  });
  it('SAT phát hiện chồng lấn hộp xoay 45°', () => {
    const a = makeOBB([0, 0, 0], [0.1, 0.1, 0.1], [0, 0, 0]);
    const b = makeOBB([0.115, 0, 0], [0.1, 0.1, 0.1], [0, 0, 45]);
    const c = makeOBB([0.125, 0, 0], [0.1, 0.1, 0.1], [0, 0, 45]);
    expect(obbOverlap(a, b)).toBe(true); // 0.05 + 0.0707 > 0.115
    expect(obbOverlap(a, c)).toBe(false);
  });
});
