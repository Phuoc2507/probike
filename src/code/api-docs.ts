// Danh sách API cho thí sinh (PLAN.md mục 7) — dùng cho gợi ý trong CodeEditor, từ khoá dành riêng của Blockly
// và trang hướng dẫn. Mỗi mục: tên, cách gọi, mô tả tiếng Việt.

export interface ApiDoc {
  name: string;
  signature: string;
  detail: string;
  kind: 'function' | 'class' | 'constant' | 'method' | 'variable';
}

export const API_DOCS: ApiDoc[] = [
  { name: 'setup', signature: 'function setup() { }', detail: 'Chạy một lần khi xe khởi động', kind: 'function' },
  { name: 'loop', signature: 'function loop() { }', detail: 'Chạy lặp lại mỗi chu kỳ điều khiển', kind: 'function' },
  { name: 'millis', signature: 'millis()', detail: 'Số mili giây từ lúc bắt đầu chạy', kind: 'function' },
  { name: 'dt', signature: 'dt()', detail: 'Số giây kể từ lần loop() trước', kind: 'function' },
  { name: 'read', signature: 'read("ten")', detail: 'Đọc cảm biến: cm (laser/siêu âm/IR) hoặc 0/1 (IR phản xạ)', kind: 'function' },
  { name: 'encoder', signature: 'encoder("ten")', detail: 'Tốc độ quay của encoder, vòng/giây', kind: 'function' },
  { name: 'motor', signature: 'motor("ten", v)', detail: 'Chạy động cơ, v từ -1 đến 1', kind: 'function' },
  { name: 'servo', signature: 'servo("ten", doGoc)', detail: 'Quay servo tới góc (độ, 0 = giữa)', kind: 'function' },
  { name: 'print', signature: 'print(...giaTri)', detail: 'In ra bảng log', kind: 'function' },
  { name: 'plot', signature: 'plot("nhan", giaTri)', detail: 'Vẽ giá trị lên biểu đồ theo thời gian', kind: 'function' },
  { name: 'param', signature: 'param("Kp", macDinh)', detail: 'Đọc tham số từ thanh trượt (không có thì dùng mặc định)', kind: 'function' },
  { name: 'constrain', signature: 'constrain(x, min, max)', detail: 'Giới hạn x trong khoảng [min, max]', kind: 'function' },
  { name: 'map', signature: 'map(x, tuMin, tuMax, sangMin, sangMax)', detail: 'Đổi thang đo tuyến tính', kind: 'function' },
  { name: 'PID', signature: 'new PID(kp, ki, kd)', detail: 'Bộ điều khiển PID: .update(saiSo, dt), .reset(), .setLimits(min, max)', kind: 'class' },
  { name: 'imu', signature: 'imu.roll()', detail: 'Cảm biến IMU: roll/pitch/yaw (độ), gyroX/Y/Z (độ/s), accX/Y/Z (m/s²)', kind: 'variable' },
  { name: 'abs', signature: 'abs(x)', detail: 'Giá trị tuyệt đối', kind: 'function' },
  { name: 'min', signature: 'min(a, b)', detail: 'Số nhỏ hơn', kind: 'function' },
  { name: 'max', signature: 'max(a, b)', detail: 'Số lớn hơn', kind: 'function' },
  { name: 'sqrt', signature: 'sqrt(x)', detail: 'Căn bậc hai', kind: 'function' },
  { name: 'pow', signature: 'pow(a, b)', detail: 'a mũ b', kind: 'function' },
  { name: 'sin', signature: 'sin(rad)', detail: 'sin (radian)', kind: 'function' },
  { name: 'cos', signature: 'cos(rad)', detail: 'cos (radian)', kind: 'function' },
  { name: 'tan', signature: 'tan(rad)', detail: 'tan (radian)', kind: 'function' },
  { name: 'atan2', signature: 'atan2(y, x)', detail: 'Góc (radian) của vectơ (x, y)', kind: 'function' },
  { name: 'PI', signature: 'PI', detail: '3,14159…', kind: 'constant' },
];

export const IMU_METHODS: ApiDoc[] = [
  { name: 'roll', signature: 'imu.roll()', detail: 'Góc nghiêng ngang, độ — nghiêng trái là dương', kind: 'method' },
  { name: 'pitch', signature: 'imu.pitch()', detail: 'Góc chúc lên/xuống, độ', kind: 'method' },
  { name: 'yaw', signature: 'imu.yaw()', detail: 'Góc hướng (quay đầu), độ', kind: 'method' },
  { name: 'gyroX', signature: 'imu.gyroX()', detail: 'Tốc độ quay quanh trục X (trục dọc xe), độ/giây', kind: 'method' },
  { name: 'gyroY', signature: 'imu.gyroY()', detail: 'Tốc độ quay quanh trục Y (thẳng đứng), độ/giây', kind: 'method' },
  { name: 'gyroZ', signature: 'imu.gyroZ()', detail: 'Tốc độ quay quanh trục Z (ngang), độ/giây', kind: 'method' },
  { name: 'accX', signature: 'imu.accX()', detail: 'Gia tốc theo trục X, m/s²', kind: 'method' },
  { name: 'accY', signature: 'imu.accY()', detail: 'Gia tốc theo trục Y, m/s²', kind: 'method' },
  { name: 'accZ', signature: 'imu.accZ()', detail: 'Gia tốc theo trục Z, m/s²', kind: 'method' },
];

export const PID_METHODS: ApiDoc[] = [
  { name: 'update', signature: 'pid.update(saiSo, dt)', detail: 'Tính đầu ra điều khiển', kind: 'method' },
  { name: 'reset', signature: 'pid.reset()', detail: 'Xoá tích phân và sai số cũ', kind: 'method' },
  { name: 'setLimits', signature: 'pid.setLimits(min, max)', detail: 'Giới hạn đầu ra (chống bão hoà tích phân)', kind: 'method' },
  { name: 'setTunings', signature: 'pid.setTunings(kp, ki, kd)', detail: 'Đổi hệ số khi đang chạy', kind: 'method' },
];

/** Hàm nhận tên linh kiện làm tham số đầu tiên. */
export const PART_NAME_FUNCTIONS = ['read', 'encoder', 'motor', 'servo'] as const;

export const API_NAMES = API_DOCS.map((d) => d.name);
