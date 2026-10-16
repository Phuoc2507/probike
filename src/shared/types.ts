// Hợp đồng dùng chung giữa Lắp ráp, Mô phỏng, Lập trình, Cộng tác.
// Đổi file này phải ghi vào PLAN.md mục 10.
//
// Hệ toạ độ: mét, hệ TAY PHẢI (giống Rapier, three.js): x tiến về trước, y hướng lên, z sang PHẢI.
// Góc theo quy tắc tay phải: roll (quanh x) dương = nghiêng sang PHẢI (đầu y quay về +z);
// yaw (quanh y) dương = rẽ TRÁI (mũi x quay về −z).
// Gốc toạ độ của xe = trung điểm hai điểm tiếp đất của hai bánh khi xe đứng thẳng.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

// ---------------------------------------------------------------- Kho linh kiện

export type PartCategory =
  | 'wheel'      // bánh xe BTC phát
  | 'controller' // vi điều khiển
  | 'sensor'
  | 'motor'      // động cơ kéo, động cơ bánh đà, servo
  | 'flywheel'   // đĩa bánh đà gắn lên trục động cơ
  | 'driver'     // mạch công suất
  | 'power'      // pin, mạch hạ áp
  | 'structure'; // vật liệu khung, giá đỡ

export type SensorKind =
  | 'imu'          // MPU6050: roll/pitch/yaw, gyro, accel
  | 'encoder'      // vòng/giây của trục gắn
  | 'ultrasonic'   // HC-SR04, chùm nón
  | 'tof_laser'    // VL53L0X / VL53L1X, tia hẹp
  | 'ir_distance'  // Sharp GP2Y0A..., đường cong analog phi tuyến
  | 'ir_reflect'   // TCRT5000, phản xạ nền: 0/1
  | 'lidar_360';   // quét 360°, trả mảng khoảng cách

export interface SensorSpec {
  kind: SensorKind;
  rateHz: number;      // tần số cập nhật
  minRange?: number;   // m
  maxRange?: number;   // m
  fovDeg?: number;     // độ mở chùm (siêu âm) hoặc 0 cho tia hẹp
  noiseStd: number;    // độ lệch chuẩn nhiễu, cùng đơn vị với giá trị đọc
  latencyMs: number;
  samples?: number;    // lidar_360: số tia mỗi vòng
}

export type MotorKind = 'drive' | 'reaction' | 'servo';

export interface MotorSpec {
  kind: MotorKind;
  stallTorqueNm: number;  // mô-men kẹt (servo: mô-men giữ)
  noLoadRpm: number;      // servo: tốc độ quay độ/giây quy đổi
  rangeDeg?: number;      // servo: biên độ góc ±
}

export interface CatalogItem {
  id: string;            // ví dụ 'mpu6050', 'wheel_btc'
  name: string;          // tên hiển thị tiếng Việt
  category: PartCategory;
  priceVnd: number;      // giá tham khảo thị trường
  massKg: number;
  size: Vec3;            // hộp bao, m (dài x, cao y, rộng z)
  providedByBtc?: boolean; // BTC phát, không tính chi phí, không chỉnh được
  sensor?: SensorSpec;
  motor?: MotorSpec;
  controller?: { loopHz: number; pins: number };
  flywheel?: { radius: number; inertiaKgM2: number };
  wheel?: { radius: number; width: number; friction: number };
  battery?: { voltage: number; capacityMah: number };
  description: string;
}

// ---------------------------------------------------------------- Thiết kế xe

export interface PlacedPart {
  uid: string;           // id duy nhất trong thiết kế
  itemId: string;        // CatalogItem.id
  name: string;          // tên do thí sinh đặt, dùng trong code: read("laserTruoc")
  position: Vec3;        // trong hệ toạ độ xe
  rotationDeg: Vec3;     // Euler XYZ, độ
  attachTo?: string;     // uid linh kiện cha (vd: đĩa bánh đà gắn vào động cơ bánh đà)
  pin?: string;          // chân cắm trên vi điều khiển
}

export interface VehicleFrame {
  wheelbase: number;     // khoảng cách 2 trục bánh, m
  height: number;        // chiều cao khung so với trục bánh, m
  material: 'mica' | 'pla' | 'aluminum' | 'carton';
  massKg: number;        // khối lượng khung (tự tính theo vật liệu & kích thước)
  steerable: boolean;    // bánh trước có servo lái
}

export interface VehicleDesign {
  version: 1;
  name: string;
  frame: VehicleFrame;
  parts: PlacedPart[];   // gồm cả 2 bánh xe (itemId 'wheel_btc')
}

export interface DesignCheck {
  ok: boolean;
  errors: string[];      // vi phạm luật → không được thi
  warnings: string[];    // ví dụ vượt ngân sách
  totalMassKg: number;
  centerOfMass: Vec3;
  totalCostVnd: number;
}

// ---------------------------------------------------------------- Mô phỏng

export type MapId = 'balance_flat' | 'straight' | 'u_turn' | 'seesaw' | 'rocks' | 'full_course';
export type Realism = 'low' | 'medium' | 'high';

export interface SimConfig {
  design: VehicleDesign;
  mapId: MapId;
  seed: number;
  realism: Realism;
  maxTimeS: number;
  disturbances: boolean; // đẩy ngẫu nhiên (dùng ở balance_flat)
}

export type SensorValue = number | number[];

export interface SensorFrame {
  t: number;                                // giây mô phỏng
  values: Record<string, SensorValue>;      // theo PlacedPart.name
  imu: {
    roll: number; pitch: number; yaw: number;   // độ
    gyro: Vec3;                                 // độ/giây quanh x, y, z
    acc: Vec3;                                  // m/s²
  } | null;                                     // null nếu xe không có IMU
}

// motor: -1..1, servo: độ. Khoá = PlacedPart.name
export type ActuatorCommand = Record<string, number>;

export interface BodyPose { id: string; position: Vec3; quaternion: Quat }

export interface SimSnapshot {
  t: number;
  bike: BodyPose;
  parts: BodyPose[];        // bánh xe, bánh đà... (để vẽ quay)
  dynamic: BodyPose[];      // vật thể động của map: cầu bập bênh...
  rollDeg: number;
  speed: number;            // m/s
  checkpoints: string[];    // checkpoint đã qua
}

export type RunEndReason = 'completed' | 'fell' | 'timeout' | 'out_of_bounds' | 'code_error' | 'stopped';

export interface RunResult {
  mapId: MapId;
  reason: RunEndReason;
  timeS: number;
  checkpoints: string[];
  maxRollDeg: number;
  balancedS: number;        // thời gian giữ thăng bằng liên tục dài nhất
  score: number;
  errorMessage?: string;
}

export interface SimEngine {
  init(config: SimConfig): Promise<void>;
  /** Chu kỳ điều khiển hiện tại, giây (theo vi điều khiển trong thiết kế). */
  readonly controlPeriod: number;
  /** Áp lệnh rồi chạy vật lý thêm đúng một chu kỳ điều khiển. */
  step(cmd: ActuatorCommand): void;
  sensors(): SensorFrame;
  snapshot(): SimSnapshot;
  /** Tác động ngoài (người dùng bấm "đẩy"), N·s theo trục z. */
  push(impulse: number): void;
  result(): RunResult | null; // null khi chưa kết thúc
  dispose(): void;
}

// ---------------------------------------------------------------- Chạy code

export interface ControllerLog { t: number; level: 'log' | 'error'; text: string }
export interface PlotPoint { t: number; label: string; value: number }

export interface ControllerRuntime {
  load(source: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Một lần gọi loop(); trả lệnh cơ cấu chấp hành. Ném lỗi nếu code lỗi/quá thời gian. */
  tick(frame: SensorFrame): Promise<ActuatorCommand>;
  drainLogs(): ControllerLog[];
  drainPlots(): PlotPoint[];
  dispose(): void;
}

// ---------------------------------------------------------------- Đội & tiến độ

export type Stage = 1 | 2 | 3; // 1 lắp ráp, 2 cân bằng, 3 sa hình

export interface Team {
  id: string;
  name: string;
  school: string;
  leaderId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string | null;
  fullName: string;
  email: string;
  phone: string;
  roleInTeam: string;
}
