// Danh sách tên linh kiện cho dropdown của khối Blockly (theo tên thí sinh đặt khi lắp ráp).

import { CATALOG_BY_ID } from '@/shared/catalog';
import type { VehicleDesign } from '@/shared/types';

export type PartKind = 'all' | 'motor' | 'servo' | 'sensor' | 'encoder';

export interface PartOptions {
  all: string[];
  motor: string[];
  servo: string[];
  sensor: string[];
  encoder: string[];
}

const EMPTY: PartOptions = { all: [], motor: [], servo: [], sensor: [], encoder: [] };
let current: PartOptions = EMPTY;

/** Lọc tên linh kiện theo loại dựa vào kho linh kiện. */
export function partOptionsFromDesign(design: VehicleDesign): PartOptions {
  const out: PartOptions = { all: [], motor: [], servo: [], sensor: [], encoder: [] };
  for (const p of design.parts) {
    const item = CATALOG_BY_ID[p.itemId];
    if (!item || !p.name) continue;
    out.all.push(p.name);
    if (item.motor?.kind === 'servo') out.servo.push(p.name);
    else if (item.motor) out.motor.push(p.name);
    if (item.sensor?.kind === 'encoder') out.encoder.push(p.name);
    else if (item.sensor && item.sensor.kind !== 'imu') out.sensor.push(p.name);
  }
  return out;
}

/** Mọi dropdown đều dùng chung một danh sách khi chỉ có tên (không biết loại). */
export function partOptionsFromNames(names: string[]): PartOptions {
  const all = [...new Set(names.filter(Boolean))];
  return { all, motor: all, servo: all, sensor: all, encoder: all };
}

export function setPartOptions(opts: PartOptions | string[]): void {
  current = Array.isArray(opts) ? partOptionsFromNames(opts) : opts;
}

export function getPartOptions(): PartOptions {
  return current;
}

/** Tên cho dropdown loại `kind`; nếu loại đó trống thì dùng toàn bộ tên. */
export function partNamesFor(kind: PartKind, ws?: object | null): string[] {
  const opts = (ws && byWorkspace.get(rootWorkspace(ws as WsLike))) || current;
  const list = opts[kind];
  return list.length ? list : opts.all;
}

// Danh sách theo từng workspace (khoá là workspace gốc). Không có thì dùng danh sách chung ở trên.
const byWorkspace = new WeakMap<object, PartOptions>();

interface WsLike { targetWorkspace?: WsLike | null; options?: { parentWorkspace?: WsLike | null } }

/** Workspace gốc: flyout (khay khối) và workspace con dùng chung danh sách với workspace chính. */
function rootWorkspace(ws: WsLike): WsLike {
  let cur = ws;
  for (let i = 0; i < 5; i++) {
    const next = cur.targetWorkspace ?? cur.options?.parentWorkspace;
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

export function setWorkspacePartOptions(ws: object, opts: PartOptions | string[]): void {
  byWorkspace.set(rootWorkspace(ws as WsLike), Array.isArray(opts) ? partOptionsFromNames(opts) : opts);
}
