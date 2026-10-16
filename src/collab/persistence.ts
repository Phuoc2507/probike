// Lưu snapshot Yjs: localStorage (chế độ cá nhân) hoặc bảng `workspaces` (đội).
import type { VehicleDesign } from '@/shared/types';
import { fromBase64, toBase64 } from '@/lib/bytes';
import { loadWorkspace, saveWorkspace } from '@/lib/api';

export interface SnapshotStore {
  load(): Promise<Uint8Array | null>;
  save(snapshot: Uint8Array, design: VehicleDesign | null): Promise<void>;
}

export const PERSONAL_KEY = 'probike:workspace:personal';

/** Giao diện tối thiểu của localStorage (để test bằng Map). */
export interface KVStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function localStore(key = PERSONAL_KEY, storage: KVStorage | null = typeof localStorage !== 'undefined' ? localStorage : null): SnapshotStore {
  return {
    async load() {
      try {
        const v = storage?.getItem(key);
        return v ? fromBase64(v) : null;
      } catch {
        return null;
      }
    },
    async save(snapshot) {
      try {
        storage?.setItem(key, toBase64(snapshot));
      } catch {
        // đầy bộ nhớ / chế độ ẩn danh — bỏ qua
      }
    },
  };
}

export function supabaseStore(teamId: string): SnapshotStore {
  return {
    async load() {
      const r = await loadWorkspace(teamId);
      if (!r.ok) throw new Error(r.error);
      return r.data.snapshot;
    },
    async save(snapshot, design) {
      const r = await saveWorkspace(teamId, snapshot, design);
      if (!r.ok) throw new Error(r.error);
    },
  };
}

/** Debounce có giới hạn chờ tối đa: gọi fn sau `waitMs` yên lặng, nhưng không trễ quá `maxWaitMs` kể từ lần đầu. */
export function debounceMax(fn: () => void, waitMs: number, maxWaitMs: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let first: number | null = null;
  const fire = () => {
    if (t) clearTimeout(t);
    t = null;
    first = null;
    fn();
  };
  const call = () => {
    const now = Date.now();
    if (first === null) first = now;
    if (t) clearTimeout(t);
    const remainingMax = maxWaitMs - (now - first);
    t = setTimeout(fire, Math.max(0, Math.min(waitMs, remainingMax)));
  };
  call.flush = () => {
    if (t) fire();
  };
  call.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
    first = null;
  };
  call.pending = () => t !== null;
  return call;
}

/** Người lưu snapshot = phiên có id nhỏ nhất trong phòng (tránh 5 người cùng ghi). */
export function isElectedSaver(myId: string, peerIds: string[]): boolean {
  return [myId, ...peerIds].sort()[0] === myId;
}
