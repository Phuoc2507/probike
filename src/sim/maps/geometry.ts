// Dựng hình học 6 map từ spec.ts. Hàm thuần (không Rapier, không three) — dùng chung cho
// lõi vật lý (tạo collider) và phần hiển thị 3D (vẽ hộp, đá, cầu).

import type { MapId, Quat, Vec3 } from '@/shared/types';
import { Rng, qHeading, qMul, qAxisAngle, qRotate, subSeed, toQuat, v3, DEG } from '../math';
import { BALANCE_FLAT, CHECKPOINT_NAMES, COURSE, MAP_NAMES, SEGMENTS } from './spec';

export type SegmentRole = 'lead' | 'start' | 'u_turn' | 'seesaw' | 'rocks' | 'finish' | 'runout';

/** Một đoạn của đường tâm. heading = góc hướng đi (rad), 0 = +x, dương quay về +z. */
export interface PathSegment {
  role: SegmentRole;
  kind: 'straight' | 'arc';
  s0: number;          // độ dài cung tích luỹ tại đầu đoạn
  length: number;
  start: Vec3;         // điểm đầu trên đường tâm (y = 0)
  heading: number;     // hướng tại đầu đoạn
  radius?: number;     // arc
  turn?: 1 | -1;       // arc: +1 quay về phía +z
  center?: Vec3;       // arc
  walls: boolean;
  checkpoint?: string; // checkpoint ở cuối đoạn
}

/** Hộp đặc: tâm, kích thước đầy đủ theo trục cục bộ (x dài, y cao, z ngang), hướng. */
export interface BoxGeom { center: Vec3; size: Vec3; quaternion: Quat }

export interface LineGeom extends BoxGeom { kind: 'start' | 'checkpoint' | 'finish' }

export interface CheckpointGeom {
  id: string;
  name: string;
  s: number;           // vị trí trên đường tâm
  position: Vec3;
  heading: number;
  width: number;
}

/** Viên đá: nửa ellipsoid nằm trên nền, convex hull `points` trong hệ cục bộ (trước khi quay yaw). */
export interface RockGeom {
  position: Vec3;
  radii: Vec3;         // bán trục x, y (= chiều cao nhô lên), z
  yaw: number;         // rad quanh y
  quaternion: Quat;
  points: number[];    // x,y,z,x,y,z...
}

export interface SeesawGeom {
  pivot: Vec3;         // tâm trục xoay = tâm mặt trên của ván khi nằm ngang
  heading: number;     // hướng đi qua cầu
  axis: Vec3;          // trục xoay (ngang, vuông góc hướng đi)
  length: number;
  width: number;
  thickness: number;
  /** Chiều dài đoạn vát ở mỗi đầu ván. */
  bevelLength: number;
  /** Convex hull của ván trong hệ cục bộ (gốc = trục xoay, x dọc cầu, mặt trên y = 0): x,y,z,... */
  points: number[];
  maxTiltDeg: number;
  /** Góc ban đầu (độ, dương = đầu ra cầu nhấc lên, đầu vào chạm nền). */
  initialTiltDeg: number;
  massKg: number;
  angularDamping: number;
}

export interface MapGeometry {
  id: MapId;
  name: string;
  kind: 'open' | 'course';
  floor: BoxGeom;
  walls: BoxGeom[];
  lines: LineGeom[];
  rocks: RockGeom[];
  seesaw: SeesawGeom | null;
  checkpoints: CheckpointGeom[];
  path: PathSegment[];
  totalLength: number;
  laneWidth: number;
  start: { position: Vec3; heading: number };
  bounds: { min: Vec3; max: Vec3 };
  colors: typeof COURSE.colors;
}

// ---------------------------------------------------------------- Định nghĩa map theo đoạn

interface SegDef {
  role: SegmentRole;
  length?: number;      // straight
  arc?: { radius: number; angleDeg: number; turn: 1 | -1 };
  checkpoint?: string;
  walls?: boolean;
}

const S = SEGMENTS;

const MAP_SEGMENTS: Record<Exclude<MapId, 'balance_flat'>, SegDef[]> = {
  straight: [
    { role: 'start', length: S.start.length, checkpoint: 'xuat_phat' },
    { role: 'runout', length: S.runout },
  ],
  u_turn: [
    { role: 'lead', length: S.leadIn },
    { role: 'u_turn', arc: { radius: S.uTurn.radius, angleDeg: S.uTurn.angleDeg, turn: 1 }, checkpoint: 'cua_u' },
    { role: 'lead', length: S.leadOut },
    { role: 'runout', length: S.runout },
  ],
  seesaw: [
    { role: 'lead', length: S.leadIn },
    { role: 'seesaw', length: S.seesaw.length, checkpoint: 'cau_bap_benh' },
    { role: 'lead', length: S.leadOut },
    { role: 'runout', length: S.runout },
  ],
  rocks: [
    { role: 'lead', length: S.leadIn },
    { role: 'rocks', length: S.rocks.length, checkpoint: 'bai_da' },
    { role: 'lead', length: S.leadOut },
    { role: 'runout', length: S.runout },
  ],
  full_course: [
    { role: 'start', length: S.start.length, checkpoint: 'xuat_phat' },
    { role: 'u_turn', arc: { radius: S.uTurn.radius, angleDeg: S.uTurn.angleDeg, turn: 1 }, checkpoint: 'cua_u' },
    { role: 'seesaw', length: S.seesaw.length, checkpoint: 'cau_bap_benh' },
    { role: 'rocks', length: S.rocks.length, checkpoint: 'bai_da' },
    { role: 'finish', length: S.finish.length, checkpoint: 'dich' },
    { role: 'runout', length: S.runout },
  ],
};

// ---------------------------------------------------------------- Đường tâm

const dirOf = (h: number) => v3(Math.cos(h), 0, Math.sin(h));
/** Pháp tuyến ngang phía +z ("trái") của hướng h. */
const leftOf = (h: number) => v3(-Math.sin(h), 0, Math.cos(h));

function layoutPath(defs: SegDef[]): PathSegment[] {
  const out: PathSegment[] = [];
  let p = v3(0, 0, 0);
  let h = 0;
  let s = 0;
  for (const d of defs) {
    if (d.arc) {
      const { radius, angleDeg, turn } = d.arc;
      const n = leftOf(h);
      const c = v3(p.x + turn * radius * n.x, 0, p.z + turn * radius * n.z);
      const len = radius * angleDeg * DEG;
      out.push({
        role: d.role, kind: 'arc', s0: s, length: len, start: [p.x, 0, p.z], heading: h,
        radius, turn, center: [c.x, 0, c.z], walls: d.walls ?? true, checkpoint: d.checkpoint,
      });
      const h2 = h + turn * angleDeg * DEG;
      // điểm cuối: c - turn·R·left(h2)
      const n2 = leftOf(h2);
      p = v3(c.x - turn * radius * n2.x, 0, c.z - turn * radius * n2.z);
      h = h2;
      s += len;
    } else {
      const len = d.length ?? 0;
      out.push({
        role: d.role, kind: 'straight', s0: s, length: len, start: [p.x, 0, p.z], heading: h,
        walls: d.walls ?? true, checkpoint: d.checkpoint,
      });
      const f = dirOf(h);
      p = v3(p.x + f.x * len, 0, p.z + f.z * len);
      s += len;
    }
  }
  return out;
}

/** Điểm và hướng trên đường tâm tại độ dài cung s. */
export function pointAt(path: PathSegment[], s: number): { position: Vec3; heading: number } {
  let seg = path[path.length - 1];
  for (const g of path) {
    if (s <= g.s0 + g.length) { seg = g; break; }
  }
  const u = Math.max(0, Math.min(seg.length, s - seg.s0));
  if (seg.kind === 'straight') {
    const f = dirOf(seg.heading);
    return { position: [seg.start[0] + f.x * u, 0, seg.start[2] + f.z * u], heading: seg.heading };
  }
  const turn = seg.turn ?? 1;
  const R = seg.radius ?? 1;
  const h = seg.heading + (turn * u) / R;
  const n = leftOf(h);
  const c = seg.center ?? [0, 0, 0];
  return { position: [c[0] - turn * R * n.x, 0, c[2] - turn * R * n.z], heading: h };
}

export interface PathProjection {
  s: number;        // độ dài cung (có thể < 0 hoặc > tổng nếu ra ngoài hai đầu)
  lateral: number;  // lệch ngang, dương về phía +z của hướng đi
  index: number;    // đoạn gần nhất
  role: SegmentRole;
}

function wrapPi(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** Chiếu điểm (x, z) lên đường tâm, chọn đoạn gần nhất. */
export function projectOnPath(path: PathSegment[], x: number, z: number): PathProjection {
  let best: PathProjection = { s: 0, lateral: 0, index: 0, role: path[0].role };
  let bestD = Infinity;
  path.forEach((g, i) => {
    let u: number;
    let lat: number;
    let d2: number;
    if (g.kind === 'straight') {
      const f = dirOf(g.heading);
      const n = leftOf(g.heading);
      const dx = x - g.start[0];
      const dz = z - g.start[2];
      u = dx * f.x + dz * f.z;
      lat = dx * n.x + dz * n.z;
      const uc = Math.max(0, Math.min(g.length, u));
      d2 = (u - uc) ** 2 + lat ** 2;
      const first = i === 0;
      const last = i === path.length - 1;
      if (!(first && u < 0) && !(last && u > g.length)) u = uc;
    } else {
      const turn = g.turn ?? 1;
      const R = g.radius ?? 1;
      const c = g.center ?? [0, 0, 0];
      const vx = x - c[0];
      const vz = z - c[2];
      const r = Math.hypot(vx, vz);
      const th = turn > 0 ? Math.atan2(vx, -vz) : Math.atan2(-vx, vz);
      const A = g.length / R;
      let phi = wrapPi(turn * (th - g.heading));
      if (phi < 0 || phi > A) {
        // ngoài cung: lấy đầu mút gần hơn
        const dStart = Math.abs(wrapPi(phi));
        const dEnd = Math.abs(wrapPi(phi - A));
        phi = dStart < dEnd ? 0 : A;
        const pe = pointAt([g], g.s0 + phi * R).position;
        d2 = (x - pe[0]) ** 2 + (z - pe[2]) ** 2;
      } else {
        d2 = (r - R) ** 2;
      }
      u = phi * R;
      lat = turn * (R - r);
    }
    if (d2 < bestD - 1e-9) {
      bestD = d2;
      best = { s: g.s0 + u, lateral: lat, index: i, role: g.role };
    }
  });
  return best;
}

// ---------------------------------------------------------------- Dựng hình học

function boxAlong(p: { x: number; z: number }, heading: number, y: number, size: Vec3): BoxGeom {
  return { center: [p.x, y, p.z], size, quaternion: toQuat(qHeading(heading)) };
}

function wallsFor(seg: PathSegment): BoxGeom[] {
  const W = COURSE.laneWidth;
  const T = COURSE.wallThickness;
  const H = COURSE.wallHeight;
  const off = W / 2 + T / 2;
  const out: BoxGeom[] = [];
  if (seg.kind === 'straight') {
    const f = dirOf(seg.heading);
    const n = leftOf(seg.heading);
    const mid = { x: seg.start[0] + (f.x * seg.length) / 2, z: seg.start[2] + (f.z * seg.length) / 2 };
    for (const side of [1, -1]) {
      out.push(boxAlong({ x: mid.x + side * off * n.x, z: mid.z + side * off * n.z }, seg.heading, H / 2,
        [seg.length + T, H, T]));
    }
    return out;
  }
  const turn = seg.turn ?? 1;
  const R = seg.radius ?? 1;
  const c = seg.center ?? [0, 0, 0];
  const A = seg.length / R;
  const N = Math.max(8, Math.ceil(A / (10 * DEG)));
  for (const side of [1, -1]) {
    // bán kính vách: phía trong (cùng phía tâm) nhỏ hơn
    const r = R - turn * side * off;
    for (let k = 0; k < N; k++) {
      const hMid = seg.heading + (turn * (k + 0.5) * A) / N;
      const n = leftOf(hMid);
      const p = { x: c[0] - turn * r * n.x, z: c[2] - turn * r * n.z };
      const len = 2 * r * Math.sin(A / N / 2) + T;
      out.push(boxAlong(p, hMid, H / 2, [len, H, T]));
    }
  }
  return out;
}

function endWall(path: PathSegment[], s: number): BoxGeom {
  const { position, heading } = pointAt(path, s);
  const f = dirOf(heading);
  const T = COURSE.wallThickness;
  const sign = s <= 0 ? -1 : 1;
  return boxAlong({ x: position[0] + sign * f.x * T / 2, z: position[2] + sign * f.z * T / 2 }, heading,
    COURSE.wallHeight / 2, [T, COURSE.wallHeight, COURSE.laneWidth + 2 * COURSE.wallThickness]);
}

function lineAt(path: PathSegment[], s: number, kind: LineGeom['kind']): LineGeom {
  const { position, heading } = pointAt(path, s);
  return { ...boxAlong({ x: position[0], z: position[2] }, heading, 0.0005, [COURSE.lineWidth, 0.001, COURSE.laneWidth]), kind };
}

function makeRocks(seg: PathSegment, seed: number): RockGeom[] {
  const R = SEGMENTS.rocks;
  const rng = new Rng(subSeed(seed, 101));
  const usable = COURSE.laneWidth - 2 * R.wallMargin;
  const count = Math.round(R.densityPerM2 * seg.length * usable);
  const f = dirOf(seg.heading);
  const n = leftOf(seg.heading);
  const rocks: RockGeom[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(R.minRadius, R.maxRadius);
    const b = rng.range(R.minRadius, R.maxRadius);
    const h = rng.range(R.minHeight, R.maxHeight);
    const u = rng.range(0.02 + a, seg.length - 0.02 - a);
    const lim = usable / 2 - Math.max(a, b);
    const lat = rng.range(-lim, lim);
    const yaw = rng.range(0, Math.PI);
    const points: number[] = [];
    const AZ = 8;
    for (const elev of [0, 35, 65]) {
      const ce = Math.cos(elev * DEG);
      const se = Math.sin(elev * DEG);
      for (let k = 0; k < AZ; k++) {
        const az = (k / AZ) * 2 * Math.PI + (elev ? Math.PI / AZ : 0);
        points.push(a * ce * Math.cos(az), h * se, b * ce * Math.sin(az));
      }
    }
    points.push(0, h, 0);
    // chân đá chìm 3 mm dưới nền để không có khe
    for (let k = 0; k < AZ; k++) {
      const az = (k / AZ) * 2 * Math.PI;
      points.push(a * 0.95 * Math.cos(az), -0.003, b * 0.95 * Math.sin(az));
    }
    const x = seg.start[0] + f.x * u + n.x * lat;
    const z = seg.start[2] + f.z * u + n.z * lat;
    rocks.push({ position: [x, 0, z], radii: [a, h, b], yaw, quaternion: toQuat(qAxisAngle(v3(0, 1, 0), yaw)), points });
  }
  return rocks;
}

function computeBounds(boxes: BoxGeom[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, COURSE.wallHeight, -Infinity];
  for (const b of boxes) {
    const q = { x: b.quaternion[0], y: b.quaternion[1], z: b.quaternion[2], w: b.quaternion[3] };
    for (const sx of [-0.5, 0.5])
      for (const sz of [-0.5, 0.5]) {
        const c = qRotate(q, v3(sx * b.size[0], 0, sz * b.size[2]));
        min[0] = Math.min(min[0], b.center[0] + c.x);
        min[2] = Math.min(min[2], b.center[2] + c.z);
        max[0] = Math.max(max[0], b.center[0] + c.x);
        max[2] = Math.max(max[2], b.center[2] + c.z);
      }
  }
  return { min, max };
}

const cache = new Map<string, MapGeometry>();

/** Hình học đầy đủ của một map. Cùng (mapId, seed) luôn cho cùng kết quả. */
export function buildMapGeometry(mapId: MapId, seed = 1): MapGeometry {
  const key = `${mapId}:${mapId === 'rocks' || mapId === 'full_course' ? seed : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = mapId === 'balance_flat' ? buildBalanceFlat() : buildCourse(mapId, seed);
  cache.set(key, g);
  return g;
}

function buildBalanceFlat(): MapGeometry {
  const L = BALANCE_FLAT.floorSize;
  const path = layoutPath([{ role: 'start', length: L / 2, walls: false }]);
  return {
    id: 'balance_flat',
    name: MAP_NAMES.balance_flat,
    kind: 'open',
    floor: { center: [0, -0.025, 0], size: [L, 0.05, L], quaternion: [0, 0, 0, 1] },
    walls: [],
    lines: [lineAt(path, 0, 'start')],
    rocks: [],
    seesaw: null,
    checkpoints: BALANCE_FLAT.checkpointTimes.map((t) => ({
      id: `giu_${t}s`, name: CHECKPOINT_NAMES[`giu_${t}s`] ?? `Giữ ${t} giây`, s: 0,
      position: [0, 0, 0] as Vec3, heading: 0, width: 0,
    })),
    path,
    totalLength: 0,
    laneWidth: L,
    start: { position: [0, 0, 0], heading: 0 },
    bounds: { min: [-L / 2, 0, -L / 2], max: [L / 2, 0, L / 2] },
    colors: COURSE.colors,
  };
}

function buildCourse(mapId: Exclude<MapId, 'balance_flat'>, seed: number): MapGeometry {
  const path = layoutPath(MAP_SEGMENTS[mapId]);
  const last = path[path.length - 1];
  const total = last.s0 + last.length;

  const walls: BoxGeom[] = [];
  for (const seg of path) if (seg.walls) walls.push(...wallsFor(seg));
  walls.push(endWall(path, 0), endWall(path, total));

  const checkpoints: CheckpointGeom[] = [];
  for (const seg of path) {
    if (!seg.checkpoint) continue;
    const s = seg.s0 + seg.length;
    const { position, heading } = pointAt(path, s);
    checkpoints.push({
      id: seg.checkpoint, name: CHECKPOINT_NAMES[seg.checkpoint] ?? seg.checkpoint,
      s, position, heading, width: COURSE.laneWidth,
    });
  }

  const lines: LineGeom[] = [lineAt(path, SEGMENTS.startOffset, 'start')];
  checkpoints.forEach((c, i) => lines.push(lineAt(path, c.s, i === checkpoints.length - 1 ? 'finish' : 'checkpoint')));

  const rocks: RockGeom[] = [];
  let seesaw: SeesawGeom | null = null;
  for (const seg of path) {
    if (seg.role === 'rocks') rocks.push(...makeRocks(seg, seed));
    if (seg.role === 'seesaw') {
      const sp = SEGMENTS.seesaw;
      const mid = pointAt(path, seg.s0 + seg.length / 2);
      // trục xoay = hướng đi × ŷ: quay dương quanh trục này nhấc đầu ra của cầu lên
      const f = dirOf(mid.heading);
      const axis = v3(-f.z, 0, f.x);
      seesaw = {
        pivot: [mid.position[0], sp.pivotHeight, mid.position[2]],
        heading: mid.heading,
        axis: [axis.x, axis.y, axis.z],
        length: sp.length,
        width: sp.width,
        thickness: sp.thickness,
        bevelLength: sp.bevelLength,
        points: plankPoints(sp.length, sp.width, sp.thickness, sp.bevelLength),
        maxTiltDeg: sp.maxTiltDeg,
        initialTiltDeg: sp.maxTiltDeg, // đầu vào chạm nền, chờ xe leo lên
        massKg: sp.massKg,
        angularDamping: sp.angularDamping,
      };
    }
  }

  const bounds = computeBounds(walls);
  const M = 0.3;
  const floorSize: Vec3 = [bounds.max[0] - bounds.min[0] + 2 * M, 0.05, bounds.max[2] - bounds.min[2] + 2 * M];
  const floorCenter: Vec3 = [(bounds.max[0] + bounds.min[0]) / 2, -0.025, (bounds.max[2] + bounds.min[2]) / 2];

  const start = pointAt(path, SEGMENTS.startOffset);
  return {
    id: mapId,
    name: MAP_NAMES[mapId],
    kind: 'course',
    floor: { center: floorCenter, size: floorSize, quaternion: [0, 0, 0, 1] },
    walls,
    lines,
    rocks,
    seesaw,
    checkpoints,
    path,
    totalLength: total,
    laneWidth: COURSE.laneWidth,
    start: { position: start.position, heading: start.heading },
    bounds,
    colors: COURSE.colors,
  };
}

/** Ván cầu: mặt trên dài L, mặt dưới ngắn hơn 2·bevel → hai đầu vát nhọn. */
function plankPoints(L: number, W: number, T: number, bevel: number): number[] {
  const pts: number[] = [];
  for (const z of [-W / 2, W / 2]) {
    pts.push(-L / 2, 0, z, L / 2, 0, z, -L / 2 + bevel, -T, z, L / 2 - bevel, -T, z);
  }
  return pts;
}

/** Quaternion của ván cầu khi nghiêng `tiltDeg` (dương = đầu ra nhấc lên). */
export function seesawQuat(s: SeesawGeom, tiltDeg: number): Quat {
  const base = qHeading(s.heading);
  const tilt = qAxisAngle(v3(s.axis[0], s.axis[1], s.axis[2]), tiltDeg * DEG);
  return toQuat(qMul(tilt, base));
}
