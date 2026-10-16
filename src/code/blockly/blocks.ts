// Khối Blockly tiếng Việt cho ProBike — khớp 1-1 với API trong PLAN.md mục 7 — và generator JavaScript.
// Gọi setupBlockly() một lần trước khi tạo workspace (an toàn khi gọi nhiều lần). Chạy được cả trong Node (test).

import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import * as Vi from 'blockly/msg/vi';
import { API_NAMES } from '../api-docs';
import { partNamesFor, type PartKind } from './parts';

export const COLOURS = {
  bike: 25,     // cam — vào/ra của xe
  sensor: 190,  // xanh ngọc — cảm biến
  actuator: 0,  // đỏ — động cơ, servo
  pid: 290,     // tím — PID
  display: 120, // xanh lá — in, vẽ
  math: 230,
};

// ------------------------------------------------------------ Trường dropdown tên linh kiện

const PLACEHOLDER = '(chưa có linh kiện)';

/**
 * Dropdown tên linh kiện. Khác FieldDropdown thường: chấp nhận mọi tên (kể cả tên không còn trong thiết kế,
 * ví dụ khi tải workspace của đồng đội trước khi thiết kế đồng bộ xong) và hiện tên đó trong danh sách.
 */
export class FieldPart extends Blockly.FieldDropdown {
  readonly kind: PartKind;

  constructor(kind: PartKind = 'all') {
    // Lúc super() chạy chưa có this → dùng danh sách chung; sau đó tra theo workspace của khối
    let self: FieldPart | null = null;
    super(() => {
      const names = partNamesFor(kind, self?.getSourceBlock()?.workspace);
      return names.length ? names.map((n) => [n, n] as [string, string]) : [[PLACEHOLDER, '']];
    });
    self = this;
    this.kind = kind;
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & { kind?: PartKind }): FieldPart {
    return new FieldPart(options.kind ?? 'all');
  }

  override getOptions(useCache?: boolean): Blockly.MenuOption[] {
    const opts = super.getOptions(useCache);
    const v = this.getValue();
    if (typeof v === 'string' && v !== '' && !opts.some((o) => o[1] === v)) return [...opts, [v, v]];
    return opts;
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' ? newValue : null;
  }
}

// ------------------------------------------------------------ Định nghĩa khối

const partField = (name: string, kind: PartKind) => ({ type: 'field_probike_part', name, kind });

const BLOCKS = [
  {
    type: 'probike_setup',
    message0: 'khi khởi động (setup) %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: COLOURS.bike,
    tooltip: 'Các lệnh ở đây chạy MỘT lần khi xe bắt đầu chạy.',
  },
  {
    type: 'probike_loop',
    message0: 'lặp mãi (loop) %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: COLOURS.bike,
    tooltip: 'Các lệnh ở đây chạy LẶP LẠI mỗi chu kỳ điều khiển (ví dụ 100 lần/giây với Arduino Nano).',
  },
  {
    type: 'probike_imu',
    message0: 'IMU %1',
    args0: [{
      type: 'field_dropdown', name: 'AXIS', options: [
        ['góc nghiêng ngang (roll, độ)', 'roll'],
        ['góc chúc (pitch, độ)', 'pitch'],
        ['góc hướng (yaw, độ)', 'yaw'],
        ['tốc độ nghiêng (gyroX, độ/s)', 'gyroX'],
        ['tốc độ quay đầu (gyroY, độ/s)', 'gyroY'],
        ['tốc độ chúc (gyroZ, độ/s)', 'gyroZ'],
        ['gia tốc X (accX, m/s²)', 'accX'],
        ['gia tốc Y (accY, m/s²)', 'accY'],
        ['gia tốc Z (accZ, m/s²)', 'accZ'],
      ],
    }],
    output: 'Number',
    colour: COLOURS.sensor,
    tooltip: 'Đọc cảm biến IMU (MPU6050). roll: nghiêng phải là dương; pitch: ngóc đầu lên là dương; yaw: rẽ trái là dương.',
  },
  {
    type: 'probike_read',
    message0: 'đọc cảm biến %1',
    args0: [partField('PART', 'sensor')],
    output: 'Number',
    colour: COLOURS.sensor,
    tooltip: 'Khoảng cách (cm) với laser/siêu âm/hồng ngoại đo khoảng cách; 0/1 với hồng ngoại phản xạ.',
  },
  {
    type: 'probike_encoder',
    message0: 'tốc độ encoder %1 (vòng/giây)',
    args0: [partField('PART', 'encoder')],
    output: 'Number',
    colour: COLOURS.sensor,
    tooltip: 'Tốc độ quay đo bởi encoder, vòng/giây.',
  },
  {
    type: 'probike_motor',
    message0: 'chạy động cơ %1 công suất %2',
    args0: [partField('PART', 'motor'), { type: 'input_value', name: 'VALUE', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.actuator,
    tooltip: 'Công suất từ -1 (quay lùi hết cỡ) đến 1 (quay tới hết cỡ). 0 là dừng.',
  },
  {
    type: 'probike_servo',
    message0: 'quay servo %1 tới góc %2 độ',
    args0: [partField('PART', 'servo'), { type: 'input_value', name: 'VALUE', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.actuator,
    tooltip: 'Góc servo tính bằng độ, 0 là ở giữa (lái thẳng).',
  },
  {
    type: 'probike_millis',
    message0: 'thời gian đã chạy (ms)',
    output: 'Number',
    colour: COLOURS.bike,
    tooltip: 'Số mili giây từ lúc xe bắt đầu chạy — millis().',
  },
  {
    type: 'probike_dt',
    message0: 'dt (giây từ lần lặp trước)',
    output: 'Number',
    colour: COLOURS.bike,
    tooltip: 'Khoảng thời gian giữa hai lần loop, giây — dt().',
  },
  {
    type: 'probike_pid_create',
    message0: 'tạo bộ PID %1 Kp %2 Ki %3 Kd %4',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'pid' },
      { type: 'input_value', name: 'KP', check: 'Number' },
      { type: 'input_value', name: 'KI', check: 'Number' },
      { type: 'input_value', name: 'KD', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.pid,
    tooltip: 'Tạo bộ điều khiển PID (nên đặt trong "khi khởi động"). Kp: tỉ lệ, Ki: tích phân, Kd: vi phân.',
  },
  {
    type: 'probike_pid_update',
    message0: '%1 tính với sai số %2 dt %3',
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'pid' },
      { type: 'input_value', name: 'ERROR', check: 'Number' },
      { type: 'input_value', name: 'DT', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.pid,
    tooltip: 'Đầu ra PID = Kp·e + Ki·∫e dt + Kd·de/dt — pid.update(saiSo, dt).',
  },
  {
    type: 'probike_pid_reset',
    message0: 'đặt lại bộ PID %1',
    args0: [{ type: 'field_variable', name: 'VAR', variable: 'pid' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.pid,
    tooltip: 'Xoá phần tích phân và sai số cũ — pid.reset().',
  },
  {
    type: 'probike_param',
    message0: 'tham số %1 mặc định %2',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'Kp' },
      { type: 'field_number', name: 'DEFAULT', value: 0 },
    ],
    output: 'Number',
    colour: COLOURS.pid,
    tooltip: 'Giá trị lấy từ thanh trượt cùng tên (Kp, Ki, Kd...). Chưa có thanh trượt thì dùng mặc định.',
  },
  {
    type: 'probike_plot',
    message0: 'vẽ biểu đồ %1 giá trị %2',
    args0: [{ type: 'field_input', name: 'LABEL', text: 'goc' }, { type: 'input_value', name: 'VALUE', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.display,
    tooltip: 'Vẽ giá trị lên biểu đồ theo thời gian.',
  },
  {
    type: 'probike_print',
    message0: 'in ra %1',
    args0: [{ type: 'input_value', name: 'VALUE' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLOURS.display,
    tooltip: 'In giá trị ra bảng log.',
  },
  {
    type: 'probike_constrain',
    message0: 'giới hạn %1 trong khoảng %2 đến %3',
    args0: [
      { type: 'input_value', name: 'VALUE', check: 'Number' },
      { type: 'input_value', name: 'LOW', check: 'Number' },
      { type: 'input_value', name: 'HIGH', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.math,
    tooltip: 'constrain(x, min, max)',
  },
  {
    type: 'probike_map',
    message0: 'đổi thang %1 từ %2 – %3 sang %4 – %5',
    args0: [
      { type: 'input_value', name: 'VALUE', check: 'Number' },
      { type: 'input_value', name: 'FROM_LOW', check: 'Number' },
      { type: 'input_value', name: 'FROM_HIGH', check: 'Number' },
      { type: 'input_value', name: 'TO_LOW', check: 'Number' },
      { type: 'input_value', name: 'TO_HIGH', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLOURS.math,
    tooltip: 'map(x, tuMin, tuMax, sangMin, sangMax) — đổi thang đo tuyến tính.',
  },
];

export const PROBIKE_BLOCK_TYPES = BLOCKS.map((b) => b.type);

// ------------------------------------------------------------ Generator JavaScript

type Gen = typeof javascriptGenerator;

function registerJsGenerators(gen: Gen): void {
  const f = gen.forBlock;
  // Luôn dùng generator g được truyền vào (để generator Arduino kế thừa được các hàm này)
  const part = (b: Blockly.Block, g: Gen) => g.quote_(String(b.getFieldValue('PART') ?? ''));
  const val = (g: Gen, b: Blockly.Block, name: string, order: number, fallback = '0') => g.valueToCode(b, name, order) || fallback;
  const varName = (b: Blockly.Block, g: Gen) => g.getVariableName(b.getFieldValue('VAR'));

  f['probike_setup'] = (b, g) => `function setup() {\n${g.statementToCode(b, 'DO')}}\n`;
  f['probike_loop'] = (b, g) => `function loop() {\n${g.statementToCode(b, 'DO')}}\n`;
  f['probike_imu'] = (b) => [`imu.${b.getFieldValue('AXIS')}()`, Order.FUNCTION_CALL];
  f['probike_read'] = (b, g) => [`read(${part(b, g)})`, Order.FUNCTION_CALL];
  f['probike_encoder'] = (b, g) => [`encoder(${part(b, g)})`, Order.FUNCTION_CALL];
  f['probike_motor'] = (b, g) => `motor(${part(b, g)}, ${val(g, b, 'VALUE', Order.COMMA)});\n`;
  f['probike_servo'] = (b, g) => `servo(${part(b, g)}, ${val(g, b, 'VALUE', Order.COMMA)});\n`;
  f['probike_millis'] = () => ['millis()', Order.FUNCTION_CALL];
  f['probike_dt'] = () => ['dt()', Order.FUNCTION_CALL];
  f['probike_pid_create'] = (b, g) =>
    `${varName(b, g)} = new PID(${val(g, b, 'KP', Order.COMMA)}, ${val(g, b, 'KI', Order.COMMA)}, ${val(g, b, 'KD', Order.COMMA)});\n`;
  f['probike_pid_update'] = (b, g) =>
    [`${varName(b, g)}.update(${val(g, b, 'ERROR', Order.COMMA)}, ${val(g, b, 'DT', Order.COMMA, 'dt()')})`, Order.FUNCTION_CALL];
  f['probike_pid_reset'] = (b, g) => `${varName(b, g)}.reset();\n`;
  f['probike_param'] = (b, g) =>
    [`param(${g.quote_(String(b.getFieldValue('NAME')))}, ${Number(b.getFieldValue('DEFAULT')) || 0})`, Order.FUNCTION_CALL];
  f['probike_plot'] = (b, g) => `plot(${g.quote_(String(b.getFieldValue('LABEL')))}, ${val(g, b, 'VALUE', Order.COMMA)});\n`;
  f['probike_print'] = (b, g) => `print(${val(g, b, 'VALUE', Order.NONE, g.quote_(''))});\n`;
  f['probike_constrain'] = (b, g) =>
    [`constrain(${val(g, b, 'VALUE', Order.COMMA)}, ${val(g, b, 'LOW', Order.COMMA)}, ${val(g, b, 'HIGH', Order.COMMA)})`, Order.FUNCTION_CALL];
  f['probike_map'] = (b, g) =>
    [`map(${['VALUE', 'FROM_LOW', 'FROM_HIGH', 'TO_LOW', 'TO_HIGH'].map((n) => val(g, b, n, Order.COMMA)).join(', ')})`, Order.FUNCTION_CALL];
}

// ------------------------------------------------------------ Khởi tạo

let ready = false;

export function setupBlockly(): void {
  if (ready) return;
  ready = true;
  Blockly.setLocale(Vi as unknown as { [key: string]: string });
  if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_probike_part')) {
    Blockly.fieldRegistry.register('field_probike_part', FieldPart);
  }
  Blockly.common.defineBlocksWithJsonArray(BLOCKS);
  javascriptGenerator.addReservedWords(API_NAMES.join(','));
  registerJsGenerators(javascriptGenerator);
}

/** Sinh JavaScript (chạy được bằng ControllerRuntime) từ workspace. */
export function workspaceToJs(ws: Blockly.Workspace): string {
  setupBlockly();
  return javascriptGenerator.workspaceToCode(ws);
}

/** Sinh JavaScript từ JSON workspace (Blockly.serialization) — không cần giao diện. */
export function blocksJsonToJs(json: object | null | undefined): string {
  setupBlockly();
  const ws = new Blockly.Workspace();
  try {
    if (json) Blockly.serialization.workspaces.load(json, ws, { recordUndo: false });
    return javascriptGenerator.workspaceToCode(ws);
  } finally {
    ws.dispose();
  }
}

export { Blockly, javascriptGenerator };
