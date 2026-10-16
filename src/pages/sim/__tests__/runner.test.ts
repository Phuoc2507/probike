// Kiểm chứng headless: code PID mẫu của trang (chạy bằng runtime thí sinh) giữ thăng bằng ≥ 30 s và chạy hết straight.
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { LocalControllerRuntime, blocksJsonToJs } from '@/code';
import { createSampleVehicle } from '../sampleVehicle';
import { checkDesign } from '@/assembly';
import type { MapId, SimConfig } from '@/shared/types';
import { SimRunner, actuatorNames } from '../runner';
import { DEFAULT_PARAMS, MAX_TIME_S, samplePidBlocks, samplePidCode } from '../samples';
import { namesFromDesign } from '../designNames';

const SAMPLE_DESIGN = createSampleVehicle();

beforeAll(async () => {
  await RAPIER.init();
});

function cfg(mapId: MapId, seed = 1): SimConfig {
  return {
    design: SAMPLE_DESIGN, mapId, seed, realism: 'medium', maxTimeS: MAX_TIME_S[mapId], disturbances: mapId === 'balance_flat',
  };
}

async function run(mapId: MapId, params: Record<string, number>, code = samplePidCode(namesFromDesign(SAMPLE_DESIGN)), seed = 1) {
  const runtime = new LocalControllerRuntime({ actuators: actuatorNames(SAMPLE_DESIGN), params });
  const r = new SimRunner({ config: cfg(mapId, seed), code, params, realtime: false, runtime });
  const res = await r.run();
  r.dispose();
  return res;
}

describe('trang mô phỏng — vòng lặp headless', () => {
  it('xe mẫu hợp lệ theo luật lắp ráp', () => {
    expect(checkDesign(SAMPLE_DESIGN).errors).toEqual([]);
  });

  it('tìm đúng tên linh kiện cho code mẫu', () => {
    expect(namesFromDesign(SAMPLE_DESIGN)).toEqual({ flywheel: 'banhDa', encoder: 'encBanhDa', drive: 'dongCoSau' });
  });

  it.each([1, 2, 3])('PID mẫu giữ thăng bằng ≥ 30 s trên balance_flat có đẩy (seed %i)', async (seed) => {
    const res = await run('balance_flat', { ...DEFAULT_PARAMS, tocDo: 0 }, undefined, seed);
    expect(res.reason).toBe('completed');
    expect(res.balancedS).toBeGreaterThanOrEqual(30);
    expect(res.checkpoints).toContain('giu_30s');
  }, 60_000);

  it('PID mẫu chạy hết straight', async () => {
    const res = await run('straight', DEFAULT_PARAMS);
    expect(res.reason).toBe('completed');
    expect(res.score).toBeGreaterThan(0);
  }, 60_000);

  it('mẫu dạng khối sinh JS giữ thăng bằng ≥ 30 s', async () => {
    const js = blocksJsonToJs(samplePidBlocks(namesFromDesign(SAMPLE_DESIGN)));
    expect(js).toContain('encoder(');
    const res = await run('balance_flat', { ...DEFAULT_PARAMS, tocDo: 0 }, js, 4);
    expect(res.balancedS).toBeGreaterThanOrEqual(30);
  }, 60_000);

  it('code lỗi → kết thúc code_error kèm thông báo', async () => {
    const res = await run('balance_flat', DEFAULT_PARAMS, 'function loop() { khongCo(); }');
    expect(res.reason).toBe('code_error');
    expect(res.errorMessage).toBeTruthy();
  });
});
