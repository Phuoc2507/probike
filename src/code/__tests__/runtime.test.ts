import { describe, expect, it } from 'vitest';
import type { SensorFrame } from '@/shared/types';
import { ControllerCore, findSyntaxErrorLine } from '../runtime/core';
import { PID } from '../runtime/pid';
import { instrumentLoops } from '../runtime/transform';
import { LocalControllerRuntime } from '../runtime/local-runtime';
import { WorkerControllerRuntime, type WorkerLike } from '../runtime/worker-runtime';
import type { FromWorker, ToWorker } from '../runtime/protocol';
import { createWorkerHandler } from '../runtime/worker-handler';

function frame(t: number, roll = 0, values: Record<string, number> = {}): SensorFrame {
  return { t, values, imu: { roll, pitch: 0, yaw: 0, gyro: [1, 2, 3], acc: [0, 9.8, 0] } };
}

describe('PID', () => {
  it('P thuần: đầu ra = Kp × sai số', () => {
    const pid = new PID(2, 0, 0);
    expect(pid.update(3, 0.01)).toBeCloseTo(6);
  });

  it('I tích luỹ theo thời gian, D theo tốc độ đổi sai số', () => {
    const pid = new PID(0, 1, 0);
    pid.update(1, 0.5);
    expect(pid.update(1, 0.5)).toBeCloseTo(1);
    const pd = new PID(0, 0, 1);
    expect(pd.update(1, 0.1)).toBe(0); // lần đầu không có đạo hàm
    expect(pd.update(2, 0.1)).toBeCloseTo(10);
  });

  it('reset xoá tích phân, setLimits kẹp đầu ra và chống bão hoà', () => {
    const pid = new PID(1, 10, 0);
    pid.setLimits(-1, 1);
    for (let i = 0; i < 100; i++) expect(pid.update(5, 0.1)).toBeLessThanOrEqual(1);
    expect(pid.integral).toBeLessThan(1); // không tích luỹ khi bị kẹp
    pid.reset();
    expect(pid.integral).toBe(0);
  });

  it('PID giữ được hệ quán tính đơn giản về 0', () => {
    // hệ x'' = u, bắt đầu lệch 10
    const pid = new PID(4, 0.5, 3);
    let x = 10;
    let v = 0;
    const h = 0.01;
    for (let i = 0; i < 3000; i++) {
      const u = pid.update(0 - x, h);
      v += u * h;
      x += v * h;
    }
    expect(Math.abs(x)).toBeLessThan(0.05);
  });
});

describe('ControllerCore — API', () => {
  it('chạy setup/loop, đọc IMU, dt, motor kẹp -1..1, servo, plot, print', () => {
    const core = new ControllerCore({ actuators: ['banhDa', 'lai'] });
    const res = core.load(`
      const pid = new PID(2, 0, 0);
      let n = 0;
      function setup() { print("Xe khởi động", 1.23456); }
      function loop() {
        n++;
        const goc = imu.roll();
        motor("banhDa", pid.update(0 - goc, dt()));
        servo("lai", 15);
        plot("goc", goc);
        plot("dt", dt());
      }
    `);
    expect(res).toEqual({ ok: true });
    expect(core.drainLogs().map((l) => l.text)).toEqual(['Xe khởi động 1.2346']);
    expect(core.tick(frame(0.01, 0.2))).toEqual({ banhDa: -0.4, lai: 15 });
    expect(core.tick(frame(0.02, -5))).toEqual({ banhDa: 1, lai: 15 });
    const plots = core.drainPlots();
    expect(plots.filter((p) => p.label === 'goc').map((p) => p.value)).toEqual([0.2, -5]);
    expect(plots.find((p) => p.label === 'dt' && p.t === 0.02)!.value).toBeCloseTo(0.01);
  });

  it('read, encoder, millis, constrain, map, param', () => {
    const core = new ControllerCore({ params: { Kp: 7 } });
    core.load(`
      function loop() {
        motor("a", constrain(read("laser") / 100, 0, 1));
        motor("b", map(encoder("enc"), 0, 10, 0, 1));
        motor("c", millis() / 1000);
        motor("d", param("Kp", 1) / 10);
        motor("e", param("Ki", 0.3));
      }
    `);
    const cmd = core.tick(frame(0.5, 0, { laser: 50, enc: 5 }));
    expect(cmd).toEqual({ a: 0.5, b: 0.5, c: 0.5, d: 0.7, e: 0.3 });
    core.setParams({ Kp: 3 });
    expect(core.tick(frame(0.51, 0, { laser: 50, enc: 5 })).d).toBeCloseTo(0.3);
  });

  it('thí sinh được đặt lại tên trùng API (min, map) mà không lỗi', () => {
    const core = new ControllerCore();
    const res = core.load(`let min = 2; function map() { return 0.25 } function loop() { motor("m", map() * min); }`);
    expect(res.ok).toBe(true);
    expect(core.tick(frame(0)).m).toBe(0.5);
  });

  it('motor giữ giá trị cũ khi không gọi lại (giống Arduino)', () => {
    const core = new ControllerCore();
    core.load(`let i = 0; function loop() { if (i++ === 0) motor("m", 0.3); }`);
    core.tick(frame(0));
    expect(core.tick(frame(0.01))).toEqual({ m: 0.3 });
  });
});

describe('ControllerCore — lỗi tiếng Việt kèm số dòng', () => {
  it('lỗi cú pháp có số dòng', () => {
    const core = new ControllerCore();
    const res = core.load(`function setup() {}\nfunction loop() {\n  let x = ;\n}`);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/^Dòng 3: /);
      expect(res.error).toMatch(/Sai cú pháp/);
    }
  });

  it('thiếu ngoặc đóng báo dòng cuối', () => {
    const src = `function loop() {\n  motor("a", 1);\n`;
    expect(findSyntaxErrorLine(src)).toBe(3);
    const res = new ControllerCore().load(src);
    expect(!res.ok && res.error).toMatch(/Thiếu dấu đóng/);
  });

  it('biến chưa khai báo trong loop: báo đúng dòng', () => {
    const core = new ControllerCore();
    expect(core.load(`function loop() {\n  const a = 1;\n  motor("m", tocdo);\n}`).ok).toBe(true);
    expect(() => core.tick(frame(0))).toThrowError(/^Dòng 3: Chưa khai báo biến\/hàm "tocdo"/);
    // sau khi lỗi, các tick sau vẫn báo cùng lỗi
    expect(() => core.tick(frame(0.01))).toThrowError(/Dòng 3/);
    expect(core.drainLogs().some((l) => l.level === 'error')).toBe(true);
  });

  it('lỗi API: tên linh kiện sai, giá trị không phải số, thiếu IMU, thiếu loop', () => {
    const c1 = new ControllerCore({ actuators: ['banhDa'] });
    c1.load(`function loop() {\n  motor("banhda", 1);\n}`);
    expect(() => c1.tick(frame(0))).toThrowError(/Dòng 2: motor\("banhda"\): xe không có linh kiện tên "banhda". Các tên có: banhDa/);

    const c2 = new ControllerCore();
    c2.load(`function loop() { motor("m", "abc"); }`);
    expect(() => c2.tick(frame(0))).toThrowError(/cần một số hợp lệ/);

    const c3 = new ControllerCore();
    c3.load(`function loop() { imu.roll(); }`);
    expect(() => c3.tick({ t: 0, values: {}, imu: null })).toThrowError(/chưa lắp IMU/);

    const c4 = new ControllerCore();
    c4.load(`function loop() { read("khong_co"); }`);
    expect(() => c4.tick(frame(0, 0, { laser: 1 }))).toThrowError(/không có cảm biến tên "khong_co".*laser/);

    const res = new ControllerCore().load(`function setup() {}`);
    expect(!res.ok && res.error).toMatch(/Chưa có hàm loop/);
  });

  it('lỗi trong setup báo khi load', () => {
    const res = new ControllerCore().load(`function setup() {\n  null.x;\n}\nfunction loop() {}`);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/^Dòng 2: Không đọc được "x" từ giá trị null/);
  });
});

describe('Watchdog', () => {
  it('chèn guard vào while/for/do-while/for-of, không đổi số dòng', () => {
    const src = `while (a) {}\nfor (let i = 0; i < 3; i++) {}\nfor (;;) {}\ndo { } while (b)\nfor (const x of xs) { }\nconst s = "while (x)"; // for (;;)`;
    const out = instrumentLoops(src, 'G');
    expect(out.split('\n')).toEqual([
      'while (G() && (a)) {}',
      'for (let i = 0;G() && ( i < 3); i++) {}',
      'for (;G();) {}',
      'do { } while (G() && (b))',
      'for (const x of xs) {G(); }',
      'const s = "while (x)"; // for (;;)',
    ]);
  });

  it('vòng lặp vô hạn trong loop() bị dừng khoảng 50 ms, báo dòng', () => {
    const core = new ControllerCore({ watchdogMs: 50 });
    core.load(`function loop() {\n  let i = 0;\n  while (true) { i++; }\n}`);
    const t0 = performance.now();
    expect(() => core.tick(frame(0))).toThrowError(/^Dòng 3: loop\(\) chạy quá 50 ms/);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(500);
  });

  it('for(;;) trong setup bị dừng khi load', () => {
    const res = new ControllerCore({ setupWatchdogMs: 30 }).load(`function setup() { for (;;) {} }\nfunction loop() {}`);
    expect(!res.ok && res.error).toMatch(/setup.*chạy quá 30 ms/);
  });

  it('đệ quy vô hạn báo lỗi tiếng Việt', () => {
    const core = new ControllerCore();
    core.load(`function f(x) { return f(x + 1); }\nfunction loop() { f(0); }`);
    expect(() => core.tick(frame(0))).toThrowError(/đệ quy vô hạn/);
  });

  it('dùng đồng hồ giả: code nặng không vòng lặp vẫn bị bắt sau loop()', () => {
    let fake = 0;
    const core = new ControllerCore({ watchdogMs: 50, now: () => fake });
    core.load(`function loop() { advance(); }`.replace('advance()', 'read("x")'));
    // read("x") không làm trôi đồng hồ → qua được
    expect(() => core.tick(frame(0, 0, { x: 1 }))).not.toThrow();
    const core2 = new ControllerCore({ watchdogMs: 50, now: () => (fake += 120) });
    core2.load(`function loop() { }`);
    expect(() => core2.tick(frame(0))).toThrowError(/chạy quá 50 ms/);
  });
});

describe('Chặn API nguy hiểm', () => {
  const cases: [string, RegExp][] = [
    ['fetch("https://example.com")', /Không được dùng mạng \(fetch\)/],
    ['new XMLHttpRequest()', /Không được dùng mạng \(XMLHttpRequest\)/],
    ['new WebSocket("ws://x")', /Không được dùng mạng \(WebSocket\)/],
    ['importScripts("x.js")', /Không được dùng mạng \(importScripts\)/],
    ['document.body', /Không được truy cập trình duyệt \(document\)/],
    ['window.location', /Không được truy cập trình duyệt \(window\)/],
    ['globalThis.fetch', /Không được truy cập trình duyệt \(globalThis\)/],
    ['self.postMessage(1)', /Không được truy cập trình duyệt \(self\)/],
    ['postMessage(1)', /postMessage/],
    ['setTimeout(() => {}, 10)', /Không dùng setTimeout/],
    ['Function("return 1")()', /Không được dùng "Function"/],
  ];
  for (const [code, re] of cases) {
    it(code, () => {
      const core = new ControllerCore();
      expect(core.load(`function loop() {\n  ${code};\n}`).ok).toBe(true);
      expect(() => core.tick(frame(0))).toThrowError(re);
      expect(() => core.tick(frame(0))).toThrowError(/^Dòng 2:/);
    });
  }

  it('this ở hàm thường là undefined (strict), không lộ phạm vi toàn cục', () => {
    const core = new ControllerCore();
    core.load(`function g() { return this; }\nfunction loop() { motor("m", g() === undefined ? 1 : 0); }`);
    expect(core.tick(frame(0)).m).toBe(1);
  });
});

describe('Runtime theo hợp đồng ControllerRuntime', () => {
  it('LocalControllerRuntime', async () => {
    const rt = new LocalControllerRuntime();
    expect(await rt.load(`function loop() { motor("m", 0.5); print("hi"); }`)).toEqual({ ok: true });
    expect(await rt.tick(frame(0))).toEqual({ m: 0.5 });
    expect(rt.drainLogs()[0].text).toBe('hi');
    rt.dispose();
  });

  /**
   * Worker giả: dùng đúng createWorkerHandler của controller.worker (không chép lại logic).
   * forge: gửi kèm một tin giả mạo (không có nonce) trước tin thật — giả lập code thí sinh tự postMessage.
   */
  function fakeWorker(opts: { hang?: boolean; forge?: boolean } = {}): WorkerLike & { terminated: boolean } {
    let listener: ((ev: MessageEvent<FromWorker>) => void) | null = null;
    const deliver = (data: unknown) => listener?.({ data } as MessageEvent<FromWorker>);
    const handle = createWorkerHandler((out) => setTimeout(() => deliver(out), 0));
    const w = {
      terminated: false,
      addEventListener(type: string, fn: (ev: MessageEvent<FromWorker>) => void) {
        if (type === 'message') listener = fn;
      },
      terminate() { w.terminated = true; },
      postMessage(msg: ToWorker) {
        if (opts.hang && msg.type === 'tick') return; // giả lập treo cứng
        if (opts.forge && msg.type === 'tick') {
          deliver({ type: 'ticked', id: msg.id, cmd: { m: 99, laNguoiLa: 1 }, logs: [], plots: [] });
          deliver({ type: 'ticked', id: msg.id, nonce: 'doan-bua', cmd: { m: 99 }, logs: [], plots: [] });
        }
        setTimeout(() => handle(msg), 0);
      },
    };
    return w as WorkerLike & { terminated: boolean };
  }

  it('WorkerControllerRuntime: bỏ tin giả mạo không có nonce đúng', async () => {
    const rt = new WorkerControllerRuntime({ createWorker: () => fakeWorker({ forge: true }), actuators: ['m'] });
    await rt.load(`function loop() { motor("m", 0.2); }`);
    expect(await rt.tick(frame(0))).toEqual({ m: 0.2 });
    rt.dispose();
  });

  it('WorkerControllerRuntime: load, tick, params, lỗi', async () => {
    const rt = new WorkerControllerRuntime({ createWorker: () => fakeWorker() });
    expect(await rt.load(`function loop() { motor("m", param("Kp", 0.1)); plot("x", 1); }`)).toEqual({ ok: true });
    expect(await rt.tick(frame(0))).toEqual({ m: 0.1 });
    rt.setParams({ Kp: 0.9 });
    expect(await rt.tick(frame(0.01))).toEqual({ m: 0.9 });
    expect(rt.drainPlots()).toHaveLength(2);

    const bad = await rt.load(`function loop() {\n  oops();\n}`);
    expect(bad.ok).toBe(true);
    await expect(rt.tick(frame(0))).rejects.toThrow(/Dòng 2: Chưa khai báo/);
    const syn = await rt.load(`function loop() {`);
    expect(syn.ok).toBe(false);
    rt.dispose();
  });

  it('WorkerControllerRuntime: Worker treo cứng thì bị terminate', async () => {
    const w = fakeWorker({ hang: true });
    const rt = new WorkerControllerRuntime({ createWorker: () => w, hardTimeoutMs: 50 });
    await rt.load(`function loop() {}`);
    await expect(rt.tick(frame(0))).rejects.toThrow(/không phản hồi/);
    expect(w.terminated).toBe(true);
    await expect(rt.tick(frame(0))).rejects.toThrow(/không phản hồi/);
  });
});
