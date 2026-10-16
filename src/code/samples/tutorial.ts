// Bài hướng dẫn cân bằng từng bước: đọc góc → P → PD → PID → (nâng cao) bù tốc độ bánh đà.
// Dạng dữ liệu để trang mô phỏng (giai đoạn 2) hiển thị: mỗi bước có lời giải thích, code mẫu, thanh trượt gợi ý,
// tiêu chí hoàn thành. Hệ số chỉ là điểm xuất phát — cần tinh chỉnh theo xe mô phỏng.

import { DEFAULT_FLYWHEEL_NAME } from './samples';

export interface TutorialSlider {
  name: string;   // trùng tên trong param("…")
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface TutorialStep {
  id: 'read_angle' | 'p' | 'pd' | 'pid' | 'wheel_speed';
  title: string;
  /** Mục tiêu ngắn của bước. */
  goal: string;
  /** Các đoạn giải thích (mỗi phần tử một đoạn). */
  body: string[];
  /** Công thức hiển thị (dạng chữ thường). */
  formula?: string;
  code: string;
  sliders: TutorialSlider[];
  /** Nhãn plot nên xem trên biểu đồ. */
  plots: string[];
  /** Gợi ý khi gặp khó. */
  hints: string[];
  /** Tiêu chí hoàn thành (để trang mô phỏng tự kiểm tra). */
  check?: { type: 'balance_seconds'; seconds: number; disturbances: boolean };
}

const KP: TutorialSlider = { name: 'Kp', label: 'Kp — tỉ lệ', min: 0, max: 60, step: 0.5, default: 20 };
const KD: TutorialSlider = { name: 'Kd', label: 'Kd — vi phân', min: 0, max: 5, step: 0.05, default: 1.5 };
const KI: TutorialSlider = { name: 'Ki', label: 'Ki — tích phân', min: 0, max: 20, step: 0.1, default: 0 };

export function pidTutorial(motorName = DEFAULT_FLYWHEEL_NAME): TutorialStep[] {
  const m = JSON.stringify(motorName);
  return [
    {
      id: 'read_angle',
      title: 'Bước 1 — Đọc góc nghiêng',
      goal: 'Hiểu xe đang nghiêng bao nhiêu độ và nghiêng nhanh thế nào.',
      body: [
        'Cảm biến IMU (MPU6050) cho biết góc nghiêng ngang của xe: imu.roll(), đơn vị độ. Xe đứng thẳng là 0°, nghiêng PHẢI là số dương, nghiêng trái là số âm.',
        'imu.gyroX() cho biết tốc độ nghiêng, đơn vị độ/giây. Đây là "đạo hàm" của góc: xe đổ càng nhanh thì số này càng lớn.',
        'Chạy code dưới đây, bấm "Đẩy" và xem hai đường trên biểu đồ. Chưa có điều khiển nên xe sẽ đổ.',
      ],
      code: `function loop() {
  const goc = imu.roll();        // độ
  const tocDo = imu.gyroX();     // độ/giây
  plot("goc", goc);
  plot("tocDoNghieng", tocDo);
}
`,
      sliders: [],
      plots: ['goc', 'tocDoNghieng'],
      hints: ['Nếu báo "Xe chưa lắp IMU", quay lại bước Lắp ráp và gắn MPU6050 lên khung.'],
    },
    {
      id: 'p',
      title: 'Bước 2 — Điều khiển tỉ lệ (P)',
      goal: 'Quay bánh đà ngược chiều đổ, mạnh tỉ lệ với góc nghiêng.',
      formula: 'u = Kp × e,  với e = 0 − góc',
      body: [
        'Sai số e là khoảng cách giữa điều mình muốn (đứng thẳng, 0°) và thực tế (góc hiện tại). Khi tăng tốc bánh đà theo một chiều, thân xe bị đẩy theo chiều ngược lại — đó là cách bánh đà tạo mô-men chống đổ.',
        'Điều khiển P: lệnh động cơ u = Kp × e. Lệch càng nhiều, bánh đà quay càng mạnh. motor() tự giới hạn u trong khoảng −1..1.',
        'Thử tăng dần Kp. Kp nhỏ: xe vẫn đổ (lực chống yếu). Kp lớn: xe bật qua bật lại rồi dao động ngày càng mạnh — P thuần không "phanh" được chuyển động.',
        'Nếu xe đổ NHANH HƠN khi có điều khiển, bánh đà đang quay sai chiều: đổi dấu u (motor(..., -u)).',
      ],
      code: `function loop() {
  const goc = imu.roll();
  const e = 0 - goc;
  const u = param("Kp", 20) * e;
  motor(${m}, u);
  plot("goc", goc);
  plot("u", u);
}
`,
      sliders: [KP],
      plots: ['goc', 'u'],
      hints: [
        'Dao động là bình thường ở bước này — bước tiếp theo sẽ dập dao động.',
        'Tên động cơ trong motor("…") phải trùng tên đặt khi lắp ráp.',
      ],
    },
    {
      id: 'pd',
      title: 'Bước 3 — Thêm vi phân (PD) để dập dao động',
      goal: 'Giữ được thăng bằng trên sàn phẳng không có nhiễu.',
      formula: 'u = Kp × e + Kd × de/dt',
      body: [
        'Thành phần D nhìn vào tốc độ thay đổi của sai số. Khi xe đang quay về vị trí thẳng đứng rất nhanh, D sinh lực ngược lại như một cái phanh, giúp xe không vọt quá.',
        'Lớp PID có sẵn tự tính de/dt: pid.update(e, dt()). Đặt Ki = 0 để có bộ PD.',
        'Cách chỉnh: giữ Kp ở mức xe bắt đầu dao động, rồi tăng Kd cho tới khi dao động tắt nhanh. Kd quá lớn làm động cơ "rung" (nhiễu cảm biến bị khuếch đại).',
      ],
      code: `const pid = new PID(param("Kp", 20), 0, param("Kd", 1.5));

function loop() {
  pid.setTunings(param("Kp", 20), 0, param("Kd", 1.5));
  const goc = imu.roll();
  const u = pid.update(0 - goc, dt());
  motor(${m}, u);
  plot("goc", goc);
  plot("u", u);
}
`,
      sliders: [KP, KD],
      plots: ['goc', 'u'],
      hints: [
        'Có thể dùng trực tiếp con quay thay cho đạo hàm: u = Kp*e - Kd*imu.gyroX() — ít nhiễu hơn.',
        'Nếu u luôn chạm ±1 (đường u bị cắt phẳng), Kp đang quá lớn.',
      ],
      check: { type: 'balance_seconds', seconds: 10, disturbances: false },
    },
    {
      id: 'pid',
      title: 'Bước 4 — Thêm tích phân (PID) để hết lệch',
      goal: 'Giữ thăng bằng ≥ 30 giây trên sàn có đẩy ngẫu nhiên để mở khoá Sa hình.',
      formula: 'u = Kp × e + Ki × ∫e dt + Kd × de/dt',
      body: [
        'Nếu trọng tâm xe hơi lệch sang một bên, bộ PD sẽ giữ xe đứng nghiêng một góc nhỏ chứ không về đúng 0°. Thành phần I cộng dồn sai số theo thời gian và từ từ đẩy xe về đúng vị trí.',
        'Tăng Ki thật chậm, bắt đầu từ 0,1. Ki lớn làm xe dao động chậm, biên độ lớn.',
        'pid.setLimits(-1, 1) giúp phần tích phân không tích luỹ quá mức khi động cơ đã chạy hết công suất (chống bão hoà tích phân).',
      ],
      code: `const pid = new PID(param("Kp", 20), param("Ki", 0.5), param("Kd", 1.5));
pid.setLimits(-1, 1);

function setup() {
  print("Bắt đầu cân bằng");
}

function loop() {
  pid.setTunings(param("Kp", 20), param("Ki", 0.5), param("Kd", 1.5));
  const goc = imu.roll();
  const u = pid.update(0 - goc, dt());
  motor(${m}, u);
  plot("goc", goc);
  plot("u", u);
}
`,
      sliders: [KP, { ...KI, default: 0.5 }, KD],
      plots: ['goc', 'u'],
      hints: [
        'Khi xe đổ hẳn, gọi pid.reset() trước khi dựng lại để xoá phần tích phân cũ.',
        'Thi thật: vi điều khiển chậm hơn (Arduino Nano ~100 Hz) — thử chạy mô phỏng với vi điều khiển giống xe thật.',
      ],
      check: { type: 'balance_seconds', seconds: 30, disturbances: true },
    },
    {
      id: 'wheel_speed',
      title: 'Nâng cao — Bù tốc độ bánh đà',
      goal: 'Tránh bánh đà quay nhanh dần tới tốc độ tối đa (bão hoà) khi giữ thăng bằng lâu.',
      formula: 'u = PID(góc) − Kw × tốc độ bánh đà',
      body: [
        'Bánh đà chỉ tạo được mô-men khi TĂNG hoặc GIẢM tốc. Nếu nó đã quay gần tốc độ tối đa thì không thể tăng thêm → mất khả năng giữ thăng bằng.',
        'Gắn encoder lên động cơ bánh đà, rồi trừ một phần nhỏ tốc độ quay vào lệnh động cơ để bánh đà luôn được kéo dần về 0.',
      ],
      code: `const pid = new PID(param("Kp", 20), param("Ki", 0.5), param("Kd", 1.5));
pid.setLimits(-1, 1);

function loop() {
  const goc = imu.roll();
  const tocDoBanhDa = encoder("encBanhDa");   // vòng/giây — đổi theo tên encoder của bạn
  const u = pid.update(0 - goc, dt()) - param("Kw", 0.002) * tocDoBanhDa;
  motor(${m}, u);
  plot("goc", goc);
  plot("banhDa", tocDoBanhDa);
}
`,
      sliders: [KP, { ...KI, default: 0.5 }, KD, { name: 'Kw', label: 'Kw — bù tốc độ bánh đà', min: 0, max: 0.02, step: 0.0005, default: 0.002 }],
      plots: ['goc', 'banhDa'],
      hints: ['Dấu của Kw có thể phải đảo tuỳ chiều lắp encoder.'],
    },
  ];
}
