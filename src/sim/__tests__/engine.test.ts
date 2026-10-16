import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ActuatorCommand, MapId, Realism, SensorFrame, SimConfig, VehicleDesign } from '@/shared/types';
import { createSimEngine, RapierSimEngine } from '../engine';
import { pointAt, projectOnPath } from '../maps/geometry';
import { qRotate, v3 } from '../math';
import { SAMPLE_DESIGN, SampleBalanceController } from '../sampleDesign';

beforeAll(async () => {
  await RAPIER.init();
});

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return { design: SAMPLE_DESIGN, mapId: 'balance_flat', seed: 1, realism: 'medium', maxTimeS: 10, disturbances: false, ...over };
}

async function runWith(
  config: SimConfig,
  control: (frame: SensorFrame, e: RapierSimEngine) => ActuatorCommand,
): Promise<RapierSimEngine> {
  const e = createSimEngine();
  await e.init(config);
  let guard = 0;
  while (!e.result() && guard++ < 1e6) e.step(control(e.sensors(), e));
  return e;
}

async function runSample(mapId: MapId, drive: number, over: Partial<SimConfig> = {}) {
  const c = new SampleBalanceController(undefined, undefined, drive);
  const e = await runWith(cfg({ mapId, ...over }), (f, eng) => c.update(f, eng.controlPeriod));
  const r = e.result()!;
  e.dispose();
  return r;
}

const STEER_DESIGN: VehicleDesign = {
  ...SAMPLE_DESIGN,
  frame: { ...SAMPLE_DESIGN.frame, steerable: true },
  parts: [...SAMPLE_DESIGN.parts, { uid: 'sv', itemId: 'servo_sg90', name: 'lai', position: [0.08, 0.08, 0], rotationDeg: [0, 0, 0] }],
};

describe('SimEngine — cơ bản', () => {
  it('chu kỳ điều khiển theo vi điều khiển, mỗi step chạy đúng một chu kỳ', async () => {
    const e = createSimEngine();
    await e.init(cfg());
    expect(e.controlPeriod).toBeCloseTo(1 / 500, 9);
    for (let i = 0; i < 10; i++) e.step({});
    expect(e.sensors().t).toBeCloseTo(10 / 500, 9);
    e.dispose();

    const nano: VehicleDesign = {
      ...SAMPLE_DESIGN,
      parts: SAMPLE_DESIGN.parts.map((p) => (p.uid === 'mcu' ? { ...p, itemId: 'arduino_nano' } : p)),
    };
    const e2 = createSimEngine();
    await e2.init(cfg({ design: nano }));
    expect(e2.controlPeriod).toBeCloseTo(0.01, 9);
    e2.step({});
    expect(e2.sensors().t).toBeCloseTo(0.01, 9);
    e2.dispose();
  });

  it('không điều khiển thì xe đổ', async () => {
    const e = await runWith(cfg({ maxTimeS: 5 }), () => ({}));
    const r = e.result()!;
    expect(r.reason).toBe('fell');
    expect(r.timeS).toBeLessThan(3);
    expect(r.score).toBe(0);
    e.dispose();
  });

  it('snapshot có thân, 2 bánh, bánh đà và tốc độ', async () => {
    const e = createSimEngine();
    await e.init(cfg({ mapId: 'seesaw' }));
    const c = new SampleBalanceController(undefined, undefined, 0.8);
    for (let i = 0; i < 500; i++) e.step(c.update(e.sensors(), e.controlPeriod));
    const s = e.snapshot();
    expect(s.bike.id).toBe('bike');
    expect(s.parts.map((p) => p.id).sort()).toEqual(['rw_disc', 'w_front', 'w_rear']);
    expect(s.dynamic.map((d) => d.id)).toEqual(['seesaw']);
    expect(s.speed).toBeGreaterThan(0.2);
    for (const p of s.parts) expect(Math.hypot(...p.quaternion)).toBeCloseTo(1, 5);
    e.dispose();
  });

  it('abort() kết thúc lượt với lý do do bên ngoài đưa vào', async () => {
    const e = createSimEngine();
    await e.init(cfg());
    e.step({});
    e.abort('code_error', 'loop() ném lỗi');
    expect(e.result()).toMatchObject({ reason: 'code_error', errorMessage: 'loop() ném lỗi' });
    e.dispose();
  });
});

describe('SimEngine — xe mẫu với PID mẫu', () => {
  it.each([
    ['medium', 1],
    ['high', 2],
  ] as [Realism, number][])('giữ thăng bằng ≥ 30 s trên balance_flat có đẩy (realism %s, seed %i)', async (realism, seed) => {
    const r = await runSample('balance_flat', 0, { maxTimeS: 32, disturbances: true, realism, seed });
    expect(r.reason).toBe('completed');
    expect(r.balancedS).toBeGreaterThanOrEqual(30);
    expect(r.checkpoints).toEqual(['giu_10s', 'giu_20s', 'giu_30s']);
    expect(r.maxRollDeg).toBeGreaterThan(1); // có bị đẩy thật
    expect(r.score).toBeGreaterThan(350);
  });

  it('thiếu phản hồi tốc độ bánh đà thì bánh đà bão hoà và xe đổ', async () => {
    const c = new SampleBalanceController({ kp: 0.3, kd: 0.025, kw: 0, ki: 0 });
    const e = await runWith(cfg({ maxTimeS: 30, disturbances: true, realism: 'high' }), (f, eng) => c.update(f, eng.controlPeriod));
    expect(e.result()!.reason).toBe('fell');
    e.dispose();
  });

  it('chạy hết đoạn straight', async () => {
    const r = await runSample('straight', 0.5, { maxTimeS: 15, realism: 'high' });
    expect(r.reason).toBe('completed');
    expect(r.checkpoints).toEqual(['xuat_phat']);
    expect(r.timeS).toBeLessThan(4);
  });

  it('cú đẩy mạnh làm xe ngã', async () => {
    const c = new SampleBalanceController();
    let k = 0;
    const e = await runWith(cfg({ maxTimeS: 6 }), (f, eng) => {
      if (k++ === 500) eng.push(0.3);
      return c.update(f, eng.controlPeriod);
    });
    expect(e.result()!.reason).toBe('fell');
    e.dispose();
  });

  it('chạy mãi trên balance_flat thì ra khỏi map', async () => {
    const r = await runSample('balance_flat', 1, { maxTimeS: 10 });
    expect(r.reason).toBe('out_of_bounds');
  });

  it('đứng yên trên straight thì hết giờ', async () => {
    const r = await runSample('straight', 0, { maxTimeS: 2 });
    expect(r.reason).toBe('timeout');
    expect(r.checkpoints).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('có servo lái + bám đường: qua hết full_course', async () => {
    const c = new SampleBalanceController(undefined, undefined, 0.8);
    const e = await runWith(cfg({ design: STEER_DESIGN, mapId: 'full_course', maxTimeS: 30, seed: 2 }), (f, eng) => {
      // bám đường kiểu pure-pursuit dùng vị trí thật (chỉ để kiểm tra sa hình đi được)
      const s = eng.snapshot();
      const [x, , z] = s.bike.position;
      const q = s.bike.quaternion;
      const fw = qRotate({ x: q[0], y: q[1], z: q[2], w: q[3] }, v3(1, 0, 0));
      const tgt = pointAt(eng.map.path, projectOnPath(eng.map.path, x, z).s + 0.25).position;
      let a = Math.atan2(tgt[2] - z, tgt[0] - x) - Math.atan2(fw.z, fw.x);
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const steer = (Math.atan((2 * 0.16 * Math.sin(a)) / 0.25) * 180) / Math.PI;
      // vào cua phải nghiêng vào trong: tan(φ) = v·ω/g
      c.rollTarget = (Math.atan((s.speed * (-f.imu!.gyro[1] * Math.PI) / 180) / 9.81) * 180) / Math.PI;
      return { ...c.update(f, eng.controlPeriod), lai: steer };
    });
    const r = e.result()!;
    expect(r.reason).toBe('completed');
    expect(r.checkpoints).toEqual(['xuat_phat', 'cua_u', 'cau_bap_benh', 'bai_da', 'dich']);
    expect(r.score).toBeGreaterThan(700);
    e.dispose();
  });
});

describe('SimEngine — cảm biến', () => {
  const SENSOR_DESIGN: VehicleDesign = {
    ...SAMPLE_DESIGN,
    parts: [
      ...SAMPLE_DESIGN.parts,
      { uid: 'tof', itemId: 'vl53l1x', name: 'laserTruoc', position: [0.11, 0.06, 0], rotationDeg: [0, 0, 0] },
      { uid: 'us', itemId: 'hcsr04', name: 'sieuAm', position: [0.11, 0.09, 0], rotationDeg: [0, 0, 0] },
      { uid: 'ir', itemId: 'sharp_gp2y0a21', name: 'irTrai', position: [0, 0.06, 0.03], rotationDeg: [0, -90, 0] },
      { uid: 'line', itemId: 'tcrt5000', name: 'doVach', position: [0, 0.02, 0], rotationDeg: [0, 0, -90] },
      { uid: 'lidar', itemId: 'lidar_ld06', name: 'lidar', position: [-0.05, 0.13, 0], rotationDeg: [0, 0, 0] },
    ],
  };

  it('đọc khoảng cách tới vách cuối, vách bên, vạch sơn và LiDAR 360', async () => {
    const e = createSimEngine();
    await e.init(cfg({ design: SENSOR_DESIGN, mapId: 'straight', realism: 'low', maxTimeS: 5 }));
    const c = new SampleBalanceController();
    const f0 = e.sensors();
    // vạch xuất phát nằm ngay dưới gốc xe
    expect(f0.values.doVach).toBe(1);
    for (let i = 0; i < 300; i++) e.step(c.update(e.sensors(), e.controlPeriod));
    const f = e.sensors();
    // xe ở x≈0,2; vách cuối ở 1,2 + 0,35 = 1,55 → laser ở x≈0,31 cách ~124 cm
    expect(f.values.laserTruoc as number).toBeGreaterThan(115);
    expect(f.values.laserTruoc as number).toBeLessThan(132);
    expect(f.values.sieuAm as number).toBeGreaterThan(110);
    expect(f.values.sieuAm as number).toBeLessThan(132);
    // IR hướng sang +z (y = −90° quay x → +z): vách trong cách tâm 25 cm, cảm biến lệch 3 cm
    expect(f.values.irTrai as number).toBeGreaterThan(18);
    expect(f.values.irTrai as number).toBeLessThan(26);
    const scan = f.values.lidar as number[];
    expect(scan).toHaveLength(360);
    expect(scan[90]).toBeGreaterThan(22);
    expect(scan[90]).toBeLessThan(28);
    expect(scan[270]).toBeGreaterThan(22);
    expect(scan[270]).toBeLessThan(28);
    expect(f.values.encBanhDa).toBeTypeOf('number');
    expect(f.imu).not.toBeNull();
    expect(f.imu!.acc[1]).toBeGreaterThan(9);
    // chạy tới khỏi vạch: nền xám ở 1,2 cm → 0
    c.drive = 0.5;
    for (let i = 0; i < 500; i++) e.step(c.update(e.sensors(), e.controlPeriod));
    expect(e.sensors().values.doVach).toBe(0);
    expect(e.sensors().values.laserTruoc as number).toBeLessThan(110);
    e.dispose();
  });

  it('giữ đúng tần số cập nhật (ToF VL53L1X 50 Hz)', async () => {
    const e = createSimEngine();
    await e.init(cfg({ design: SENSOR_DESIGN, mapId: 'straight', maxTimeS: 5 }));
    const c = new SampleBalanceController();
    let last = e.sensors().values.laserTruoc;
    let changes = 0;
    for (let i = 0; i < 500; i++) {
      e.step(c.update(e.sensors(), e.controlPeriod));
      const v = e.sensors().values.laserTruoc;
      if (v !== last) changes++;
      last = v;
    }
    // 1 giây mô phỏng → ~50 lần cập nhật
    expect(changes).toBeGreaterThanOrEqual(48);
    expect(changes).toBeLessThanOrEqual(51);
    e.dispose();
  });

  it('cùng seed cho cùng kết quả; độ thực tế cao nhiễu hơn thấp', async () => {
    const trace = async (seed: number, realism: Realism) => {
      const e = createSimEngine();
      await e.init(cfg({ seed, realism, disturbances: true }));
      const c = new SampleBalanceController();
      const out: number[] = [];
      let err2 = 0;
      for (let i = 0; i < 1000; i++) {
        const f = e.sensors();
        out.push(f.imu!.roll);
        err2 += (f.imu!.roll - e.trueRollDeg) ** 2;
        e.step(c.update(f, e.controlPeriod));
      }
      e.dispose();
      return { out, rms: Math.sqrt(err2 / 1000) };
    };
    const a = await trace(5, 'medium');
    const b = await trace(5, 'medium');
    const c = await trace(6, 'medium');
    expect(a.out).toEqual(b.out);
    expect(a.out).not.toEqual(c.out);
    const lo = await trace(5, 'low');
    const hi = await trace(5, 'high');
    expect(hi.rms).toBeGreaterThan(lo.rms * 2);
  });
});
