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
import { clearPersonalWorkspace, debounceMax, isElectedSaver, localStore, type SnapshotStore } from './persistence';

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

  function memKV() {
    const m = new Map<string, string>();
    return { m, kv: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
  }

  it('localStore lưu/đọc qua storage', async () => {
    const { kv } = memKV();
    const st = localStore('k', kv);
    expect(await st.load()).toBeNull();
    await st.save(new Uint8Array([1, 2, 250]), null);
    expect(Array.from((await st.load())!)).toEqual([1, 2, 250]);
  });

  it('localStore bỏ bài cũ quá hạn (máy dùng chung) và clearPersonalWorkspace xoá được', async () => {
    const { kv, m } = memKV();
    let now = 1_000_000;
    const st = localStore('k', kv, { ttlMs: 1000, now: () => now });
    await st.save(new Uint8Array([7]), null);
    now += 500;
    expect(await st.load()).not.toBeNull();
    now += 1000;
    expect(await st.load()).toBeNull();
    expect(m.has('k')).toBe(false);

    await st.save(new Uint8Array([7]), null);
    clearPersonalWorkspace(kv, 'k');
    expect(await st.load()).toBeNull();
  });
});

describe('WorkspaceSession — an toàn khi tải/lưu lỗi', () => {
  it('tải bản lưu lỗi → không seed, không lưu đè; thử lại thành công thì giữ dữ liệu thật', async () => {
    vi.useFakeTimers();
    // Bản lưu thật của đội trên server
    const real = new Y.Doc();
    applyTextDiff(real.getText('code'), 'code thật của đội');
    let failLoad = true;
    const saves: Uint8Array[] = [];
    const store: SnapshotStore = {
      async load() {
        if (failLoad) throw new Error('mất mạng');
        return Y.encodeStateAsUpdate(real);
      },
      async save(u) {
        saves.push(u);
      },
    };
    const s = new WorkspaceSession({
      kind: 'team', transport: new MemoryTransport(new MemoryBus()), store, user: { userId: 'a', name: 'An' },
      seed: { code: 'mẫu' }, providerSyncTimeoutMs: 20, saveWaitMs: 50, retryBaseMs: 1000,
    });
    await s.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(s.state.loaded).toBe(false);
    expect(s.state.loadError).toMatch(/mất mạng/);
    expect(s.state.ready).toBe(false);
    expect(parts(s.doc).code.toString()).toBe(''); // không gieo mặc định
    expect(saves.length).toBe(0); // không ghi đè

    failLoad = false;
    await vi.advanceTimersByTimeAsync(1000); // tự thử lại
    expect(s.state.loaded).toBe(true);
    expect(s.state.ready).toBe(true);
    expect(parts(s.doc).code.toString()).toBe('code thật của đội'); // không bị seed đè/nhân đôi
    s.destroy();
  });

  it('lưu lỗi → tự thử lại có giãn cách', async () => {
    vi.useFakeTimers();
    let fails = 2;
    let ok = 0;
    const store: SnapshotStore = {
      async load() {
        return null;
      },
      async save() {
        if (fails-- > 0) throw new Error('503');
        ok++;
      },
    };
    const s = new WorkspaceSession({ kind: 'personal', transport: null, store, user: { userId: null, name: 'K' }, saveWaitMs: 10, retryBaseMs: 100 });
    await s.start();
    setParam(s.doc, 'kp', 5);
    await vi.advanceTimersByTimeAsync(20);
    expect(s.state.error).toMatch(/503/);
    await vi.advanceTimersByTimeAsync(100); // lần 2 (sau 100 ms) vẫn lỗi
    expect(ok).toBe(0);
    await vi.advanceTimersByTimeAsync(200); // lần 3 (sau 200 ms) thành công
    expect(ok).toBe(1);
    expect(s.state.error).toBeNull();
    s.destroy();
  });
});

describe('RunChannel — một lượt chạy mỗi đội', () => {
  function pair(clock: { t: number }) {
    const bus = new MemoryBus();
    const ta = new MemoryTransport(bus);
    const tb = new MemoryTransport(bus);
    void ta.connect();
    void tb.connect();
    // Hai máy dùng chung trạng thái doc (giả lập Yjs đã đồng bộ)
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(docB, u, 'net'));
    docB.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(docA, u, 'net'));
    const opts = { clock: () => clock.t, now: () => clock.t, staleMs: 6000, heartbeatMs: 2000, framesPerMessage: 1 };
    return {
      a: new RunChannel(ta, docA, { userId: 'a', name: 'An' }, opts),
      b: new RunChannel(tb, docB, { userId: 'b', name: 'Bình' }, opts),
      docB,
    };
  }

  it('đồng đội đang chạy thì không bắt đầu được lượt khác', () => {
    vi.useFakeTimers();
    const clock = { t: 0 };
    const { a, b } = pair(clock);
    expect(a.start('straight')).not.toBeNull();
    expect(b.busy()?.startedBy?.name).toBe('An');
    expect(b.start('rocks')).toBeNull();
    a.end(result);
    expect(b.busy()).toBeNull();
    expect(b.start('rocks')).not.toBeNull();
    a.destroy();
    b.destroy();
  });

  it('người chạy mất tích → hết hạn, trạng thái về idle, người khác chạy được', () => {
    vi.useFakeTimers();
    const clock = { t: 0 };
    const { a, b, docB } = pair(clock);
    const cancels: string[] = [];
    b.onCancel((_id, reason) => cancels.push(reason));
    a.start('straight');
    // A đóng tab đột ngột: không còn nhịp tim, không có run:end
    a['stopHeartbeat']();
    a['transport'] = null;
    for (let i = 0; i < 5; i++) {
      clock.t += 2000;
      vi.advanceTimersByTime(2000);
    }
    expect(getRunState(docB).status).toBe('idle');
    expect(b.busy()).toBeNull();
    expect(cancels.length).toBe(1);
    expect(b.start('rocks')).not.toBeNull();
    b.destroy();
  });

  it('còn nhịp tim thì không hết hạn', () => {
    vi.useFakeTimers();
    const clock = { t: 0 };
    const { a, b } = pair(clock);
    a.start('straight');
    for (let i = 0; i < 10; i++) {
      clock.t += 2000;
      vi.advanceTimersByTime(2000);
    }
    expect(b.busy()).not.toBeNull();
    a.destroy();
    b.destroy();
  });

  it('bỏ khung của lượt khác lượt đang xem', () => {
    vi.useFakeTimers();
    const clock = { t: 0 };
    const { a, b } = pair(clock);
    const seen: string[] = [];
    b.onFrame((_s, id) => seen.push(id));
    const id = a.start('straight')!;
    a.frame(snap(0));
    // Tin lạc từ lượt cũ
    b['onRemoteFrames']('lượt-cũ', [snap(1)]);
    expect(seen).toEqual([id]);
    a.destroy();
    b.destroy();
  });
});
