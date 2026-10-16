// Khung sketch Arduino C++ cho xe ProBike: IMU MPU6050 (I2C, không cần thư viện), driver TB6612FNG, Servo.h,
// cảm biến khoảng cách, encoder. Các hàm motor()/servo()/read()/encoder()/imu.roll()/PID giữ đúng tên như trong
// mô phỏng nên code sinh từ khối gần như giống hệt bản JavaScript.

import { CATALOG_BY_ID } from '@/shared/catalog';
import type { SensorKind } from '@/shared/types';

export interface ArduinoPart {
  name: string;
  itemId?: string;
  /** Chân cắm đã gán khi lắp ráp (vd "D5", "5", "A0"). */
  pin?: string;
}

export interface SketchInput {
  varDecls: string[];
  userDefinitions: string[];
  setupBody: string;
  loopBody: string;
  ignoredCode: string;
  used: {
    motors: Set<string>;
    servos: Set<string>;
    sensors: Set<string>;
    encoders: Set<string>;
    usesImu: boolean;
    usesPlot: boolean;
    usesPid: boolean;
  };
  parts: ArduinoPart[];
  loopHz: number;
  controllerName: string;
}

// ------------------------------------------------------------ Tên & chân cắm

export function cppIdent(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(ascii) || ascii === '' ? `p_${ascii}` : ascii;
}

const ALL_PINS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'A0', 'A1', 'A2', 'A3', 'A6', 'A7'];
const PREFER = {
  pwm: ['5', '6', '3', '11', '10', '9'],
  servo: ['9', '10', '11', '3'],
  interrupt: ['2', '3'],
  digital: ['7', '8', '12', '13', '4', 'A0', 'A1', 'A2', 'A3', '2', '3', '11'],
  analog: ['A0', 'A1', 'A2', 'A3', 'A6', 'A7'],
};

class PinAllocator {
  private free = new Set(ALL_PINS);
  claim(pin: string): string {
    this.free.delete(pin);
    return pin;
  }
  take(prefer: string[]): string {
    for (const p of prefer) if (this.free.has(p)) return this.claim(p);
    for (const p of ALL_PINS) if (this.free.has(p) && !p.startsWith('A6') && !p.startsWith('A7')) return this.claim(p);
    return '-1 /* ⚠ hết chân trống — tự chọn chân */';
  }
}

function normalizePin(pin?: string): string | undefined {
  if (!pin) return undefined;
  const p = pin.trim().toUpperCase();
  if (/^D\d+$/.test(p)) return p.slice(1);
  if (/^(A\d+|\d+)$/.test(p)) return p;
  return undefined;
}

// ------------------------------------------------------------ Mô hình linh kiện

type MotorType = 'tb6612' | 'nidec';
interface MotorModel { name: string; id: string; type: MotorType; pwm: string; in1: string; in2: string; explicit: boolean }
interface ServoModel { name: string; id: string; pin: string; explicit: boolean }
interface SensorModel { name: string; id: string; kind: SensorKind | 'unknown'; itemId?: string; pins: string[]; explicit: boolean }
interface EncoderModel { name: string; id: string; pin: string; explicit: boolean }

const PIN_NOTE = '// ← sửa cho đúng dây nối thật';

function buildModels(input: SketchInput) {
  const pins = new PinAllocator();
  const byName = new Map(input.parts.map((p) => [p.name, p]));
  const usedIds = new Set<string>();
  const uniqueId = (name: string) => {
    let id = cppIdent(name);
    while (usedIds.has(id)) id += '_';
    usedIds.add(id);
    return id;
  };

  // Vai trò: lấy theo kho linh kiện nếu có thiết kế, cộng thêm tên được dùng trong code
  const motorNames = new Set<string>(input.used.motors);
  const servoNames = new Set<string>(input.used.servos);
  const sensorNames = new Set<string>(input.used.sensors);
  const encoderNames = new Set<string>(input.used.encoders);
  for (const p of input.parts) {
    const item = p.itemId ? CATALOG_BY_ID[p.itemId] : undefined;
    if (!item) continue;
    if (item.motor?.kind === 'servo') servoNames.add(p.name);
    else if (item.motor) motorNames.add(p.name);
    else if (item.sensor?.kind === 'encoder') encoderNames.add(p.name);
    else if (item.sensor && item.sensor.kind !== 'imu') sensorNames.add(p.name);
  }

  // Chân gán sẵn từ thiết kế được giữ trước
  const explicitPin = (name: string) => {
    const p = normalizePin(byName.get(name)?.pin);
    return p ? pins.claim(p) : undefined;
  };
  const explicitOf = new Map<string, string | undefined>();
  for (const n of [...motorNames, ...servoNames, ...sensorNames, ...encoderNames]) explicitOf.set(n, explicitPin(n));

  const servos: ServoModel[] = [...servoNames].map((name) => {
    const e = explicitOf.get(name);
    return { name, id: uniqueId(name), pin: e ?? pins.take(PREFER.servo), explicit: !!e };
  });
  const encoders: EncoderModel[] = [...encoderNames].map((name) => {
    const e = explicitOf.get(name);
    return { name, id: uniqueId(name), pin: e ?? pins.take(PREFER.interrupt), explicit: !!e };
  });
  const motors: MotorModel[] = [...motorNames].map((name) => {
    const e = explicitOf.get(name);
    const itemId = byName.get(name)?.itemId;
    const type: MotorType = itemId === 'motor_rw_bldc' ? 'nidec' : 'tb6612';
    return {
      name, id: uniqueId(name), type,
      pwm: e ?? pins.take(PREFER.pwm),
      in1: pins.take(PREFER.digital),
      in2: type === 'tb6612' ? pins.take(PREFER.digital) : '',
      explicit: !!e,
    };
  });
  const needStby = motors.some((m) => m.type === 'tb6612');
  const stby = needStby ? pins.take(['4', ...PREFER.digital]) : '';
  const sensors: SensorModel[] = [...sensorNames].map((name) => {
    const e = explicitOf.get(name);
    const itemId = byName.get(name)?.itemId;
    const kind = (itemId ? CATALOG_BY_ID[itemId]?.sensor?.kind : undefined) ?? 'unknown';
    let pinsOut: string[] = [];
    if (kind === 'ultrasonic') pinsOut = [e ?? pins.take(PREFER.digital), pins.take(PREFER.digital)];
    else if (kind === 'ir_distance' || kind === 'unknown') pinsOut = [e ?? pins.take(PREFER.analog)];
    else if (kind === 'ir_reflect') pinsOut = [e ?? pins.take(PREFER.digital)];
    return { name, id: uniqueId(name), kind, itemId, pins: pinsOut, explicit: !!e };
  });
  return { motors, servos, sensors, encoders, stby };
}

// ------------------------------------------------------------ Sinh code

const CPP_PID = `class PID {
 public:
  float kp, ki, kd;
  float integral = 0, prevError = 0;
  float outMin = -1e9, outMax = 1e9;
  bool first = true;
  PID(float p = 0, float i = 0, float d = 0) : kp(p), ki(i), kd(d) {}
  float update(float error, float dt) {
    float derivative = 0;
    if (dt > 0) {
      integral += error * dt;
      if (!first) derivative = (error - prevError) / dt;
    }
    first = false;
    prevError = error;
    float out = kp * error + ki * integral + kd * derivative;
    if (out > outMax) { if (dt > 0 && ki != 0 && error > 0) integral -= error * dt; out = outMax; }
    else if (out < outMin) { if (dt > 0 && ki != 0 && error < 0) integral -= error * dt; out = outMin; }
    return out;
  }
  void setLimits(float mn, float mx) { outMin = mn; outMax = mx; }
  void setTunings(float p, float i, float d) { kp = p; ki = i; kd = d; }
  void reset() { integral = 0; prevError = 0; first = true; }
};`;

const CPP_IMU = `// ===== IMU MPU6050 — I2C: SDA=A4, SCL=A5 (Nano/Uno); ESP32: SDA=21, SCL=22 =====
// Quy ước giống mô phỏng: x tiến về trước, y hướng lên, z sang trái; roll dương = nghiêng trái.
// Giả định chip gắn nằm ngang, trục X của chip chỉ về phía trước xe, trục Y của chip chỉ sang trái.
// ⚠ Nếu gắn IMU xoay khác, đổi dấu/đổi trục trong imuUpdate().
#define MPU_ADDR 0x68
struct Imu {
  float r = 0, p = 0, y = 0, gx = 0, gy = 0, gz = 0, ax = 0, ay = 0, az = 0;
  float roll() { return r; }
  float pitch() { return p; }
  float yaw() { return y; }
  float gyroX() { return gx; }
  float gyroY() { return gy; }
  float gyroZ() { return gz; }
  float accX() { return ax; }
  float accY() { return ay; }
  float accZ() { return az; }
} imu;
float gyroBias[3] = {0, 0, 0};

void mpuWrite(uint8_t reg, uint8_t v) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.write(v); Wire.endTransmission();
}

void mpuRead(int16_t raw[7]) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14);
  for (int i = 0; i < 7; i++) raw[i] = (Wire.read() << 8) | Wire.read();
}

void imuBegin() {
  Wire.begin();
  Wire.setClock(400000);
  mpuWrite(0x6B, 0x00);  // đánh thức MPU6050
  mpuWrite(0x1A, 0x03);  // lọc thông thấp ~44 Hz
  mpuWrite(0x1B, 0x08);  // con quay ±500 °/s (65,5 LSB/°/s)
  mpuWrite(0x1C, 0x00);  // gia tốc ±2 g (16384 LSB/g)
  delay(100);
  // Hiệu chỉnh độ lệch con quay: GIỮ XE ĐỨNG YÊN khoảng 1 giây sau khi bật nguồn
  int16_t raw[7];
  long sum[3] = {0, 0, 0};
  for (int i = 0; i < 200; i++) {
    mpuRead(raw);
    sum[0] += raw[4]; sum[1] += raw[5]; sum[2] += raw[6];
    delay(3);
  }
  for (int k = 0; k < 3; k++) gyroBias[k] = sum[k] / 200.0 / 65.5;
}

void imuUpdate(float dt) {
  int16_t raw[7];
  mpuRead(raw);
  // raw: 0..2 gia tốc chip X,Y,Z — 3 nhiệt độ — 4..6 con quay chip X,Y,Z
  float cx = raw[0] / 16384.0 * 9.81, cy = raw[1] / 16384.0 * 9.81, cz = raw[2] / 16384.0 * 9.81;
  float wx = raw[4] / 65.5 - gyroBias[0], wy = raw[5] / 65.5 - gyroBias[1], wz = raw[6] / 65.5 - gyroBias[2];
  // Đổi sang trục của xe: x = chip X, y = chip Z (lên), z = chip Y (trái)
  imu.ax = cx; imu.ay = cz; imu.az = cy;
  imu.gx = wx; imu.gy = wz; imu.gz = wy;
  float accRoll = atan2(-imu.az, imu.ay) * RAD_TO_DEG;
  float accPitch = atan2(imu.ax, imu.ay) * RAD_TO_DEG;
  // Bộ lọc bù (complementary): tin con quay ngắn hạn, gia tốc kế dài hạn
  const float ALPHA = 0.98;
  imu.r = ALPHA * (imu.r + imu.gx * dt) + (1 - ALPHA) * accRoll;
  imu.p = ALPHA * (imu.p + imu.gz * dt) + (1 - ALPHA) * accPitch;
  imu.y += imu.gy * dt;
}`;

export function buildSketch(input: SketchInput): string {
  const { motors, servos, sensors, encoders, stby } = buildModels(input);
  const L: string[] = [];
  const includes = new Set<string>(['#include <Wire.h>']);
  if (servos.length) includes.add('#include <Servo.h>   // ESP32: dùng thư viện ESP32Servo (#include <ESP32Servo.h>)');
  for (const s of sensors) {
    if (s.kind === 'tof_laser' && s.itemId === 'vl53l1x') includes.add('#include <VL53L1X.h>   // cài thư viện "VL53L1X" của Pololu (Library Manager)');
    else if (s.kind === 'tof_laser') includes.add('#include <Adafruit_VL53L0X.h>   // cài thư viện "Adafruit_VL53L0X" (Library Manager)');
  }

  L.push(
    '// ==========================================================================',
    '// Code xe ProBike — xuất tự động từ khối lập trình trên web',
    `// Viết cho ${input.controllerName} (Arduino IDE). Vòng lặp điều khiển ${input.loopHz} Hz giống mô phỏng.`,
    '// Các dòng có "⚠" hoặc "← sửa" là chỗ cần kiểm tra lại theo xe thật (chân cắm, chiều quay...).',
    '// ==========================================================================',
    '',
    ...includes,
    '',
  );

  // ----- chân cắm
  if (motors.length || servos.length || sensors.length || encoders.length) {
    L.push('// ===== Cấu hình chân cắm — ⚠ KIỂM TRA LẠI THEO DÂY NỐI THẬT =====');
    if (stby) L.push(`#define TB6612_STBY ${stby}   // chân STBY của TB6612 (hoặc nối thẳng lên 5V) ${PIN_NOTE}`);
    for (const m of motors) {
      const U = m.id.toUpperCase();
      if (m.type === 'nidec') {
        L.push(`// Động cơ "${m.name}": BLDC Nidec 24H (driver tích hợp)`);
        L.push(`#define ${U}_PWM ${m.pwm}   // chân PWM (~) ${PIN_NOTE}`);
        L.push(`#define ${U}_DIR ${m.in1}   // chân chiều quay ${PIN_NOTE}`);
      } else {
        L.push(`// Động cơ "${m.name}" qua TB6612FNG`);
        L.push(`#define ${U}_PWM ${m.pwm}   // chân PWM (~) — PWMA/PWMB ${PIN_NOTE}`);
        L.push(`#define ${U}_IN1 ${m.in1}   // AIN1/BIN1 ${PIN_NOTE}`);
        L.push(`#define ${U}_IN2 ${m.in2}   // AIN2/BIN2 ${PIN_NOTE}`);
      }
      L.push(`#define ${U}_REVERSE false   // ⚠ đổi thành true nếu "${m.name}" quay ngược chiều so với mô phỏng`);
    }
    for (const s of servos) {
      const U = s.id.toUpperCase();
      L.push(`// Servo "${s.name}"`);
      L.push(`#define ${U}_PIN ${s.pin}   // chân tín hiệu servo ${PIN_NOTE}`);
      L.push(`#define ${U}_CENTER 90   // ⚠ góc servo khi bánh trước thẳng (chỉnh cho đúng)`);
    }
    for (const s of sensors) {
      const U = s.id.toUpperCase();
      if (s.kind === 'ultrasonic') {
        L.push(`// Cảm biến siêu âm "${s.name}" (HC-SR04)`);
        L.push(`#define ${U}_TRIG ${s.pins[0]}   ${PIN_NOTE}`);
        L.push(`#define ${U}_ECHO ${s.pins[1]}   ${PIN_NOTE}`);
      } else if (s.kind === 'ir_distance') {
        L.push(`#define ${U}_PIN ${s.pins[0]}   // "${s.name}" Sharp IR — chân analog ${PIN_NOTE}`);
      } else if (s.kind === 'ir_reflect') {
        L.push(`#define ${U}_PIN ${s.pins[0]}   // "${s.name}" TCRT5000 — chân DO ${PIN_NOTE}`);
      } else if (s.kind === 'unknown') {
        L.push(`#define ${U}_PIN ${s.pins[0]}   // "${s.name}" — ⚠ chưa rõ loại cảm biến, tạm đọc analog ${PIN_NOTE}`);
      } else if (s.kind === 'tof_laser') {
        L.push(`// "${s.name}" laser ToF dùng I2C (SDA/SCL chung với IMU). Nhiều cảm biến ToF cần đổi địa chỉ qua chân XSHUT.`);
      }
    }
    for (const e of encoders) {
      const U = e.id.toUpperCase();
      L.push(`// Encoder "${e.name}" — chân kênh A phải hỗ trợ ngắt (Nano/Uno: chân 2 hoặc 3)`);
      L.push(`#define ${U}_PIN ${e.pin}   ${PIN_NOTE}`);
      L.push(`#define ${U}_PPR 11   // ⚠ số xung mỗi vòng (nhân tỉ số truyền nếu đo trục sau hộp số)`);
    }
    L.push('');
  }

  const LOOP_US = Math.round(1e6 / input.loopHz);
  L.push(
    '// ===== Thời gian =====',
    `const unsigned long LOOP_US = ${LOOP_US};   // chu kỳ điều khiển = ${input.loopHz} Hz`,
    'unsigned long _lastLoop = 0;',
    'float _dt = 0.01;',
    'float dt() { return _dt; }',
    '',
  );

  L.push(CPP_IMU, '');   // luôn có: loop() cập nhật IMU mỗi chu kỳ
  L.push('// ===== Bộ điều khiển PID =====', CPP_PID, '');

  L.push(
    '// ===== Hàm tiện ích (giống trong mô phỏng) =====',
    'float constrainf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }',
    'float mapf(float x, float a, float b, float c, float d) { return a == b ? c : (x - a) * (d - c) / (b - a) + c; }',
    'float param(const char* name, float macDinh) { return macDinh; }   // trên xe thật: dùng giá trị mặc định',
    'void print(const char* s) { Serial.println(s); }',
    'void print(const String& s) { Serial.println(s); }',
    'void print(int v) { Serial.println(v); }',
    'void print(long v) { Serial.println(v); }',
    'void print(unsigned long v) { Serial.println(v); }',
    'void print(float v) { Serial.println(v, 4); }',
    'void print(double v) { Serial.println(v, 4); }',
    'bool _plotted = false;',
    '// Mở Tools → Serial Plotter (115200) để xem biểu đồ',
    'void plot(const char* label, float v) { Serial.print(label); Serial.print(\':\'); Serial.print(v, 4); Serial.print(\'\\t\'); _plotted = true; }',
    '',
  );

  // ----- động cơ
  L.push('// ===== Động cơ =====');
  if (motors.length) {
    L.push(
      'void motorTB6612(int pwm, int in1, int in2, float v, bool reverse) {',
      '  v = constrainf(v, -1, 1);',
      '  if (reverse) v = -v;',
      '  digitalWrite(in1, v > 0 ? HIGH : LOW);',
      '  digitalWrite(in2, v < 0 ? HIGH : LOW);',
      '  analogWrite(pwm, (int)(fabs(v) * 255));',
      '}',
    );
    if (motors.some((m) => m.type === 'nidec')) {
      L.push(
        'void motorNidec(int pwm, int dir, float v, bool reverse) {',
        '  v = constrainf(v, -1, 1);',
        '  if (reverse) v = -v;',
        '  digitalWrite(dir, v >= 0 ? HIGH : LOW);',
        '  analogWrite(pwm, 255 - (int)(fabs(v) * 255));   // Nidec 24H: PWM đảo (255 = dừng)',
        '}',
      );
    }
  }
  L.push('void motor(const char* name, float v) {');
  motors.forEach((m, i) => {
    const U = m.id.toUpperCase();
    const call = m.type === 'nidec'
      ? `motorNidec(${U}_PWM, ${U}_DIR, v, ${U}_REVERSE);`
      : `motorTB6612(${U}_PWM, ${U}_IN1, ${U}_IN2, v, ${U}_REVERSE);`;
    L.push(`  ${i ? 'else ' : ''}if (strcmp(name, "${m.name}") == 0) ${call}`);
  });
  L.push('}', '');

  // ----- servo
  L.push('// ===== Servo =====');
  for (const s of servos) L.push(`Servo servo_${s.id};`);
  L.push('void servo(const char* name, float deg) {');
  servos.forEach((s, i) => {
    L.push(`  ${i ? 'else ' : ''}if (strcmp(name, "${s.name}") == 0) servo_${s.id}.write(constrainf(${s.id.toUpperCase()}_CENTER + deg, 0, 180));`);
  });
  L.push('}', '');

  // ----- cảm biến
  L.push('// ===== Cảm biến =====');
  for (const s of sensors) {
    const U = s.id.toUpperCase();
    if (s.kind === 'ultrasonic') {
      L.push(
        `float read_${s.id}() {   // cm. ⚠ pulseIn chờ tối đa 25 ms → làm chậm vòng lặp; nên đọc thưa (vd 20 lần/giây)`,
        `  digitalWrite(${U}_TRIG, LOW); delayMicroseconds(2);`,
        `  digitalWrite(${U}_TRIG, HIGH); delayMicroseconds(10);`,
        `  digitalWrite(${U}_TRIG, LOW);`,
        `  unsigned long us = pulseIn(${U}_ECHO, HIGH, 25000UL);`,
        '  return us == 0 ? 400 : us / 58.0;',
        '}',
      );
    } else if (s.kind === 'ir_distance') {
      L.push(
        `float read_${s.id}() {   // cm, Sharp GP2Y0A21 (10–80 cm). ⚠ hiệu chỉnh công thức theo cảm biến thật`,
        `  float volts = analogRead(${U}_PIN) * 5.0 / 1023.0;`,
        '  if (volts < 0.3) return 80;',
        '  return constrainf(27.86 * pow(volts, -1.15), 10, 80);',
        '}',
      );
    } else if (s.kind === 'ir_reflect') {
      L.push(`int read_${s.id}() { return digitalRead(${U}_PIN); }   // 0/1 — ⚠ đảo lại (1 - ...) nếu module báo ngược`);
    } else if (s.kind === 'tof_laser' && s.itemId === 'vl53l1x') {
      L.push(`VL53L1X tof_${s.id};`, `float read_${s.id}() { return tof_${s.id}.read() / 10.0; }   // cm`);
    } else if (s.kind === 'tof_laser') {
      L.push(
        `Adafruit_VL53L0X tof_${s.id};`,
        `float read_${s.id}() {   // cm`,
        '  VL53L0X_RangingMeasurementData_t m;',
        `  tof_${s.id}.rangingTest(&m, false);`,
        '  return m.RangeStatus == 4 ? 200 : m.RangeMilliMeter / 10.0;',
        '}',
      );
    } else if (s.kind === 'lidar_360') {
      L.push(`float read_${s.id}() { return 0; }   // ⚠ LiDAR cần thư viện riêng (đọc UART) — tự viết phần này`);
    } else {
      L.push(`float read_${s.id}() { return analogRead(${U}_PIN); }   // ⚠ chưa rõ loại cảm biến — tự đổi sang đơn vị cm`);
    }
  }
  L.push('float read(const char* name) {');
  sensors.forEach((s, i) => L.push(`  ${i ? 'else ' : ''}if (strcmp(name, "${s.name}") == 0) return read_${s.id}();`));
  L.push('  return 0;', '}', '');

  // ----- encoder
  L.push('// ===== Encoder =====');
  for (const e of encoders) {
    const U = e.id.toUpperCase();
    L.push(
      `volatile long enc_${e.id}_count = 0;`,
      `void enc_${e.id}_isr() { enc_${e.id}_count++; }   // chỉ đếm 1 kênh → không biết chiều quay`,
      `float enc_${e.id}_rps = 0;`,
      `unsigned long enc_${e.id}_last = 0;`,
      `long enc_${e.id}_lastCount = 0;`,
      `float encoder_${e.id}() {   // vòng/giây`,
      '  unsigned long now = micros();',
      `  float dtS = (now - enc_${e.id}_last) / 1e6;`,
      '  if (dtS >= 0.02) {',
      `    noInterrupts(); long c = enc_${e.id}_count; interrupts();`,
      `    enc_${e.id}_rps = (c - enc_${e.id}_lastCount) / (float)${U}_PPR / dtS;`,
      `    enc_${e.id}_lastCount = c; enc_${e.id}_last = now;`,
      '  }',
      `  return enc_${e.id}_rps;`,
      '}',
    );
  }
  L.push('float encoder(const char* name) {');
  encoders.forEach((e, i) => L.push(`  ${i ? 'else ' : ''}if (strcmp(name, "${e.name}") == 0) return encoder_${e.id}();`));
  L.push('  return 0;', '}', '');

  // ----- biến và hàm của thí sinh
  if (input.varDecls.length) L.push('// ===== Biến của chương trình =====', ...input.varDecls, '');
  if (input.userDefinitions.length) L.push('// ===== Hàm tự tạo =====', ...input.userDefinitions, '');
  if (input.ignoredCode.trim()) {
    L.push('// ⚠ Các khối dưới đây không nằm trong "khi khởi động" hay "lặp mãi" nên không chạy:');
    L.push(...input.ignoredCode.trim().split('\n').map((l) => `// ${l}`), '');
  }

  // ----- setup / loop
  L.push('// ===== Khối "khi khởi động" =====', 'void userSetup() {', input.setupBody.replace(/\s+$/, ''), '}', '');
  L.push('// ===== Khối "lặp mãi" =====', 'void userLoop() {', input.loopBody.replace(/\s+$/, ''), '}', '');

  const setupHw: string[] = ['Serial.begin(115200);', 'imuBegin();'];
  if (stby) setupHw.push('pinMode(TB6612_STBY, OUTPUT);', 'digitalWrite(TB6612_STBY, HIGH);');
  for (const m of motors) {
    const U = m.id.toUpperCase();
    setupHw.push(`pinMode(${U}_PWM, OUTPUT);`);
    if (m.type === 'nidec') setupHw.push(`pinMode(${U}_DIR, OUTPUT);`, `analogWrite(${U}_PWM, 255);   // Nidec: dừng`);
    else setupHw.push(`pinMode(${U}_IN1, OUTPUT);`, `pinMode(${U}_IN2, OUTPUT);`);
  }
  for (const s of servos) setupHw.push(`servo_${s.id}.attach(${s.id.toUpperCase()}_PIN);`, `servo_${s.id}.write(${s.id.toUpperCase()}_CENTER);`);
  for (const s of sensors) {
    const U = s.id.toUpperCase();
    if (s.kind === 'ultrasonic') setupHw.push(`pinMode(${U}_TRIG, OUTPUT);`, `pinMode(${U}_ECHO, INPUT);`);
    else if (s.kind === 'ir_reflect') setupHw.push(`pinMode(${U}_PIN, INPUT);`);
    else if (s.kind === 'tof_laser' && s.itemId === 'vl53l1x')
      setupHw.push(`tof_${s.id}.setTimeout(100);`, `if (!tof_${s.id}.init()) Serial.println(F("Khong thay VL53L1X ${s.name}"));`, `tof_${s.id}.startContinuous(20);`);
    else if (s.kind === 'tof_laser') setupHw.push(`if (!tof_${s.id}.begin()) Serial.println(F("Khong thay VL53L0X ${s.name}"));`);
  }
  for (const e of encoders) {
    const U = e.id.toUpperCase();
    setupHw.push(`pinMode(${U}_PIN, INPUT_PULLUP);`, `attachInterrupt(digitalPinToInterrupt(${U}_PIN), enc_${e.id}_isr, RISING);`);
  }

  L.push(
    'void setup() {',
    ...setupHw.map((l) => `  ${l}`),
    '  userSetup();',
    '  _lastLoop = micros();',
    '}',
    '',
    'void loop() {',
    '  unsigned long now = micros();',
    '  if (now - _lastLoop < LOOP_US) return;   // giữ đúng tần số như mô phỏng',
    '  _dt = (now - _lastLoop) / 1e6;',
    '  _lastLoop = now;',
    '  imuUpdate(_dt);',
    '  _plotted = false;',
    '  userLoop();',
    '  if (_plotted) Serial.println();',
    '}',
    '',
  );
  return L.join('\n');
}

