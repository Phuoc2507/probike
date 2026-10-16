import { describe, expect, it } from 'vitest';
import type { SensorFrame } from '@/shared/types';
import { Blockly, blocksJsonToJs, setupBlockly } from '../blockly/blocks';
import { setPartOptions } from '../blockly/parts';
import { ControllerCore } from '../runtime/core';
import { samplePidBlocks, samplePidJs, emptyBlocks } from '../samples/samples';

const frame = (t: number, roll: number): SensorFrame => ({
  t, values: { laser: 42, enc: 3 }, imu: { roll, pitch: 0, yaw: 0, gyro: [0, 0, 0], acc: [0, 9.8, 0] },
});

describe('Blockly → JavaScript', () => {
  it('khối mẫu PID sinh ra JS chạy được và cho cùng kết quả với JS mẫu', () => {
    const js = blocksJsonToJs(samplePidBlocks('banhDa'));
    expect(js).toContain('function setup()');
    expect(js).toContain('function loop()');
    expect(js).toContain("new PID(param('Kp', 20), param('Ki', 0), param('Kd', 1.5))");
    expect(js).toContain("motor('banhDa', u);");

    const a = new ControllerCore({ actuators: ['banhDa'] });
    const b = new ControllerCore({ actuators: ['banhDa'] });
    expect(a.load(js)).toEqual({ ok: true });
    expect(b.load(samplePidJs('banhDa'))).toEqual({ ok: true });
    for (let i = 0; i < 20; i++) {
      const f = frame(i * 0.01, Math.sin(i / 3) * 0.02);
      expect(a.tick(f).banhDa).toBeCloseTo(b.tick(f).banhDa, 9);
    }
    expect(a.drainLogs()[0].text).toBe('Xe khởi động');
    expect(a.drainPlots().map((p) => p.label)).toContain('goc');
  });

  it('mọi khối ProBike và khối chuẩn trong toolbox đều sinh được code hợp lệ', () => {
    setupBlockly();
    const ws = new Blockly.Workspace();
    const json = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'probike_loop',
            inputs: {
              DO: {
                block: {
                  type: 'controls_if',
                  inputs: {
                    IF0: {
                      block: {
                        type: 'logic_compare', fields: { OP: 'LT' },
                        inputs: { A: { block: { type: 'probike_read', fields: { PART: 'laser' } } }, B: { block: { type: 'math_number', fields: { NUM: 50 } } } },
                      },
                    },
                    DO0: {
                      block: {
                        type: 'probike_servo', fields: { PART: 'lai' },
                        inputs: {
                          VALUE: {
                            block: {
                              type: 'probike_map',
                              inputs: {
                                VALUE: { block: { type: 'probike_encoder', fields: { PART: 'enc' } } },
                                FROM_LOW: { block: { type: 'math_number', fields: { NUM: 0 } } },
                                FROM_HIGH: { block: { type: 'math_number', fields: { NUM: 10 } } },
                                TO_LOW: { block: { type: 'math_number', fields: { NUM: 0 } } },
                                TO_HIGH: { block: { type: 'math_number', fields: { NUM: 30 } } },
                              },
                            },
                          },
                        },
                        next: {
                          block: {
                            type: 'probike_motor', fields: { PART: 'sau' },
                            inputs: {
                              VALUE: {
                                block: {
                                  type: 'probike_constrain',
                                  inputs: {
                                    VALUE: { block: { type: 'probike_millis' } },
                                    LOW: { block: { type: 'math_number', fields: { NUM: 0 } } },
                                    HIGH: { block: { type: 'math_number', fields: { NUM: 0.5 } } },
                                  },
                                },
                              },
                            },
                            next: { block: { type: 'probike_print', inputs: { VALUE: { block: { type: 'probike_imu', fields: { AXIS: 'gyroX' } } } } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    };
    Blockly.serialization.workspaces.load(json, ws);
    const js = blocksJsonToJs(json);
    ws.dispose();
    const core = new ControllerCore();
    expect(core.load(js)).toEqual({ ok: true });
    expect(core.tick(frame(1, 0))).toEqual({ lai: 9, sau: 0.5 });
  });

  it('khối while(true) do thí sinh kéo vẫn bị watchdog dừng', () => {
    const js = blocksJsonToJs({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'probike_loop',
          inputs: { DO: { block: { type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs: { BOOL: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } } } } },
        }],
      },
    });
    const core = new ControllerCore({ watchdogMs: 20 });
    expect(core.load(js).ok).toBe(true);
    expect(() => core.tick(frame(0, 0))).toThrow(/chạy quá 20 ms/);
  });

  it('dropdown tên linh kiện nhận tên lạ (chưa có trong thiết kế) mà không mất', () => {
    setPartOptions(['banhDa']);
    const js = blocksJsonToJs({
      blocks: { languageVersion: 0, blocks: [{ type: 'probike_loop', inputs: { DO: { block: { type: 'probike_motor', fields: { PART: 'tenLa' } } } } }] },
    });
    expect(js).toContain("motor('tenLa', 0);");
  });

  it('workspace trống có khung setup/loop chạy được', () => {
    const core = new ControllerCore();
    expect(core.load(blocksJsonToJs(emptyBlocks()))).toEqual({ ok: true });
    expect(core.tick(frame(0, 0))).toEqual({});
  });
});
