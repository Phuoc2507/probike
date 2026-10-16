// Lưu snapshot Yjs: localStorage (chế độ cá nhân) hoặc bảng `workspaces` (đội).
import type { VehicleDesign } from '@/shared/types';
import { fromBase64, toBase64 } from '@/lib/bytes';
import { loadWorkspace, saveWorkspace } from '@/lib/api';

export interface SnapshotStore {
  load(): Promise<Uint8Array | null>;
  save(snapshot: Uint8Array, design: VehicleDesign | null): Promise<void>;
}

export const PERSONAL_KEY = 'probike:workspace:personal';

/**
 * Bài luyện tập cá nhân bỏ dở quá lâu thì coi như của người khác (máy dùng chung ở quán net, phòng máy trường)
 * → không nạp lại. Thêm nút "Xoá bài luyện tập trên máy này" gọi clearPersonalWorkspace().
 */
export const PERSONAL_TTL_MS = 3 * 24 * 3600 * 1000;

/** Giao diện tối thiểu của localStorage (để test bằng Map). */
export interface KVStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const defaultStorage = (): KVStorage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function localStore(
  key = PERSONAL_KEY,
  storage: KVStorage | null = defaultStorage(),
  opts: { ttlMs?: number; now?: () => number } = {},
): SnapshotStore {
  const ttl = opts.ttlMs ?? PERSONAL_TTL_MS;
  const now = opts.now ?? Date.now;
  return {
    async load() {
      try {
        const v = storage?.getItem(key);
        if (!v) return null;
        const rec = JSON.parse(v) as { v: 1; at: number; data: string };
        if (now() - rec.at > ttl) {
          storage?.removeItem(key);
          return null;
        }
        return fromBase64(rec.data);
      } catch {
        return null; // hỏng / định dạng cũ → bắt đầu mới (chế độ cá nhân không có dữ liệu chung để mất)
      }
    },
    async save(snapshot) {
      try {
        storage?.setItem(key, JSON.stringify({ v: 1, at: now(), data: toBase64(snapshot) }));
      } catch {
        // đầy bộ nhớ / chế độ ẩn danh — bỏ qua
      }
    },
  };
}

/** Xoá bài luyện tập cá nhân lưu trên máy này. */
export function clearPersonalWorkspace(storage: KVStorage | null = defaultStorage(), key = PERSONAL_KEY) {
  try {
    storage?.removeItem(key);
  } catch {
    // bỏ qua
  }
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
