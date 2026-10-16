// Code mẫu PID cân bằng xe bằng bánh đà — dạng JavaScript và dạng khối Blockly (JSON serialization).

/** Tên mặc định của động cơ bánh đà trong code mẫu (đổi theo tên đặt khi lắp ráp). */
export const DEFAULT_FLYWHEEL_NAME = 'banhDa';

/** Hệ số mặc định — giống ví dụ PLAN.md mục 7. Tinh chỉnh bằng thanh trượt Kp/Ki/Kd. */
export const DEFAULT_GAINS = { Kp: 20, Ki: 0, Kd: 1.5 };

export interface Gains { Kp: number; Ki: number; Kd: number }

/** Code JS mẫu: PID cân bằng, hệ số lấy từ thanh trượt qua param(). */
export function samplePidJs(motorName = DEFAULT_FLYWHEEL_NAME, gains: Gains = DEFAULT_GAINS): string {
  return `// Mẫu: giữ thăng bằng bằng bánh đà với bộ điều khiển PID
// Sai số = góc mong muốn (0°, đứng thẳng) - góc nghiêng hiện tại
const pid = new PID(param("Kp", ${gains.Kp}), param("Ki", ${gains.Ki}), param("Kd", ${gains.Kd}));

function setup() {
  print("Xe khởi động");
}

function loop() {
  // Cập nhật hệ số từ thanh trượt (kéo là thấy tác dụng ngay)
  pid.setTunings(param("Kp", ${gains.Kp}), param("Ki", ${gains.Ki}), param("Kd", ${gains.Kd}));

  const goc = imu.roll();                 // độ, nghiêng phải là dương
  const u = pid.update(0 - goc, dt());     // đầu ra điều khiển
  motor(${JSON.stringify(motorName)}, u);              // -1..1, tự kẹp nếu vượt

  plot("goc", goc);
  plot("u", u);
}
`;
}

// ------------------------------------------------------------ Dựng JSON khối

type BlockState = Record<string, unknown>;

const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const varGet = (id: string): BlockState => ({ type: 'variables_get', fields: { VAR: { id } } });
const param = (name: string, def: number) => ({
  ...num(def),
  block: { type: 'probike_param', fields: { NAME: name, DEFAULT: def } },
});

/** Nối các khối lệnh thành chuỗi next. */
function chain(blocks: BlockState[]): BlockState | undefined {
  let next: BlockState | undefined;
  for (let i = blocks.length - 1; i >= 0; i--) {
    next = next ? { ...blocks[i], next: { block: next } } : blocks[i];
  }
  return next;
}

export const SAMPLE_VAR_IDS = { pid: 'v_pid', goc: 'v_goc', u: 'v_u' };

/** Workspace Blockly mẫu tương đương samplePidJs (hệ số đọc một lần khi khởi động). */
export function samplePidBlocks(motorName = DEFAULT_FLYWHEEL_NAME, gains: Gains = DEFAULT_GAINS): object {
  const { pid, goc, u } = SAMPLE_VAR_IDS;
  const setupBody = chain([
    { type: 'probike_print', inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'Xe khởi động' } } } } },
    {
      type: 'probike_pid_create',
      fields: { VAR: { id: pid } },
      inputs: { KP: param('Kp', gains.Kp), KI: param('Ki', gains.Ki), KD: param('Kd', gains.Kd) },
    },
  ]);
  const loopBody = chain([
    { type: 'variables_set', fields: { VAR: { id: goc } }, inputs: { VALUE: { block: { type: 'probike_imu', fields: { AXIS: 'roll' } } } } },
    {
      type: 'variables_set',
      fields: { VAR: { id: u } },
      inputs: {
        VALUE: {
          block: {
            type: 'probike_pid_update',
            fields: { VAR: { id: pid } },
            inputs: {
              ERROR: {
                block: {
                  type: 'math_arithmetic',
                  fields: { OP: 'MINUS' },
                  inputs: { A: num(0), B: { ...num(0), block: varGet(goc) } },
                },
              },
              DT: { block: { type: 'probike_dt' } },
            },
          },
        },
      },
    },
    { type: 'probike_motor', fields: { PART: motorName }, inputs: { VALUE: { ...num(0), block: varGet(u) } } },
    { type: 'probike_plot', fields: { LABEL: 'goc' }, inputs: { VALUE: { ...num(0), block: varGet(goc) } } },
    { type: 'probike_plot', fields: { LABEL: 'u' }, inputs: { VALUE: { ...num(0), block: varGet(u) } } },
  ]);
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: 'probike_setup', x: 20, y: 20, inputs: { DO: { block: setupBody } } },
        { type: 'probike_loop', x: 20, y: 200, inputs: { DO: { block: loopBody } } },
      ],
    },
    variables: [
      { name: 'pid', id: pid },
      { name: 'goc', id: goc },
      { name: 'u', id: u },
    ],
  };
}

/** Workspace trống có sẵn hai khối khởi động / lặp mãi. */
export function emptyBlocks(): object {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: 'probike_setup', x: 20, y: 20 },
        { type: 'probike_loop', x: 20, y: 140 },
      ],
    },
  };
}

/** Code JS trống theo khung Arduino. */
export const EMPTY_JS = `function setup() {
  // chạy một lần khi xe khởi động
}

function loop() {
  // chạy lặp lại mỗi chu kỳ điều khiển
}
`;
