import { describe, expect, it } from 'vitest';
import { analyzeVehicle, BARE_ROTOR_INERTIA, DesignError, principalAxes } from '../vehicle';
import { SAMPLE_DESIGN } from '../sampleDesign';
import { qRotate, v3 } from '../math';
import { sharpDistance, sharpVoltage } from '../sensors';
import { computeScore } from '../scoring';

describe('phân tích thiết kế xe', () => {
  it('xe mẫu: khối lượng, trọng tâm, gán bánh đà/động cơ/encoder', () => {
    const m = analyzeVehicle(SAMPLE_DESIGN);
    expect(m.totalMass).toBeGreaterThan(0.4);
    expect(m.totalMass).toBeLessThan(1.5);
    expect(Math.abs(m.centerOfMass.z)).toBeLessThan(0.002);
    expect(m.centerOfMass.y).toBeGreaterThan(0.06);
    expect(m.loopHz).toBe(500);
    expect(m.reactions).toHaveLength(1);
    expect(m.reactions[0].flywheelUid).toBe('rw_disc');
    expect(m.reactions[0].spinInertia).toBeCloseTo(0.5 * 0.2 * 0.05 * 0.05 + BARE_ROTOR_INERTIA, 9);
    expect(m.drives).toEqual([expect.objectContaining({ name: 'dongCoSau', wheelUid: 'w_rear' })]);
    expect(m.sensors.find((s) => s.name === 'encBanhDa')?.target).toEqual({ type: 'reaction', uid: 'rw_motor' });
    expect(m.rear.uid).toBe('w_rear');
    expect(m.front.front).toBe(true);
    expect(m.warnings).toEqual([]);
  });

  it('báo lỗi khi không đủ 2 bánh', () => {
    const bad = { ...SAMPLE_DESIGN, parts: SAMPLE_DESIGN.parts.filter((p) => p.uid !== 'w_front') };
    expect(() => analyzeVehicle(bad)).toThrow(DesignError);
  });

  it('trục quán tính chính tái tạo đúng ma trận', () => {
    const I = [[3, 0.4, 0.1], [0.4, 2, -0.3], [0.1, -0.3, 1]];
    const { values, frame } = principalAxes(I);
    const cols = [qRotate(frame, v3(1, 0, 0)), qRotate(frame, v3(0, 1, 0)), qRotate(frame, v3(0, 0, 1))];
    const d = [values.x, values.y, values.z];
    const get = (c: { x: number; y: number; z: number }, i: number) => [c.x, c.y, c.z][i];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += get(cols[k], i) * d[k] * get(cols[k], j);
        expect(s).toBeCloseTo(I[i][j], 6);
      }
  });
});

describe('cảm biến & điểm', () => {
  it('Sharp GP2Y0A21: đường cong phi tuyến, gập lại dưới 7 cm', () => {
    expect(sharpVoltage(10)).toBeGreaterThan(sharpVoltage(20));
    expect(sharpVoltage(20) - sharpVoltage(30)).toBeGreaterThan(sharpVoltage(60) - sharpVoltage(70));
    expect(sharpDistance(sharpVoltage(35))).toBeCloseTo(35, 6);
    // vật ở 3 cm bị đọc thành xa hơn (gập)
    expect(sharpDistance(sharpVoltage(3))).toBeGreaterThan(10);
  });

  it('công thức điểm', () => {
    expect(computeScore({ mapId: 'straight', reason: 'fell', timeS: 1, checkpoints: 0, maxRollDeg: 50, balancedS: 1 })).toBe(0);
    // về đích nhanh hơn chuẩn, không nghiêng: 100 + 200 + 100
    expect(computeScore({ mapId: 'straight', reason: 'completed', timeS: 2, checkpoints: 1, maxRollDeg: 0, balancedS: 2 })).toBe(400);
    // chậm gấp đôi chuẩn, nghiêng tối đa 22,5°: 100 + 100 + 50
    expect(computeScore({ mapId: 'straight', reason: 'completed', timeS: 5, checkpoints: 1, maxRollDeg: 22.5, balancedS: 5 })).toBe(250);
    // balance_flat không có thưởng tốc độ
    expect(computeScore({ mapId: 'balance_flat', reason: 'completed', timeS: 30, checkpoints: 3, maxRollDeg: 0, balancedS: 30 })).toBe(400);
  });
});
