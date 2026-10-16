// Binding React ↔ Yjs: mỗi hook đọc một phần doc và render lại khi phần đó đổi (kể cả do đồng đội sửa).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import type { MapId, RunResult, SimSnapshot, VehicleDesign } from '@/shared/types';
import {
  applyTextDiff, getBlockly, getDesign, getMode, getParams, getRunState, parts, setBlockly, setDesign, setMode, setParam,
  type PidParams, type RunState, type WorkspaceMode,
} from './doc';
import type { RunChannel, RunStartInfo } from './run';
import type { WorkspaceSession } from './session';

/** Đăng ký một Y type, trả giá trị đã tính; chỉ đổi tham chiếu khi Y type thực sự đổi. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useYValue<T>(type: Y.AbstractType<any> | null, read: () => T, deep = false): T {
  const cache = useRef<{ v: T; type: unknown; stale: boolean }>({ v: undefined as T, type: null, stale: true });
  if (cache.current.type !== type) cache.current = { v: undefined as T, type, stale: true };
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!type) return () => {};
      const h = () => {
        cache.current.stale = true;
        cb();
      };
      if (deep) type.observeDeep(h);
      else type.observe(h);
      return () => (deep ? type.unobserveDeep(h) : type.unobserve(h));
    },
    [type, deep],
  );
  const get = () => {
    if (cache.current.stale) {
      cache.current.v = read();
      cache.current.stale = false;
    }
    return cache.current.v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

const docOf = (s: WorkspaceSession | null | undefined) => s?.doc ?? null;

/** Thiết kế xe (VehicleDesign) — ghi đè cả object (last-writer-wins). */
export function useDesign(session: WorkspaceSession | null | undefined): [VehicleDesign | null, (d: VehicleDesign | null) => void] {
  const doc = docOf(session);
  const v = useYValue(doc ? parts(doc).main : null, () => (doc ? getDesign(doc) : null));
  const set = useCallback((d: VehicleDesign | null) => doc && setDesign(doc, d), [doc]);
  return [v, set];
}

/** JSON workspace Blockly. */
export function useBlocklyJson(session: WorkspaceSession | null | undefined): [unknown, (json: unknown) => void] {
  const doc = docOf(session);
  const v = useYValue(doc ? parts(doc).main : null, () => (doc ? getBlockly(doc) : null));
  const set = useCallback((json: unknown) => doc && setBlockly(doc, json), [doc]);
  return [v, set];
}

export function useMode(session: WorkspaceSession | null | undefined): [WorkspaceMode, (m: WorkspaceMode) => void] {
  const doc = docOf(session);
  const v = useYValue(doc ? parts(doc).main : null, () => (doc ? getMode(doc) : 'blocks'));
  const set = useCallback((m: WorkspaceMode) => doc && setMode(doc, m), [doc]);
  return [v, set];
}

export function usePidParams(session: WorkspaceSession | null | undefined): [PidParams, (key: string, value: number) => void] {
  const doc = docOf(session);
  const v = useYValue(doc ? parts(doc).params : null, () => (doc ? getParams(doc) : {}));
  const set = useCallback((key: string, value: number) => doc && setParam(doc, key, value), [doc]);
  return [v, set];
}

/**
 * Code (Y.Text) dạng chuỗi + hàm ghi (diff tối thiểu). Dùng được với CodeMirror controlled.
 * Muốn con trỏ của đồng đội hiển thị chuẩn thì dùng trực tiếp `parts(doc).code` với y-codemirror sau này.
 */
export function useCode(session: WorkspaceSession | null | undefined): [string, (next: string) => void, Y.Text | null] {
  const doc = docOf(session);
  const ytext = doc ? parts(doc).code : null;
  const v = useYValue(ytext, () => ytext?.toString() ?? '');
  const set = useCallback((next: string) => ytext && applyTextDiff(ytext, next), [ytext]);
  return [v, set, ytext];
}

/** Trạng thái lượt chạy (lưu trong doc). */
export function useRunState(session: WorkspaceSession | null | undefined): RunState | null {
  const doc = docOf(session);
  return useYValue(doc ? parts(doc).run : null, () => (doc ? getRunState(doc) : null));
}

/**
 * Theo dõi lượt chạy của cả đội: khung hình mới nhất (để vẽ 3D), thông tin bắt đầu, kết quả.
 * `onFrame` được gọi mỗi khung (không gây render) — dùng cho three.js; `latest` cập nhật tối đa ~20 lần/giây.
 */
export function useRunStream(run: RunChannel | null | undefined, onFrame?: (s: SimSnapshot, runId: string) => void) {
  const [info, setInfo] = useState<RunStartInfo | null>(null);
  const [latest, setLatest] = useState<SimSnapshot | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;

  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let pending: SimSnapshot | null = null;
    const offs = [
      run.onStart((i) => {
        setInfo(i);
        setResult(null);
        setLatest(null);
      }),
      run.onFrame((s, id) => {
        frameCb.current?.(s, id);
        pending = s;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            setLatest(pending);
          });
        }
      }),
      run.onEnd((r) => setResult(r)),
    ];
    return () => {
      offs.forEach((f) => f());
      if (raf) cancelAnimationFrame(raf);
    };
  }, [run]);

  const start = useCallback((mapId: MapId, seed?: number) => run?.start(mapId, seed) ?? null, [run]);
  return { info, latest, result, start };
}
