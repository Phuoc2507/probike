import { describe, expect, it } from 'vitest';
import { buildMapGeometry, pointAt, projectOnPath } from '../maps/geometry';
import { COURSE, MAP_IDS, SEGMENTS } from '../maps/spec';

describe('hình học sa hình', () => {
  it('dựng đủ 6 map, mỗi map có checkpoint', () => {
    for (const id of MAP_IDS) {
      const g = buildMapGeometry(id, 1);
      expect(g.id).toBe(id);
      expect(g.checkpoints.length).toBeGreaterThan(0);
    }
  });

  it('full_course đúng thứ tự đoạn và nằm gọn trong 4,0 × 2,5 m', () => {
    const g = buildMapGeometry('full_course', 1);
    expect(g.checkpoints.map((c) => c.id)).toEqual(['xuat_phat', 'cua_u', 'cau_bap_benh', 'bai_da', 'dich']);
    const w = g.bounds.max[0] - g.bounds.min[0];
    const d = g.bounds.max[2] - g.bounds.min[2];
    expect(w).toBeLessThanOrEqual(COURSE.sizeM[0]);
    expect(d).toBeLessThanOrEqual(COURSE.sizeM[1]);
    // cua U bán kính tâm 60 cm: hai làn cách nhau 1,2 m
    const afterU = pointAt(g.path, g.checkpoints[1].s);
    expect(afterU.position[2]).toBeCloseTo(2 * SEGMENTS.uTurn.radius, 6);
    expect(Math.cos(afterU.heading)).toBeCloseTo(-1, 6);
  });

  it('chiếu điểm lên đường tâm khớp với pointAt', () => {
    const g = buildMapGeometry('full_course', 1);
    for (const s of [0.3, 1.0, 1.6, 2.5, 3.5, 4.4, 5.2]) {
      const p = pointAt(g.path, s);
      const n = [-Math.sin(p.heading), Math.cos(p.heading)];
      const pr = projectOnPath(g.path, p.position[0] + 0.1 * n[0], p.position[2] + 0.1 * n[1]);
      expect(pr.s).toBeCloseTo(s, 4);
      expect(pr.lateral).toBeCloseTo(0.1, 4);
    }
  });

  it('cầu bập bênh: rộng 25 cm, dài 1 m, ±10°, trục cao ≈ 8,7 cm, không có đá', () => {
    const g = buildMapGeometry('seesaw', 1);
    expect(g.seesaw).not.toBeNull();
    expect(g.seesaw!.width).toBe(0.25);
    expect(g.seesaw!.length).toBe(1.0);
    expect(g.seesaw!.maxTiltDeg).toBe(10);
    expect(g.seesaw!.pivot[1]).toBeCloseTo(0.0868, 3);
    expect(g.rocks.length).toBe(0);
  });

  it('bãi đá sinh theo seed, cao 0,5–1,5 cm, nằm trong lòng đường', () => {
    const a = buildMapGeometry('rocks', 7);
    const b = buildMapGeometry('rocks', 7);
    const c = buildMapGeometry('rocks', 8);
    expect(a.rocks.length).toBeGreaterThan(20);
    expect(a.rocks).toEqual(b.rocks);
    expect(a.rocks[0].position).not.toEqual(c.rocks[0].position);
    for (const r of a.rocks) {
      expect(r.radii[1]).toBeGreaterThanOrEqual(SEGMENTS.rocks.minHeight);
      expect(r.radii[1]).toBeLessThanOrEqual(SEGMENTS.rocks.maxHeight);
      const pr = projectOnPath(a.path, r.position[0], r.position[2]);
      expect(Math.abs(pr.lateral)).toBeLessThan(COURSE.laneWidth / 2);
      expect(pr.role).toBe('rocks');
    }
  });

  it('balance_flat là sàn mở, checkpoint theo thời gian giữ', () => {
    const g = buildMapGeometry('balance_flat');
    expect(g.kind).toBe('open');
    expect(g.walls.length).toBe(0);
    expect(g.checkpoints.map((c) => c.id)).toEqual(['giu_10s', 'giu_20s', 'giu_30s']);
  });
});
