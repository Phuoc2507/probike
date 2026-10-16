// Hộp công cụ (toolbox) tiếng Việt. Chỉ gồm các khối có cả generator JavaScript lẫn Arduino C++.

import { COLOURS } from './blocks';

const n = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const block = (type: string, extra: Record<string, unknown> = {}) => ({ kind: 'block', type, ...extra });

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Xe ProBike', colour: String(COLOURS.bike),
      contents: [
        block('probike_setup'),
        block('probike_loop'),
        block('probike_imu'),
        block('probike_read'),
        block('probike_encoder'),
        block('probike_motor', { inputs: { VALUE: n(0.5) } }),
        block('probike_servo', { inputs: { VALUE: n(0) } }),
        block('probike_millis'),
        block('probike_dt'),
      ],
    },
    {
      kind: 'category', name: 'PID', colour: String(COLOURS.pid),
      contents: [
        block('probike_pid_create', { inputs: { KP: n(20), KI: n(0), KD: n(1.5) } }),
        block('probike_pid_update', {
          inputs: {
            ERROR: {
              block: {
                type: 'math_arithmetic', fields: { OP: 'MINUS' },
                inputs: { A: n(0), B: { ...n(0), block: { type: 'probike_imu', fields: { AXIS: 'roll' } } } },
              },
            },
            DT: { block: { type: 'probike_dt' } },
          },
        }),
        block('probike_pid_reset'),
        block('probike_param'),
      ],
    },
    {
      kind: 'category', name: 'Hiển thị', colour: String(COLOURS.display),
      contents: [
        block('probike_plot', { inputs: { VALUE: n(0) } }),
        block('probike_print', { inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'xin chào' } } } } }),
        block('text'),
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category', name: 'Logic', categorystyle: 'logic_category',
      contents: [
        block('controls_if'),
        block('logic_compare'),
        block('logic_operation'),
        block('logic_negate'),
        block('logic_boolean'),
        block('logic_ternary'),
      ],
    },
    {
      kind: 'category', name: 'Vòng lặp', categorystyle: 'loop_category',
      contents: [
        block('controls_repeat_ext', { inputs: { TIMES: n(10) } }),
        block('controls_whileUntil'),
        block('controls_for', { inputs: { FROM: n(1), TO: n(10), BY: n(1) } }),
        block('controls_flow_statements'),
      ],
    },
    {
      kind: 'category', name: 'Toán', categorystyle: 'math_category',
      contents: [
        block('math_number'),
        block('math_arithmetic', { inputs: { A: n(1), B: n(1) } }),
        block('math_single', { inputs: { NUM: n(9) } }),
        block('math_trig', { inputs: { NUM: n(45) } }),
        block('math_constant'),
        block('math_round', { inputs: { NUM: n(3.1) } }),
        block('math_modulo', { inputs: { DIVIDEND: n(64), DIVISOR: n(10) } }),
        block('probike_constrain', { inputs: { VALUE: n(0), LOW: n(-1), HIGH: n(1) } }),
        block('probike_map', { inputs: { VALUE: n(0), FROM_LOW: n(0), FROM_HIGH: n(100), TO_LOW: n(0), TO_HIGH: n(1) } }),
      ],
    },
    { kind: 'category', name: 'Biến', categorystyle: 'variable_category', custom: 'VARIABLE' },
    { kind: 'category', name: 'Hàm', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
  ],
};

/** Các loại khối chuẩn của Blockly được hỗ trợ (cả JS lẫn Arduino). */
export const SUPPORTED_STANDARD_BLOCKS = [
  'controls_if', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'logic_ternary', 'logic_null',
  'controls_repeat_ext', 'controls_repeat', 'controls_whileUntil', 'controls_for', 'controls_flow_statements',
  'math_number', 'math_arithmetic', 'math_single', 'math_trig', 'math_constant', 'math_round', 'math_modulo',
  'text', 'variables_get', 'variables_set', 'math_change',
  'procedures_defnoreturn', 'procedures_defreturn', 'procedures_callnoreturn', 'procedures_callreturn', 'procedures_ifreturn',
];
