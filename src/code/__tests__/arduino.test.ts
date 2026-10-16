import { describe, expect, it } from 'vitest';
import type { VehicleDesign } from '@/shared/types';
import { blocksJsonToArduino } from '../arduino/generator';
import { cppIdent } from '../arduino/sketch';
import { samplePidBlocks } from '../samples/samples';

const design: VehicleDesign = {
  version: 1,
  name: 'Xe thử',
  frame: { wheelbase: 0.2, height: 0.1, material: 'mica', massKg: 0.1, steerable: true },
  parts: [
    { uid: '1', itemId: 'arduino_nano', name: 'nano', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '2', itemId: 'mpu6050', name: 'imu1', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '3', itemId: 'motor_rw_dc', name: 'banhDa', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '4', itemId: 'servo_sg90', name: 'lái', position: [0, 0, 0], rotationDeg: [0, 0, 0], pin: 'D10' },
    { uid: '5', itemId: 'hcsr04', name: 'sieuAm', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '6', itemId: 'encoder_hall', name: 'encBanhDa', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '7', itemId: 'vl53l0x', name: 'laserTruoc', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '8', itemId: 'tcrt5000', name: 'vach', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
    { uid: '9', itemId: 'motor_n20', name: 'dongCoSau', position: [0, 0, 0], rotationDeg: [0, 0, 0] },
  ],
};

function balanced(code: string): boolean {
  // bỏ chuỗi và comment rồi đếm ngoặc
  const stripped = code.replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  let a = 0, b = 0;
  for (const c of stripped) {
    if (c === '{') a++;
    if (c === '}') a--;
    if (c === '(') b++;
    if (c === ')') b--;
    if (a < 0 || b < 0) return false;
  }
  return a === 0 && b === 0;
}

describe('Xuất Arduino C++', () => {
  it('khối mẫu PID → sketch đầy đủ', () => {
    const code = blocksJsonToArduino(samplePidBlocks('banhDa'), { design });
    expect(code).toContain('#include <Wire.h>');
    expect(code).toContain('#include <Servo.h>');
    expect(code).toContain('#include <Adafruit_VL53L0X.h>');
    expect(code).toContain('PID pid;');
    expect(code).toContain('float goc = 0;');
    expect(code).toContain('pid = PID(param("Kp", 20), param("Ki", 0), param("Kd", 1.5));');
    expect(code).toMatch(/goc = imu\.roll\(\);/);
    expect(code).toMatch(/u = pid\.update\(0 - goc, dt\(\)\);/);
    expect(code).toContain('motor("banhDa", u);');
    expect(code).toContain('plot("goc", goc);');
    expect(code).toContain('print("Xe khởi động");');
    expect(code).toContain('void setup() {');
    expect(code).toContain('void loop() {');
    expect(code).toContain('Arduino Nano');
    expect(code).toContain('const unsigned long LOOP_US = 10000;'); // 100 Hz
    // chân cắm: servo giữ chân gán sẵn D10, có chú thích sửa chân
    expect(code).toContain('#define LAI_PIN 10');
    expect(code).toMatch(/#define BANHDA_PWM \d+ .*← sửa cho đúng dây nối thật/);
    expect(code).toContain('#define TB6612_STBY');
    expect(code).toContain('#define SIEUAM_TRIG');
    expect(code).toMatch(/#define ENCBANHDA_PIN [23] /);
    expect(code).toContain('if (strcmp(name, "lái") == 0) servo_lai.write');
    // không còn cú pháp riêng của JS
    expect(code.replace(/\/\/.*$/gm, '')).not.toMatch(/\bvar\b|\bnew PID\b|Math\.|===|'banhDa'/);
    expect(balanced(code)).toBe(true);
  });

  it('khối toán/vòng lặp/hàm sinh đúng C++', () => {
    const json = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'procedures_defreturn',
            extraState: { params: [{ name: 'x', id: 'vx' }] },
            fields: { NAME: 'binhPhuong' },
            inputs: {
              RETURN: {
                block: { type: 'math_arithmetic', fields: { OP: 'POWER' }, inputs: { A: { block: { type: 'variables_get', fields: { VAR: { id: 'vx' } } } }, B: { block: { type: 'math_number', fields: { NUM: 2 } } } } },
              },
            },
          },
          {
            type: 'probike_loop',
            inputs: {
              DO: {
                block: {
                  type: 'controls_repeat_ext',
                  inputs: { TIMES: { block: { type: 'math_number', fields: { NUM: 3 } } } },
                  next: {
                    block: {
                      type: 'variables_set', fields: { VAR: { id: 'vy' } },
                      inputs: {
                        VALUE: {
                          block: {
                            type: 'math_arithmetic', fields: { OP: 'DIVIDE' },
                            inputs: {
                              A: { block: { type: 'math_number', fields: { NUM: 1 } } },
                              B: { block: { type: 'math_trig', fields: { OP: 'SIN' }, inputs: { NUM: { block: { type: 'math_number', fields: { NUM: 30 } } } } } },
                            },
                          },
                        },
                      },
                      next: {
                        block: {
                          type: 'controls_if',
                          inputs: {
                            IF0: { block: { type: 'logic_compare', fields: { OP: 'EQ' }, inputs: { A: { block: { type: 'math_modulo', inputs: { DIVIDEND: { block: { type: 'variables_get', fields: { VAR: { id: 'vy' } } } }, DIVISOR: { block: { type: 'math_number', fields: { NUM: 2 } } } } } }, B: { block: { type: 'math_number', fields: { NUM: 0 } } } } } },
                            DO0: { block: { type: 'math_change', fields: { VAR: { id: 'vy' } }, inputs: { DELTA: { block: { type: 'procedures_callreturn', extraState: { name: 'binhPhuong', params: ['x'] }, inputs: { ARG0: { block: { type: 'math_number', fields: { NUM: 4 } } } } } } } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          { type: 'math_number', fields: { NUM: 5 }, x: 400, y: 0 },
        ],
      },
      variables: [{ name: 'x', id: 'vx' }, { name: 'y', id: 'vy' }],
    };
    const code = blocksJsonToArduino(json);
    expect(code).toContain('float binhPhuong(float x) {');
    expect(code).toContain('return pow(x, 2);');
    expect(code).toMatch(/for \(int lan\w* = 0; lan\w* < 3; lan\w*\+\+\) \{/);
    expect(code).toContain('y = 1 / (float)(sin((30) * DEG_TO_RAD));');
    expect(code).toContain('if (fmod(y, 2) == 0) {');
    expect(code).toContain('y += binhPhuong(4);');
    expect(code).toContain('không nằm trong "khi khởi động" hay "lặp mãi"');
    expect(balanced(code)).toBe(true);
  });

  it('không có thiết kế: suy ra linh kiện từ khối đã dùng', () => {
    const code = blocksJsonToArduino({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'probike_loop',
          inputs: { DO: { block: { type: 'probike_motor', fields: { PART: 'dongCo' }, inputs: { VALUE: { block: { type: 'probike_read', fields: { PART: 'camBien' } } } } } } },
        }],
      },
    });
    expect(code).toContain('if (strcmp(name, "dongCo") == 0) motorTB6612(DONGCO_PWM');
    expect(code).toContain('chưa rõ loại cảm biến');
    expect(code).toContain('motor("dongCo", read("camBien"));');
    expect(balanced(code)).toBe(true);
  });

  it('cppIdent bỏ dấu tiếng Việt', () => {
    expect(cppIdent('lái')).toBe('lai');
    expect(cppIdent('Động cơ sau')).toBe('Dong_co_sau');
    expect(cppIdent('2banh')).toBe('p_2banh');
  });
});
