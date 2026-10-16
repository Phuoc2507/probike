// Generator Arduino C++ từ khối Blockly. Kế thừa generator JavaScript (cú pháp biểu thức gần như giống C),
// chỉ viết lại các khối khác biệt: kiểu biến float, chuỗi "…", hàm toán học C, chia số thực, hàm tự tạo...

import * as Blockly from 'blockly';
import { JavascriptGenerator, javascriptGenerator, Order } from 'blockly/javascript';
import { CATALOG_BY_ID } from '@/shared/catalog';
import type { VehicleDesign } from '@/shared/types';
import { setupBlockly } from '../blockly/blocks';
import { buildSketch, type ArduinoPart, type SketchInput } from './sketch';

const CPP_RESERVED = [
  'int', 'float', 'double', 'char', 'long', 'short', 'unsigned', 'signed', 'bool', 'boolean', 'byte', 'word', 'void',
  'class', 'struct', 'union', 'enum', 'template', 'typename', 'namespace', 'using', 'public', 'private', 'protected',
  'virtual', 'friend', 'operator', 'sizeof', 'static', 'extern', 'volatile', 'register', 'auto', 'const', 'goto',
  'inline', 'explicit', 'mutable', 'asm', 'String', 'Serial', 'Wire', 'Servo', 'HIGH', 'LOW', 'INPUT', 'OUTPUT',
  'setup', 'loop', 'userSetup', 'userLoop', 'imu', 'PID', 'millis', 'micros', 'delay', 'dt', 'read', 'encoder',
  'motor', 'servo', 'print', 'plot', 'param', 'constrain', 'constrainf', 'map', 'mapf', 'abs', 'fabs', 'min', 'max',
  'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'PI', 'round', 'floor', 'ceil', 'fmod', 'log', 'exp', 'random',
];

export interface ArduinoOptions {
  /** Thiết kế xe: lấy loại linh kiện, chân cắm, vi điều khiển. */
  design?: VehicleDesign | null;
  /** Hoặc danh sách linh kiện rời. */
  parts?: ArduinoPart[];
}

export class ArduinoGenerator extends JavascriptGenerator {
  private setupBody = '';
  private loopBody = '';
  private pidVarIds = new Set<string>();
  private used: SketchInput['used'] = emptyUsed();
  options: ArduinoOptions = {};

  constructor() {
    super('Arduino');
    setupBlockly();
    Object.assign(this.forBlock, javascriptGenerator.forBlock);
    this.addReservedWords(CPP_RESERVED.join(','));
    this.registerOverrides();
  }

  override quote_(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }

  override init(ws: Blockly.Workspace): void {
    super.init(ws);
    this.setupBody = '';
    this.loopBody = '';
    this.used = emptyUsed();
    this.pidVarIds = new Set();
    for (const b of ws.getAllBlocks(false)) {
      const part = b.getField('PART') ? String(b.getFieldValue('PART') ?? '') : '';
      if (b.type === 'probike_motor' && part) this.used.motors.add(part);
      if (b.type === 'probike_servo' && part) this.used.servos.add(part);
      if (b.type === 'probike_read' && part) this.used.sensors.add(part);
      if (b.type === 'probike_encoder' && part) this.used.encoders.add(part);
      if (b.type === 'probike_imu') this.used.usesImu = true;
      if (b.type === 'probike_plot') this.used.usesPlot = true;
      if (b.type === 'probike_pid_create' || b.type === 'probike_pid_update' || b.type === 'probike_pid_reset') {
        this.used.usesPid = true;
        const id = b.getFieldValue('VAR');
        if (id) this.pidVarIds.add(id);
      }
    }
    // Biến được gán khối chữ → String (float x = "…" không biên dịch được)
    const stringVarIds = new Set<string>();
    for (const b of ws.getAllBlocks(false)) {
      if (b.type !== 'variables_set') continue;
      const target = b.getInputTargetBlock('VALUE');
      if (target && (target.type === 'text' || target.outputConnection?.getCheck()?.includes('String'))) {
        stringVarIds.add(b.getFieldValue('VAR'));
      }
    }
    // Khai báo biến theo kiểu C++: PID cho biến bộ PID, String cho biến chữ, còn lại float
    const decls: string[] = [];
    for (const v of Blockly.Variables.allUsedVarModels(ws)) {
      const id = v.getId();
      const name = this.getVariableName(id);
      decls.push(this.pidVarIds.has(id) ? `PID ${name};` : stringVarIds.has(id) ? `String ${name} = "";` : `float ${name} = 0;`);
    }
    if (decls.length) this.definitions_['variables'] = decls.join('\n');
    else delete this.definitions_['variables'];
  }

  override finish(code: string): string {
    const defs = { ...this.definitions_ };
    const varDecls = defs['variables'] ? defs['variables'].split('\n') : [];
    delete defs['variables'];
    const design = this.options.design;
    const parts: ArduinoPart[] = this.options.parts
      ?? design?.parts.map((p) => ({ name: p.name, itemId: p.itemId, pin: p.pin }))
      ?? [];
    const ctrl = design?.parts.map((p) => CATALOG_BY_ID[p.itemId]).find((c) => c?.controller);
    const sketch = buildSketch({
      varDecls,
      userDefinitions: Object.values(defs),
      setupBody: this.setupBody,
      loopBody: this.loopBody,
      ignoredCode: code,
      used: this.used,
      parts,
      loopHz: ctrl?.controller?.loopHz ?? 100,
      controllerName: ctrl?.name ?? 'Arduino Nano / Uno',
    });
    super.finish('');
    return sketch;
  }

  /** Cho phép đặt định nghĩa từ hàm generator (definitions_ là protected). */
  addDefinition(key: string, code: string): void {
    this.definitions_[key] = code;
  }

  private registerOverrides(): void {
    const f = this.forBlock;
    const val = (b: Blockly.Block, name: string, order: number, fallback = '0') => this.valueToCode(b, name, order) || fallback;

    // ----- khung chương trình
    f['probike_setup'] = (b) => { this.setupBody += this.statementToCode(b, 'DO'); return ''; };
    f['probike_loop'] = (b) => { this.loopBody += this.statementToCode(b, 'DO'); return ''; };

    // ----- khối ProBike khác bản JS
    f['probike_pid_create'] = (b) =>
      `${this.getVariableName(b.getFieldValue('VAR'))} = PID(${val(b, 'KP', Order.COMMA)}, ${val(b, 'KI', Order.COMMA)}, ${val(b, 'KD', Order.COMMA)});\n`;
    f['probike_constrain'] = (b) =>
      [`constrainf(${val(b, 'VALUE', Order.COMMA)}, ${val(b, 'LOW', Order.COMMA)}, ${val(b, 'HIGH', Order.COMMA)})`, Order.FUNCTION_CALL];
    f['probike_map'] = (b) =>
      [`mapf(${['VALUE', 'FROM_LOW', 'FROM_HIGH', 'TO_LOW', 'TO_HIGH'].map((n) => val(b, n, Order.COMMA)).join(', ')})`, Order.FUNCTION_CALL];
    f['probike_param'] = (b) =>
      [`param(${this.quote_(String(b.getFieldValue('NAME')))}, ${Number(b.getFieldValue('DEFAULT')) || 0})`, Order.FUNCTION_CALL];

    // ----- logic
    f['logic_compare'] = (b) => {
      const ops: Record<string, string> = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
      const op = ops[b.getFieldValue('OP')] ?? '==';
      const order = op === '==' || op === '!=' ? Order.EQUALITY : Order.RELATIONAL;
      return [`${val(b, 'A', order)} ${op} ${val(b, 'B', order)}`, order];
    };
    f['logic_null'] = () => ['0', Order.ATOMIC];

    // ----- vòng lặp
    f['controls_repeat_ext'] = (b) => {
      const times = b.getField('TIMES') ? String(Number(b.getFieldValue('TIMES'))) : val(b, 'TIMES', Order.RELATIONAL);
      const i = this.nameDB_!.getDistinctName('lan', Blockly.Names.NameType.VARIABLE);
      return `for (int ${i} = 0; ${i} < ${times}; ${i}++) {\n${this.statementToCode(b, 'DO')}}\n`;
    };
    f['controls_repeat'] = f['controls_repeat_ext'];
    f['controls_for'] = (b) => {
      const v = this.getVariableName(b.getFieldValue('VAR'));
      const from = val(b, 'FROM', Order.ASSIGNMENT);
      const to = val(b, 'TO', Order.ASSIGNMENT);
      const by = val(b, 'BY', Order.ASSIGNMENT, '1');
      const body = this.statementToCode(b, 'DO');
      const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s);
      if (isNum(from) && isNum(to) && isNum(by)) {
        const up = Number(from) <= Number(to);
        const step = Math.abs(Number(by)) || 1;
        return `for (${v} = ${from}; ${v} ${up ? '<=' : '>='} ${to}; ${v} ${up ? '+=' : '-='} ${step}) {\n${body}}\n`;
      }
      return `for (${v} = ${from}; (${from}) <= (${to}) ? ${v} <= (${to}) : ${v} >= (${to}); ${v} += (${from}) <= (${to}) ? fabs(${by}) : -fabs(${by})) {\n${body}}\n`;
    };

    // ----- toán
    f['math_arithmetic'] = (b) => {
      const op = b.getFieldValue('OP');
      if (op === 'POWER') return [`pow(${val(b, 'A', Order.COMMA)}, ${val(b, 'B', Order.COMMA)})`, Order.FUNCTION_CALL];
      const table: Record<string, [string, number]> = {
        ADD: [' + ', Order.ADDITION], MINUS: [' - ', Order.SUBTRACTION],
        MULTIPLY: [' * ', Order.MULTIPLICATION], DIVIDE: [' / ', Order.DIVISION],
      };
      const [sym, order] = table[op] ?? table.ADD;
      if (op === 'DIVIDE') return [`${val(b, 'A', order)} / (float)(${val(b, 'B', Order.NONE)})`, order]; // tránh chia nguyên
      return [`${val(b, 'A', order)}${sym}${val(b, 'B', order)}`, order];
    };
    f['math_single'] = (b) => {
      const op = b.getFieldValue('OP');
      if (op === 'NEG') return [`-${val(b, 'NUM', Order.UNARY_NEGATION)}`, Order.UNARY_NEGATION];
      const x = val(b, 'NUM', Order.NONE);
      const map: Record<string, string> = {
        ROOT: `sqrt(${x})`, ABS: `fabs(${x})`, LN: `log(${x})`, LOG10: `log10(${x})`, EXP: `exp(${x})`, POW10: `pow(10, ${x})`,
      };
      return [map[op] ?? x, Order.FUNCTION_CALL];
    };
    f['math_trig'] = (b) => {
      const op = b.getFieldValue('OP');
      const x = val(b, 'NUM', Order.NONE);
      if (op === 'SIN' || op === 'COS' || op === 'TAN') return [`${op.toLowerCase()}((${x}) * DEG_TO_RAD)`, Order.FUNCTION_CALL];
      return [`${op.toLowerCase()}(${x}) * RAD_TO_DEG`, Order.MULTIPLICATION];
    };
    f['math_constant'] = (b) => {
      const map: Record<string, [string, number]> = {
        PI: ['PI', Order.ATOMIC], E: ['M_E', Order.ATOMIC], GOLDEN_RATIO: ['((1 + sqrt(5)) / 2)', Order.ATOMIC],
        SQRT2: ['M_SQRT2', Order.ATOMIC], SQRT1_2: ['M_SQRT1_2', Order.ATOMIC], INFINITY: ['INFINITY', Order.ATOMIC],
      };
      return map[b.getFieldValue('CONSTANT')] ?? ['0', Order.ATOMIC];
    };
    f['math_round'] = (b) => {
      const fn = ({ ROUND: 'round', ROUNDUP: 'ceil', ROUNDDOWN: 'floor' } as Record<string, string>)[b.getFieldValue('OP')] ?? 'round';
      return [`${fn}(${val(b, 'NUM', Order.NONE)})`, Order.FUNCTION_CALL];
    };
    f['math_modulo'] = (b) => [`fmod(${val(b, 'DIVIDEND', Order.COMMA)}, ${val(b, 'DIVISOR', Order.COMMA, '1')})`, Order.FUNCTION_CALL];
    f['math_change'] = (b) =>
      `${this.getVariableName(b.getFieldValue('VAR'))} += ${val(b, 'DELTA', Order.ADDITION)};\n`;

    // ----- hàm tự tạo
    const procedure = (b: Blockly.Block, hasReturn: boolean) => {
      const name = this.getProcedureName(b.getFieldValue('NAME'));
      const models = (b as unknown as { getVarModels?(): Blockly.IVariableModel<Blockly.IVariableState>[] }).getVarModels?.() ?? [];
      const args = models.map((m) => `float ${this.getVariableName(m.getId())}`);
      const branch = this.statementToCode(b, 'STACK');
      const ret = hasReturn ? this.valueToCode(b, 'RETURN', Order.NONE) : '';
      const code = `${hasReturn ? 'float' : 'void'} ${name}(${args.join(', ')}) {\n${branch}${ret ? `${this.INDENT}return ${ret};\n` : ''}}`;
      this.addDefinition(`%${name}`, code);
      return null;
    };
    f['procedures_defnoreturn'] = (b) => procedure(b, false);
    f['procedures_defreturn'] = (b) => procedure(b, true);
  }
}

function emptyUsed(): SketchInput['used'] {
  return {
    motors: new Set(), servos: new Set(), sensors: new Set(), encoders: new Set(),
    usesImu: false, usesPlot: false, usesPid: false,
  };
}

let shared: ArduinoGenerator | null = null;

/** Sinh sketch Arduino C++ từ JSON workspace Blockly. */
export function blocksJsonToArduino(json: object | null | undefined, options: ArduinoOptions = {}): string {
  setupBlockly();
  shared ??= new ArduinoGenerator();
  shared.options = options;
  const ws = new Blockly.Workspace();
  try {
    if (json) Blockly.serialization.workspaces.load(json, ws, { recordUndo: false });
    return shared.workspaceToCode(ws);
  } finally {
    ws.dispose();
  }
}
