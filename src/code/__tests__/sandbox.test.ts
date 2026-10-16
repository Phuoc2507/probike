import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import type { SensorFrame } from '@/shared/types';
import { ControllerCore } from '../runtime/core';
import { hardenGlobalScope, hardenRealm } from '../runtime/harden';

const frame = (t = 0): SensorFrame => ({ t, values: {}, imu: { roll: 0, pitch: 0, yaw: 0, gyro: [0, 0, 0], acc: [0, 9.8, 0] } });

describe('Cú pháp bị cấm khi nạp code', () => {
  const cases: [string, RegExp][] = [
    ['const g = (0, eval)("this");', /Dòng 2: Không được dùng eval/],
    ['const m = import("https://example.com/x.js");', /Dòng 2: Không được dùng import/],
    ['async function f() { await 1; }', /Dòng 2: Không dùng async\/await/],
    ['var __pb_guard = () => true;', /Dòng 2: Tên "__pb_guard" dành riêng/],
    ['const __pb_env = 1;', /dành riêng/],
  ];
  for (const [code, re] of cases) {
    it(code, () => {
      const res = new ControllerCore().load(`// dòng 1\n${code}\nfunction loop() {}`);
      expect(res.ok).toBe(false);
      expect(!res.ok && res.error).toMatch(re);
    });
  }

  it('thuộc tính tên eval/import hay chuỗi "__pb" vẫn hợp lệ', () => {
    const res = new ControllerCore().load(`const o = { eval: 1 };\nconst s = "__pb_guard";\nfunction loop() { motor("m", o.eval); }`);
    expect(res).toEqual({ ok: true });
  });
});

describe('Không tắt được watchdog / phép kẹp', () => {
  it('performance, Promise bị chặn; Math là bản đóng băng', () => {
    const c1 = new ControllerCore();
    c1.load(`function loop() { performance.now = () => 0; }`);
    expect(() => c1.tick(frame())).toThrow(/Không dùng performance/);

    const c2 = new ControllerCore();
    c2.load(`function loop() { Promise.resolve().then(loop); }`);
    expect(() => c2.tick(frame())).toThrow(/Không dùng Promise/);

    const c3 = new ControllerCore();
    c3.load(`function loop() {\n  Math.min = () => 5;\n}`);
    expect(() => c3.tick(frame())).toThrow(/Dòng 2:/);
  });

  it('lách ra phạm vi toàn cục sửa performance.now và Math.min: watchdog và kẹp motor vẫn đúng', () => {
    const g = globalThis as unknown as { performance: Performance; Math: Math };
    const savedNow = g.performance.now;
    const savedMin = Math.min;
    const savedMax = Math.max;
    try {
      const core = new ControllerCore({ watchdogMs: 30 });
      const res = core.load(`
        const G = (function () {}).constructor("return this")();
        G.performance.now = () => 0;
        G.Math.min = () => 5;
        G.Math.max = () => 5;
        let n = 0;
        function loop() {
          motor("m", 5);
          if (n++ > 0) while (true) {}
        }`);
      expect(res).toEqual({ ok: true });
      expect(core.tick(frame(0))).toEqual({ m: 1 }); // kẹp dùng Math gốc đã chụp
      expect(() => core.tick(frame(0.01))).toThrow(/chạy quá 30 ms/); // đồng hồ gốc đã chụp
    } finally {
      g.performance.now = savedNow;
      Math.min = savedMin;
      Math.max = savedMax;
    }
  });
});

describe('Lớp bảo vệ Worker (harden.ts) trong realm riêng', () => {
  function makeRealm() {
    const ctx = vm.createContext({});
    const realm = vm.runInContext('globalThis', ctx) as Record<string, unknown>;
    realm.postMessage = () => 'đã gửi';
    realm.fetch = () => 'mạng';
    hardenGlobalScope(realm, ['postMessage', 'fetch']);
    hardenRealm(realm as unknown as Parameters<typeof hardenRealm>[0]);
    return (code: string) => vm.runInContext(code, ctx);
  }

  it('chặn postMessage, fetch, constructor của mọi loại hàm, eval gián tiếp, sửa Math', () => {
    const run = makeRealm();
    expect(() => run('postMessage({ type: "ticked", id: 1, cmd: { m: 99 } })')).toThrow(/postMessage/);
    expect(() => run('fetch("https://example.com")')).toThrow(/fetch/);
    expect(() => run('(function () {}).constructor("return this")()')).toThrow(/Function/);
    expect(() => run('(() => {}).constructor("return this")()')).toThrow(/Function/);
    expect(() => run('(async function () {}).constructor("return 1")')).toThrow(/Function/);
    expect(() => run('(function* () {}).constructor("")')).toThrow(/Function/);
    expect(() => run('(async function* () {}).constructor("")')).toThrow(/Function/);
    expect(() => run('(0, eval)("this")')).toThrow(/eval/);
    expect(() => run('"use strict"; Math.min = () => 5;')).toThrow();
    // Function toàn cục vẫn dùng được cho lõi runtime
    expect(run('new Function("return 2")()')).toBe(2);
  });
});
