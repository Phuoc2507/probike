// Cấu trúc Yjs doc của không gian làm việc đội (PLAN.md mục 6 — TeamWorkspace).
//
//   doc.getMap('main')   : design (VehicleDesign JSON), blockly (JSON workspace), mode ('blocks' | 'code'), seeded
//   doc.getText('code')  : mã JavaScript (Y.Text — nhiều người gõ cùng lúc)
//   doc.getMap('params') : Kp, Ki, Kd... (mỗi tham số một khoá → chỉnh song song không đè nhau)
//   doc.getMap('run')    : trạng thái lượt chạy đang phát (RunState) — người vào sau vẫn thấy
import * as Y from 'yjs';
import type { MapId, RunResult, VehicleDesign } from '@/shared/types';

export type WorkspaceMode = 'blocks' | 'code';

export type PidParams = Record<string, number>;
export const DEFAULT_PARAMS: PidParams = { kp: 20, ki: 0, kd: 1.5 };

export interface RunState {
  status: 'idle' | 'running' | 'finished';
  runId: string | null;
  mapId: MapId | null;
  startedBy: { userId: string | null; name: string } | null;
  startedAt: number | null;
  result: RunResult | null;
}

export const IDLE_RUN: RunState = { status: 'idle', runId: null, mapId: null, startedBy: null, startedAt: null, result: null };

export interface WorkspaceParts {
  main: Y.Map<unknown>;
  code: Y.Text;
  params: Y.Map<number>;
  run: Y.Map<unknown>;
}

export function parts(doc: Y.Doc): WorkspaceParts {
  return {
    main: doc.getMap('main'),
    code: doc.getText('code'),
    params: doc.getMap<number>('params'),
    run: doc.getMap('run'),
  };
}

// ---------------------------------------------------------------- Đọc / ghi

export function getDesign(doc: Y.Doc): VehicleDesign | null {
  return (parts(doc).main.get('design') as VehicleDesign | undefined) ?? null;
}

export function setDesign(doc: Y.Doc, design: VehicleDesign | null) {
  parts(doc).main.set('design', design ? (JSON.parse(JSON.stringify(design)) as VehicleDesign) : null);
}

export function getBlockly(doc: Y.Doc): unknown {
  return parts(doc).main.get('blockly') ?? null;
}

export function setBlockly(doc: Y.Doc, json: unknown) {
  parts(doc).main.set('blockly', json == null ? null : JSON.parse(JSON.stringify(json)));
}

export function getMode(doc: Y.Doc): WorkspaceMode {
  return (parts(doc).main.get('mode') as WorkspaceMode | undefined) ?? 'blocks';
}

export function setMode(doc: Y.Doc, mode: WorkspaceMode) {
  parts(doc).main.set('mode', mode);
}

export function getParams(doc: Y.Doc): PidParams {
  return { ...DEFAULT_PARAMS, ...Object.fromEntries(parts(doc).params.entries()) };
}

export function setParam(doc: Y.Doc, key: string, value: number) {
  parts(doc).params.set(key, value);
}

export function getRunState(doc: Y.Doc): RunState {
  const m = parts(doc).run;
  return { ...IDLE_RUN, ...(Object.fromEntries(m.entries()) as Partial<RunState>) };
}

export function setRunState(doc: Y.Doc, patch: Partial<RunState>) {
  const m = parts(doc).run;
  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) m.set(k, v === undefined ? null : JSON.parse(JSON.stringify(v)));
  });
}

/**
 * Ghi chuỗi mới vào Y.Text bằng diff tối thiểu (giữ phần đầu/cuối chung) để không phá chỉnh sửa
 * đồng thời của người khác. Dùng khi editor chỉ cho ta giá trị cuối (CodeMirror onChange).
 */
export function applyTextDiff(ytext: Y.Text, next: string) {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const minLen = Math.min(prev.length, next.length);
  while (start < minLen && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
    endPrev--;
    endNext--;
  }
  const run = () => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  };
  if (ytext.doc) ytext.doc.transact(run);
  else run();
}

// ---------------------------------------------------------------- Giá trị khởi tạo

export interface SeedDefaults {
  design?: VehicleDesign | null;
  blockly?: unknown;
  code?: string;
  mode?: WorkspaceMode;
  params?: PidParams;
}

/** clientID cố định cho bản "hạt giống": nhiều máy cùng seed → cập nhật giống hệt nhau → Yjs gộp làm một. */
const SEED_CLIENT_ID = 1;

export function buildSeedUpdate(d: SeedDefaults = {}): Uint8Array {
  const seed = new Y.Doc();
  seed.clientID = SEED_CLIENT_ID;
  const p = parts(seed);
  seed.transact(() => {
    p.main.set('seeded', 1);
    p.main.set('mode', d.mode ?? 'blocks');
    p.main.set('design', d.design ?? null);
    p.main.set('blockly', d.blockly ?? null);
    if (d.code) p.code.insert(0, d.code);
    for (const [k, v] of Object.entries(d.params ?? DEFAULT_PARAMS)) p.params.set(k, v);
    for (const [k, v] of Object.entries(IDLE_RUN)) p.run.set(k, v);
  });
  const u = Y.encodeStateAsUpdate(seed);
  seed.destroy();
  return u;
}

export function isSeeded(doc: Y.Doc): boolean {
  return parts(doc).main.get('seeded') === 1;
}

/** Doc chưa có gì: chưa seed và không có nội dung nào (code, thiết kế, tham số...). */
export function isEmptyDoc(doc: Y.Doc): boolean {
  const p = parts(doc);
  return !isSeeded(doc) && p.code.length === 0 && p.main.size === 0 && p.params.size === 0 && p.run.size === 0;
}

/** Áp giá trị mặc định nếu doc còn trống (gọi SAU khi đã nạp snapshot và đồng bộ với đồng đội). */
export function seedIfEmpty(doc: Y.Doc, d?: SeedDefaults, origin: unknown = 'seed'): boolean {
  if (!isEmptyDoc(doc)) return false;
  Y.applyUpdate(doc, buildSeedUpdate(d), origin);
  return true;
}
