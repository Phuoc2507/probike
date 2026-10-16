// Code mẫu và hệ số mặc định của trang mô phỏng — đã chỉnh theo xe mô phỏng (src/sim), khác điểm xuất phát
// trong src/code/samples (Kp = 20 quá gắt với xe mô phỏng: bánh đà bão hoà sau vài giây).
import type { MapId } from '@/shared/types';
import { SAMPLE_GAINS } from '@/sim';
import type { TutorialSlider } from '@/code';

/** Tham số do thanh trượt điều khiển; code đọc bằng param("Kp", ...). */
export const SIM_PARAMS: TutorialSlider[] = [
  { name: 'Kp', label: 'Kp — tỉ lệ', min: 0, max: 1.5, step: 0.01, default: SAMPLE_GAINS.kp },
  { name: 'Ki', label: 'Ki — tích phân', min: 0, max: 0.5, step: 0.005, default: SAMPLE_GAINS.ki },
  { name: 'Kd', label: 'Kd — vi phân', min: 0, max: 0.15, step: 0.001, default: SAMPLE_GAINS.kd },
  { name: 'Kw', label: 'Kw — xả tốc độ bánh đà', min: 0, max: 0.2, step: 0.005, default: SAMPLE_GAINS.kw },
];

/** Tham số tốc độ động cơ kéo — giai đoạn Cân bằng luôn đặt 0, Sa hình mặc định 0,5. */
export const SPEED_PARAM: TutorialSlider = { name: 'tocDo', label: 'Tốc độ động cơ kéo', min: 0, max: 1, step: 0.05, default: 0.5 };

export const DEFAULT_PARAMS: Record<string, number> = {
  ...Object.fromEntries(SIM_PARAMS.map((s) => [s.name, s.default])),
  [SPEED_PARAM.name]: SPEED_PARAM.default,
};

export interface SampleNames {
  flywheel: string;
  encoder: string | null;
  drive: string | null;
}

/**
 * Code PID mẫu theo API thí sinh. D lấy trực tiếp từ con quay (ít nhiễu hơn đạo hàm góc);
 * Kw kéo tốc độ bánh đà về 0 để bánh đà không bão hoà khi giữ thăng bằng lâu.
 */
export function samplePidCode(n: SampleNames = { flywheel: 'banhDa', encoder: 'encBanhDa', drive: 'dongCoSau' }): string {
  const enc = n.encoder
    ? `  const w = encoder(${JSON.stringify(n.encoder)});    // tốc độ bánh đà, vòng/giây\n`
    : `  const w = 0;                           // chưa lắp encoder bánh đà\n`;
  const drive = n.drive
    ? `\n  // Động cơ kéo: tốc độ lấy từ thanh trượt (giai đoạn Cân bằng luôn là 0)\n  motor(${JSON.stringify(n.drive)}, Math.abs(goc) < 30 ? param("tocDo", 0) : 0);\n`
    : '';
  return `// Giữ thăng bằng bằng bánh đà: PID theo góc nghiêng + xả tốc độ bánh đà
// Hệ số lấy từ thanh trượt Kp / Ki / Kd / Kw — kéo là thấy tác dụng ngay
let tichPhan = 0;

function setup() {
  print("Xe khởi động");
}

function loop() {
  const goc = imu.roll();                // độ, nghiêng phải là dương
  const tocDoNghieng = imu.gyroX();      // độ/giây
${enc}
  const e = 0 - goc;                     // sai số: muốn đứng thẳng (0°)
  tichPhan = constrain(tichPhan + e * dt(), -20, 20);
  const u = param("Kp", ${SAMPLE_GAINS.kp}) * e
          + param("Ki", ${SAMPLE_GAINS.ki}) * tichPhan
          - param("Kd", ${SAMPLE_GAINS.kd}) * tocDoNghieng
          + param("Kw", ${SAMPLE_GAINS.kw}) * w;
  motor(${JSON.stringify(n.flywheel)}, constrain(u, -1, 1));
${drive}
  plot("goc", goc);
}
`;
}

// ------------------------------------------------------------ Mẫu dạng khối (Blockly JSON)

type B = Record<string, unknown>;
const numShadow = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const blk = (block: B) => ({ ...numShadow(0), block });
const param = (name: string, def: number): B => ({ type: 'probike_param', fields: { NAME: name, DEFAULT: def } });
const arith = (op: 'ADD' | 'MINUS' | 'MULTIPLY', a: B, b: B): B => ({
  type: 'math_arithmetic', fields: { OP: op }, inputs: { A: blk(a), B: blk(b) },
});
const getVar = (id: string): B => ({ type: 'variables_get', fields: { VAR: { id } } });
const num = (v: number): B => ({ type: 'math_number', fields: { NUM: v } });

function chain(blocks: B[]): B | undefined {
  let next: B | undefined;
  for (let i = blocks.length - 1; i >= 0; i--) next = next ? { ...blocks[i], next: { block: next } } : blocks[i];
  return next;
}

/** Cùng thuật toán với samplePidCode (bỏ thành phần I cho gọn): u = Kp·(0 − góc) − Kd·gyroX + Kw·tốcĐộBánhĐà. */
export function samplePidBlocks(n: SampleNames = { flywheel: 'banhDa', encoder: 'encBanhDa', drive: 'dongCoSau' }): object {
  const G = SAMPLE_GAINS;
  let u = arith(
    'MINUS',
    arith('MULTIPLY', param('Kp', G.kp), arith('MINUS', num(0), getVar('v_goc'))),
    arith('MULTIPLY', param('Kd', G.kd), { type: 'probike_imu', fields: { AXIS: 'gyroX' } }),
  );
  if (n.encoder) {
    u = arith('ADD', u, arith('MULTIPLY', param('Kw', G.kw), { type: 'probike_encoder', fields: { PART: n.encoder } }));
  }
  const loop = chain([
    { type: 'variables_set', fields: { VAR: { id: 'v_goc' } }, inputs: { VALUE: { block: { type: 'probike_imu', fields: { AXIS: 'roll' } } } } },
    { type: 'variables_set', fields: { VAR: { id: 'v_u' } }, inputs: { VALUE: { block: u } } },
    { type: 'probike_motor', fields: { PART: n.flywheel }, inputs: { VALUE: blk(getVar('v_u')) } },
    ...(n.drive ? [{ type: 'probike_motor', fields: { PART: n.drive }, inputs: { VALUE: blk(param('tocDo', 0)) } }] : []),
    { type: 'probike_plot', fields: { LABEL: 'goc' }, inputs: { VALUE: blk(getVar('v_goc')) } },
  ]);
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'probike_setup', x: 20, y: 20,
          inputs: { DO: { block: { type: 'probike_print', inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'Xe khởi động' } } } } } } },
        },
        { type: 'probike_loop', x: 20, y: 160, inputs: { DO: { block: loop } } },
      ],
    },
    variables: [
      { name: 'goc', id: 'v_goc' },
      { name: 'u', id: 'v_u' },
    ],
  };
}

/** Thời gian tối đa mỗi lượt theo map (giây). */
export const MAX_TIME_S: Record<MapId, number> = {
  balance_flat: 40,
  straight: 15,
  u_turn: 20,
  seesaw: 20,
  rocks: 20,
  full_course: 45,
};

/** Giữ thăng bằng bao lâu trên balance_flat thì mở khoá Sa hình. */
export const UNLOCK_BALANCE_S = 30;
