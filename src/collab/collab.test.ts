import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { RunResult, SimSnapshot } from '@/shared/types';
import {
  applyTextDiff, buildSeedUpdate, getDesign, getMode, getParams, getRunState, parts, seedIfEmpty, setDesign, setMode, setParam,
} from './doc';
import { MemoryBus, MemoryTransport } from './transport';
import { YjsBroadcastProvider } from './provider';
import { RunChannel } from './run';
import { WorkspaceSession } from './session';
import { debounceMax, isElectedSaver, localStore, type SnapshotStore } from './persistence';

afterEach(() => vi.useRealTimers());

const design = {
  version: 1 as const,
  name: 'Xe thử',
  frame: { wheelbase: 0.2, height: 0.1, material: 'mica' as const, massKg: 0.2, steerable: false },
  parts: [],
};

function snap(t: number): SimSnapshot {
  const pose = { id: 'bike', position: [t, 0, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number] };
  return { t, bike: pose, parts: [], dynamic: [], rollDeg: 0, speed: 0, checkpoints: [] };
}

const result: RunResult = { mapId: 'straight', reason: 'completed', timeS: 3.2, checkpoints: ['cp1'], maxRollDeg: 4, balancedS: 3.2, score: 80 };

describe('applyTextDiff', () => {
  it('ghi đúng chuỗi mới với diff tối thiểu', () => {
    const doc = new Y.Doc();
    const t = doc.getText('code');
    applyTextDiff(t, 'function loop() {}');
    expect(t.toString()).toBe('function loop() {}');
    applyTextDiff(t, 'function loop() { motor(1); }');
    expect(t.toString()).toBe('function loop() { motor(1); }');
    applyTextDiff(t, 'loop');
    expect(t.toString()).toBe('loop');
    applyTextDiff(t, '');
    expect(t.toString()).toBe('');
  });

  it('giữ được chỉnh sửa đồng thời của hai người ở hai đầu', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    applyTextDiff(a.getText('code'), 'abc\nxyz');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    applyTextDiff(a.getText('code'), 'abc!\nxyz'); // A sửa dòng 1
    applyTextDiff(b.getText('code'), 'abc\nxyz?'); // B sửa dòng 2
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getText('code').toString()).toBe('abc!\nxyz?');
    expect(b.getText('code').toString()).toBe('abc!\nxyz?');
  });
});

describe('seed', () => {
  it('hai máy cùng seed không bị nhân đôi code', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seedIfEmpty(a, { code: 'function setup() {}' });
    seedIfEmpty(b, { code: 'function setup() {}' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getText('code').toString()).toBe('function setup() {}');
    expect(getParams(a)).toEqual({ kp: 20, ki: 0, kd: 1.5 });
    expect(getMode(a)).toBe('blocks');
  });

  it('không ghi đè doc đã có dữ liệu', () => {
    const a = new Y.Doc();
    seedIfEmpty(a, { code: 'x' });
    applyTextDiff(parts(a).code, 'code của đội');
    expect(seedIfEmpty(a, { code: 'x' })).toBe(false);
    expect(parts(a).code.toString()).toBe('code của đội');
  });

  it('buildSeedUpdate xác định (deterministic)', () => {
    expect(buildSeedUpdate({ code: 'a' })).toEqual(buildSeedUpdate({ code: 'a' }));
  });
});

describe('YjsBroadcastProvider qua MemoryTransport', () => {
  it('đồng bộ trạng thái ban đầu và cập nhật sau đó', async () => {
    vi.useFakeTimers();
    const bus = new MemoryBus();
    const a = new Y.Doc();
    const b = new Y.Doc();
    setDesign(a, design);
    setParam(a, 'kp', 33);
    const ta = new MemoryTransport(bus);
    const tb = new MemoryTransport(bus);
    const pa = new YjsBroadcastProvider(a, ta, { batchMs: 10 });
    const pb = new YjsBroadcastProvider(b, tb, { batchMs: 10 });
    await ta.connect();
    await tb.connect();
    // B có thay đổi riêng trước khi vào phòng
    setMode(b, 'code');
    vi.advanceTimersByTime(20);
    pb.requestSync();
    expect(pb.synced).toBe(true);
    expect(getDesign(b)?.name).toBe('Xe thử');
    expect(getParams(b).kp).toBe(33);
    expect(getMode(a)).toBe('code'); // A nhận phần B có mà A thiếu

    applyTextDiff(parts(a).code, 'loop');
    vi.advanceTimersByTime(20);
    expect(parts(b).code.toString()).toBe('loop');
    pa.destroy();
    pb.destroy();
  });
});

describe('RunChannel', () => {
  it('phát start / frames (lấy mẫu 20 Hz, gom lô) / end cho đồng đội', () => {
    vi.useFakeTimers();
    const bus = new MemoryBus();
    const ta = new MemoryTransport(bus);
    const tb = new MemoryTransport(bus);
    void ta.connect();
    void tb.connect();
    let now = 0;
    const docA = new Y.Doc();
    const ra = new RunChannel(ta, docA, { userId: 'u1', name: 'An' }, { now: () => now, framesPerMessage: 2 });
    const rb = new RunChannel(tb, new Y.Doc(), { userId: 'u2', name: 'Bình' });

    const starts: string[] = [];
    const frames: number[] = [];
    const ends: RunResult[] = [];
    rb.onStart((i) => starts.push(`${i.mapId}:${i.by.name}:${i.local}`));
    rb.onFrame((s) => frames.push(s.t));
    rb.onEnd((r) => ends.push(r));

    ra.start('straight', 42);
    expect(starts).toEqual(['straight:An:false']);
    expect(getRunState(docA).status).toBe('running');

    // Mô phỏng gọi frame mỗi 10 ms trong 1 s → chỉ ~20 Hz được gửi (21 khung: 0, 50, ..., 1000 ms)
    for (let i = 0; i <= 100; i++) {
      now = i * 10;
      ra.frame(snap(i * 0.01));
    }
    vi.advanceTimersByTime(1000);
    expect(frames.length).toBe(20); // khung thứ 21 còn chờ đủ lô

    ra.end(result);
    vi.advanceTimersByTime(100);
    expect(frames.length).toBe(21); // end() đẩy nốt khung còn lại
    expect(ends).toEqual([result]);
    expect(getRunState(docA).status).toBe('finished');
    expect(getRunState(docA).result?.score).toBe(80);
  });
});

describe('WorkspaceSession', () => {
  function memStore(): SnapshotStore & { saved: Uint8Array | null; count: number } {
    const s = {
      saved: null as Uint8Array | null,
      count: 0,
      async load() {
        return s.saved;
      },
      async save(u: Uint8Array) {
        s.saved = u;
        s.count++;
      },
    };
    return s;
  }

  it('chế độ cá nhân: seed, lưu debounce, nạp lại', async () => {
    vi.useFakeTimers();
    const store = memStore();
    const s1 = new WorkspaceSession({ kind: 'personal', transport: null, store, user: { userId: null, name: 'Khách' }, seed: { code: 'mẫu' }, saveWaitMs: 100 });
    await s1.start();
    expect(s1.state.ready).toBe(true);
    applyTextDiff(parts(s1.doc).code, 'code của tôi');
    await vi.advanceTimersByTimeAsync(150);
    expect(store.count).toBe(1);
    s1.destroy();

    const s2 = new WorkspaceSession({ kind: 'personal', transport: null, store, user: { userId: null, name: 'Khách' }, seed: { code: 'mẫu' } });
    await s2.start();
    expect(parts(s2.doc).code.toString()).toBe('code của tôi');
    s2.destroy();
  });

  it('chế độ đội: hai người thấy thay đổi của nhau và presence', async () => {
    vi.useFakeTimers();
    const bus = new MemoryBus();
    const store = memStore();
    const mk = (name: string) =>
      new WorkspaceSession({
        kind: 'team', transport: new MemoryTransport(bus), store, user: { userId: name, name },
        seed: { code: 'mẫu' }, providerSyncTimeoutMs: 50, saveWaitMs: 100,
      });
    const a = mk('An');
    const b = mk('Bình');
    const pa = a.start();
    await vi.advanceTimersByTimeAsync(60);
    await pa;
    expect(a.state.ready).toBe(true);
    await b.start();
    await vi.advanceTimersByTimeAsync(60);
    expect(b.state.ready).toBe(true);
    expect(b.state.peers.map((p) => p.name).sort()).toEqual(['An', 'Bình']);
    expect(parts(b.doc).code.toString()).toBe('mẫu');

    await vi.advanceTimersByTimeAsync(500);
    const before = store.count;
    setDesign(b.doc, design);
    await vi.advanceTimersByTimeAsync(60);
    expect(getDesign(a.doc)?.name).toBe('Xe thử');

    // Cả hai đều thấy thay đổi nhưng chỉ một phiên (được bầu) lưu snapshot
    await vi.advanceTimersByTimeAsync(500);
    expect(store.count - before).toBe(1);
    a.destroy();
    b.destroy();
  });
});

describe('persistence', () => {
  it('debounceMax gọi sau khoảng yên lặng nhưng không quá maxWait', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounceMax(fn, 100, 250);
    for (let i = 0; i < 10; i++) {
      d();
      vi.advanceTimersByTime(50);
    }
    expect(fn).toHaveBeenCalledTimes(2); // tại 250 ms và 500 ms (do maxWait)
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(2);
    d();
    vi.advanceTimersByTime(99);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('bầu người lưu = id nhỏ nhất', () => {
    expect(isElectedSaver('a', ['b', 'c'])).toBe(true);
    expect(isElectedSaver('b', ['a', 'c'])).toBe(false);
    expect(isElectedSaver('z', [])).toBe(true);
  });

  it('localStore lưu/đọc base64 qua storage', async () => {
    const m = new Map<string, string>();
    const st = localStore('k', { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    expect(await st.load()).toBeNull();
    await st.save(new Uint8Array([1, 2, 250]), null);
    expect(Array.from((await st.load())!)).toEqual([1, 2, 250]);
  });
});
