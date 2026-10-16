import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import type { SensorFrame } from '@/shared/types';
import { ControllerCore } from '../runtime/core';
import { pidTutorial } from '../samples/tutorial';
import { EMPTY_JS, samplePidJs } from '../samples/samples';
import { probikeCompletionSource } from '../editor/completions';

const frame = (t: number, roll: number): SensorFrame => ({
  t, values: { encBanhDa: 12 }, imu: { roll, pitch: 0, yaw: 0, gyro: [roll * 2, 0, 0], acc: [0, 9.8, 0] },
});

describe('Code mẫu và bài hướng dẫn', () => {
  it('mọi bước hướng dẫn nạp và chạy được, motor ngược chiều nghiêng', () => {
    for (const step of pidTutorial('banhDa')) {
      const core = new ControllerCore();
      const res = core.load(step.code);
      expect(res, step.id).toEqual({ ok: true });
      const params = Object.fromEntries(step.sliders.map((s) => [s.name, s.default]));
      core.setParams(params);
      core.tick(frame(0, 0));
      const cmd = core.tick(frame(0.01, 0.01));
      if (step.id !== 'read_angle') expect(cmd.banhDa, step.id).toBeLessThan(0);
      const labels = new Set(core.drainPlots().map((p) => p.label));
      for (const p of step.plots) expect(labels.has(p), `${step.id}: ${p}`).toBe(true);
    }
  });

  it('thanh trượt đổi hệ số ngay khi đang chạy (param + setTunings)', () => {
    const core = new ControllerCore({ params: { Kp: 10, Ki: 0, Kd: 0 } });
    core.load(samplePidJs('banhDa'));
    expect(core.tick(frame(0, 0.01)).banhDa).toBeCloseTo(-0.1);
    core.setParams({ Kp: 30 });
    expect(core.tick(frame(0.01, 0.01)).banhDa).toBeCloseTo(-0.3);
  });

  it('khung JS trống chạy được', () => {
    const core = new ControllerCore();
    expect(core.load(EMPTY_JS)).toEqual({ ok: true });
  });
});

describe('Gợi ý trong CodeEditor', () => {
  const source = probikeCompletionSource(() => ['banhDa', 'laserTruoc']);
  const complete = (doc: string, explicit = false) => {
    const state = EditorState.create({ doc });
    return source(new CompletionContext(state, doc.length, explicit));
  };

  it('gợi ý tên linh kiện trong motor("…") và read(\'…\')', () => {
    const r = complete('motor("ba');
    expect(r?.options.map((o) => o.label)).toEqual(['banhDa', 'laserTruoc']);
    expect(r?.from).toBe('motor("'.length);
    expect(complete("const x = read('")?.options).toHaveLength(2);
  });

  it('gợi ý phương thức imu. và pid.', () => {
    expect(complete('imu.ro')?.options.map((o) => o.label)).toContain('roll');
    const r = complete('const pid = new PID(1, 0, 0);\npid.up');
    expect(r?.options.map((o) => o.label)).toContain('update');
    expect(complete('const a = {};\na.b')).toBeNull();
  });

  it('gợi ý hàm API theo từ đang gõ', () => {
    const r = complete('mot');
    expect(r?.options.map((o) => o.label)).toEqual(expect.arrayContaining(['motor', 'millis', 'PID', 'imu']));
    expect(r?.from).toBe(0);
  });
});
