import type { CatalogItem } from './types';

// Kho linh kiện. Giá là giá tham khảo thị trường VN (đ), thông số gần đúng.
// Session "Lắp ráp" sở hữu file này và có thể bổ sung; KHÔNG đổi id đã có.

export const BUDGET_PER_TEAM_VND = 1_000_000;

export const CATALOG: CatalogItem[] = [
  // ------------------------------------------------------------ Bánh xe (BTC phát)
  {
    id: 'wheel_btc', name: 'Bánh xe BTC Ø68 mm', category: 'wheel', priceVnd: 0, massKg: 0.035,
    size: [0.068, 0.068, 0.026], providedByBtc: true,
    wheel: { radius: 0.034, width: 0.026, friction: 1.0 },
    description: 'Bánh cao su do ban tổ chức phát. Mỗi xe dùng đúng 2 bánh, không thay đổi kích thước.',
  },

  // ------------------------------------------------------------ Vi điều khiển
  {
    id: 'arduino_nano', name: 'Arduino Nano', category: 'controller', priceVnd: 90_000, massKg: 0.007,
    size: [0.045, 0.008, 0.018], controller: { loopHz: 100, pins: 22 },
    description: 'ATmega328P 16 MHz. Đủ cho PID cân bằng, vòng lặp ~100 Hz.',
  },
  {
    id: 'esp32', name: 'ESP32 DevKit', category: 'controller', priceVnd: 120_000, massKg: 0.01,
    size: [0.055, 0.01, 0.028], controller: { loopHz: 500, pins: 30 },
    description: '240 MHz 2 nhân, có WiFi/Bluetooth, vòng lặp nhanh ~500 Hz.',
  },
  {
    id: 'stm32_bluepill', name: 'STM32 Blue Pill', category: 'controller', priceVnd: 85_000, massKg: 0.008,
    size: [0.053, 0.008, 0.023], controller: { loopHz: 400, pins: 32 },
    description: 'STM32F103 72 MHz, nhanh và rẻ.',
  },

  // ------------------------------------------------------------ Cảm biến
  {
    id: 'mpu6050', name: 'IMU MPU6050', category: 'sensor', priceVnd: 35_000, massKg: 0.003,
    size: [0.021, 0.003, 0.016],
    sensor: { kind: 'imu', rateHz: 1000, noiseStd: 0.3, latencyMs: 1 },
    description: 'Gia tốc kế + con quay 6 trục. Cảm biến bắt buộc để biết góc nghiêng.',
  },
  {
    id: 'mpu9250', name: 'IMU MPU9250', category: 'sensor', priceVnd: 120_000, massKg: 0.003,
    size: [0.025, 0.003, 0.015],
    sensor: { kind: 'imu', rateHz: 1000, noiseStd: 0.15, latencyMs: 1 },
    description: '9 trục (thêm la bàn), nhiễu thấp hơn, góc yaw ổn định hơn.',
  },
  {
    id: 'encoder_hall', name: 'Encoder Hall (gắn động cơ)', category: 'sensor', priceVnd: 30_000, massKg: 0.005,
    size: [0.02, 0.01, 0.02],
    sensor: { kind: 'encoder', rateHz: 200, noiseStd: 0.05, latencyMs: 2 },
    description: 'Đo tốc độ quay trục (vòng/giây). Gắn vào động cơ kéo hoặc bánh đà.',
  },
  {
    id: 'hcsr04', name: 'Siêu âm HC-SR04', category: 'sensor', priceVnd: 20_000, massKg: 0.009,
    size: [0.015, 0.02, 0.045],
    sensor: { kind: 'ultrasonic', rateHz: 20, minRange: 0.02, maxRange: 4, fovDeg: 15, noiseStd: 0.5, latencyMs: 25 },
    description: 'Đo khoảng cách bằng sóng âm, chùm rộng ~15°, chậm (≤ 20 Hz). Rẻ, dễ dùng.',
  },
  {
    id: 'vl53l0x', name: 'Laser ToF VL53L0X', category: 'sensor', priceVnd: 60_000, massKg: 0.002,
    size: [0.004, 0.013, 0.018],
    sensor: { kind: 'tof_laser', rateHz: 30, minRange: 0.03, maxRange: 2, fovDeg: 0, noiseStd: 0.3, latencyMs: 30 },
    description: 'Đo khoảng cách bằng laser, tia hẹp, chính xác, tầm 2 m.',
  },
  {
    id: 'vl53l1x', name: 'Laser ToF VL53L1X', category: 'sensor', priceVnd: 150_000, massKg: 0.002,
    size: [0.004, 0.013, 0.018],
    sensor: { kind: 'tof_laser', rateHz: 50, minRange: 0.04, maxRange: 4, fovDeg: 0, noiseStd: 0.2, latencyMs: 20 },
    description: 'Laser ToF tầm 4 m, nhanh hơn VL53L0X.',
  },
  {
    id: 'sharp_gp2y0a21', name: 'Hồng ngoại Sharp GP2Y0A21', category: 'sensor', priceVnd: 110_000, massKg: 0.004,
    size: [0.013, 0.013, 0.045],
    sensor: { kind: 'ir_distance', rateHz: 25, minRange: 0.1, maxRange: 0.8, fovDeg: 2, noiseStd: 1, latencyMs: 40 },
    description: 'Đo khoảng cách hồng ngoại 10–80 cm, tín hiệu analog phi tuyến (cần tra bảng).',
  },
  {
    id: 'tcrt5000', name: 'Hồng ngoại phản xạ TCRT5000', category: 'sensor', priceVnd: 12_000, massKg: 0.002,
    size: [0.03, 0.005, 0.01],
    sensor: { kind: 'ir_reflect', rateHz: 500, minRange: 0.002, maxRange: 0.015, fovDeg: 0, noiseStd: 0, latencyMs: 1 },
    description: 'Phát hiện vạch/nền sáng–tối hoặc vật rất gần. Trả 0/1.',
  },
  {
    id: 'lidar_ld06', name: 'LiDAR 360° LD06', category: 'sensor', priceVnd: 650_000, massKg: 0.042,
    size: [0.039, 0.035, 0.039],
    sensor: { kind: 'lidar_360', rateHz: 10, minRange: 0.02, maxRange: 12, fovDeg: 360, noiseStd: 1, latencyMs: 100, samples: 360 },
    description: 'Quét khoảng cách 360°, mạnh nhưng đắt và nặng.',
  },

  // ------------------------------------------------------------ Động cơ
  {
    id: 'motor_n20', name: 'Động cơ N20 giảm tốc 300 rpm', category: 'motor', priceVnd: 55_000, massKg: 0.012,
    size: [0.034, 0.012, 0.012], motor: { kind: 'drive', stallTorqueNm: 0.06, noLoadRpm: 300 },
    description: 'Động cơ kéo nhỏ gọn cho bánh sau.',
  },
  {
    id: 'motor_tt', name: 'Động cơ TT vàng 1:48', category: 'motor', priceVnd: 18_000, massKg: 0.03,
    size: [0.065, 0.022, 0.019], motor: { kind: 'drive', stallTorqueNm: 0.08, noLoadRpm: 200 },
    description: 'Rẻ, phổ biến, hơi nặng và rơ.',
  },
  {
    id: 'motor_rw_dc', name: 'Động cơ bánh đà DC 370 (không giảm tốc)', category: 'motor', priceVnd: 60_000, massKg: 0.06,
    size: [0.03, 0.024, 0.024], motor: { kind: 'reaction', stallTorqueNm: 0.04, noLoadRpm: 8000 },
    description: 'Quay bánh đà để tạo mô-men chống đổ. Rẻ nhưng mô-men vừa phải.',
  },
  {
    id: 'motor_rw_bldc', name: 'Động cơ bánh đà BLDC Nidec 24H', category: 'motor', priceVnd: 250_000, massKg: 0.11,
    size: [0.024, 0.024, 0.024], motor: { kind: 'reaction', stallTorqueNm: 0.1, noLoadRpm: 5000 },
    description: 'BLDC có sẵn driver và encoder, mô-men lớn, cân bằng rất tốt.',
  },
  {
    id: 'servo_sg90', name: 'Servo SG90', category: 'motor', priceVnd: 30_000, massKg: 0.009,
    size: [0.023, 0.029, 0.012], motor: { kind: 'servo', stallTorqueNm: 0.18, noLoadRpm: 100, rangeDeg: 90 },
    description: 'Servo lái bánh trước.',
  },
  {
    id: 'servo_mg90s', name: 'Servo MG90S bánh răng kim loại', category: 'motor', priceVnd: 55_000, massKg: 0.014,
    size: [0.023, 0.029, 0.012], motor: { kind: 'servo', stallTorqueNm: 0.21, noLoadRpm: 120, rangeDeg: 90 },
    description: 'Servo lái bền hơn, ít rơ.',
  },

  // ------------------------------------------------------------ Bánh đà
  {
    id: 'flywheel_al_80', name: 'Đĩa bánh đà nhôm Ø80 mm', category: 'flywheel', priceVnd: 60_000, massKg: 0.08,
    size: [0.008, 0.08, 0.08], flywheel: { radius: 0.04, inertiaKgM2: 0.5 * 0.08 * 0.04 * 0.04 },
    description: 'Nhẹ, quán tính vừa.',
  },
  {
    id: 'flywheel_steel_100', name: 'Đĩa bánh đà thép Ø100 mm', category: 'flywheel', priceVnd: 90_000, massKg: 0.2,
    size: [0.008, 0.1, 0.1], flywheel: { radius: 0.05, inertiaKgM2: 0.5 * 0.2 * 0.05 * 0.05 },
    description: 'Quán tính lớn, cân bằng ổn định nhưng nặng.',
  },

  // ------------------------------------------------------------ Driver
  {
    id: 'tb6612', name: 'Driver TB6612FNG', category: 'driver', priceVnd: 40_000, massKg: 0.003,
    size: [0.02, 0.003, 0.02], description: 'Điều khiển 2 động cơ DC, hiệu suất cao.',
  },
  {
    id: 'l298n', name: 'Driver L298N', category: 'driver', priceVnd: 35_000, massKg: 0.03,
    size: [0.043, 0.027, 0.043], description: 'Phổ biến nhưng nặng, sụt áp lớn.',
  },

  // ------------------------------------------------------------ Nguồn
  {
    id: 'battery_18650x2', name: 'Pin 18650 ×2 + đế', category: 'power', priceVnd: 110_000, massKg: 0.1,
    size: [0.07, 0.02, 0.04], battery: { voltage: 7.4, capacityMah: 2600 },
    description: '7,4 V. Nặng, nên đặt thấp để hạ trọng tâm.',
  },
  {
    id: 'lipo_2s_1000', name: 'Pin LiPo 2S 1000 mAh', category: 'power', priceVnd: 180_000, massKg: 0.06,
    size: [0.07, 0.015, 0.035], battery: { voltage: 7.4, capacityMah: 1000 },
    description: 'Nhẹ, dòng xả lớn. Cần sạc cân bằng.',
  },
  {
    id: 'buck_lm2596', name: 'Mạch hạ áp LM2596', category: 'power', priceVnd: 20_000, massKg: 0.01,
    size: [0.043, 0.014, 0.021], description: 'Hạ áp cho vi điều khiển và cảm biến.',
  },

  // ------------------------------------------------------------ Kết cấu
  {
    id: 'bracket_3d', name: 'Giá đỡ in 3D', category: 'structure', priceVnd: 15_000, massKg: 0.01,
    size: [0.03, 0.02, 0.03], description: 'Giá gắn cảm biến/động cơ lên khung.',
  },
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/** Khối lượng riêng theo diện tích tấm khung (kg/m²), khung coi như tấm dày ~3 mm. */
export const FRAME_AREAL_DENSITY: Record<'mica' | 'pla' | 'aluminum' | 'carton', number> = {
  mica: 3.6,
  pla: 3.0,
  aluminum: 5.4,
  carton: 0.9,
};

export const FRAME_PRICE_VND: Record<'mica' | 'pla' | 'aluminum' | 'carton', number> = {
  mica: 60_000,
  pla: 80_000,
  aluminum: 150_000,
  carton: 10_000,
};
