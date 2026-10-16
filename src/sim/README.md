# Lõi mô phỏng ProBike (`src/sim`)

Headless (không React/three), chạy được trong Web Worker và Vitest. Vật lý bằng Rapier, bước cố định **1 ms**.

## Dùng nhanh

```ts
import { createSimEngine, SAMPLE_DESIGN, SampleBalanceController, buildMapGeometry } from '@/sim';

const sim = createSimEngine();
await sim.init({ design, mapId: 'balance_flat', seed: 1, realism: 'medium', maxTimeS: 60, disturbances: true });
while (!sim.result()) {
  const frame = sim.sensors();          // SensorFrame (giá trị đã qua nhiễu, tần số, độ trễ)
  const cmd = await runtime.tick(frame); // ActuatorCommand từ code thí sinh
  sim.step(cmd);                         // chạy đúng 1 chu kỳ điều khiển = 1 / loopHz
  render(sim.snapshot());                // SimSnapshot cho phần 3D
}
const result = sim.result();             // RunResult
sim.dispose();
```

`init()` tự gọi `RAPIER.init()` (một lần). Nếu thiết kế không đủ 2 bánh, `init()` ném `DesignError` (thông báo tiếng Việt).

## API xuất ra (`src/sim/index.ts`)

| Tên | Mô tả |
|---|---|
| `createSimEngine()`, `RapierSimEngine` | Hiện thực `SimEngine`. Thêm: `abort('stopped' \| 'code_error', msg?)`, `time`, `trueRollDeg`, `flywheelRps(tênĐộngCơ)`, `vehicle` (VehicleModel), `map` (MapGeometry) |
| `initRapier()` | Khởi tạo WASM một lần (tuỳ chọn gọi trước để giảm trễ lần đầu) |
| `buildMapGeometry(mapId, seed)` | Hình học map để vẽ 3D: `floor`, `walls` (hộp: `center`, `size`, `quaternion`), `lines` (vạch sơn), `rocks` (ellipsoid `radii` + `points` convex hull, quay `quaternion`), `seesaw` (`pivot`, `points` của ván, `maxTiltDeg`), `checkpoints`, `path`, `start`, `bounds`, `colors` |
| `pointAt`, `projectOnPath` | Điểm/hướng trên đường tâm theo độ dài cung; chiếu vị trí xe lên đường (s, lệch ngang) |
| `seesawQuat(geom, tiltDeg)` | Quaternion ván ở góc nghiêng bất kỳ (xem trước) |
| `analyzeVehicle(design)` | Khối lượng, trọng tâm, quán tính, ghép động cơ ↔ bánh/bánh đà/encoder, cảnh báo |
| `COURSE`, `SEGMENTS`, `BALANCE_FLAT`, `PAR_TIME_S`, `MAP_NAMES`, `CHECKPOINT_NAMES` | **Nguồn số đo duy nhất** (`maps/spec.ts`) |
| `computeScore`, `SCORING` | Công thức điểm & ngưỡng kết thúc |
| `SAMPLE_DESIGN`, `SampleBalanceController`, `SAMPLE_GAINS`, `SAMPLE_BALANCE_CODE` | Xe mẫu, PID mẫu (TS) và cùng thuật toán viết bằng API thí sinh |
| `rayFrom`, `sharpVoltage`, `sharpDistance`, `NOISE_FACTOR`, `LATENCY_FACTOR` | Tiện ích cảm biến |

### Snapshot

- `bike`: gốc xe (trung điểm 2 điểm tiếp đất) + hướng thân → đặt mọi linh kiện theo `PlacedPart.position/rotationDeg` dưới node này.
- `parts`: pose thế giới của 2 bánh (`id` = uid bánh, đã gồm góc lái + góc lăn) và đĩa bánh đà (`id` = uid đĩa, đã gồm góc quay).
- `dynamic`: `{ id: 'seesaw' }` — pose ván cầu (gốc = trục xoay, mặt trên ván y = 0 cục bộ).

## Quy ước dấu (quan trọng)

- Hệ toạ độ **tay phải** như hợp đồng: x tiến, y lên, **z sang phải** (khớp Rapier và three.js, không cần lật khi vẽ).
- `imu.roll` dương = nghiêng **phải** (đầu y quay về +z). `gyro = [ωx, ωy, ωz]` (độ/s quanh trục thân, tay phải) nên `gyroX` cùng dấu với tốc độ đổi roll.
- `pitch` dương = đầu xe ngóc lên. `yaw` dương = rẽ **trái** (mũi x quay về −z); `gyroY` cùng dấu.
- Lệnh bánh đà dương → thân bị đẩy về phía roll dương. Vì vậy PID kiểu `u = pid.update(0 − roll)` (PLAN mục 7) ổn định khi lắp mặc định. Lắp động cơ/đĩa quay 180° quanh y thì đảo chiều.
- Lệnh động cơ kéo dương → xe tiến. Servo lái dương (độ) → lái **trái** (cùng dấu yaw); giới hạn ±40°, tốc độ quay = noLoadRpm × 6 độ/s.
- `push(J)`: xung lực J (N·s) ngang, vuông góc thân xe, đặt tại trọng tâm; J > 0 đẩy sang phải (+z). Gợi ý nút "Đẩy" trong giao diện: ±0,05 N·s.

### Chu kỳ điều khiển

`step()` chạy vật lý tới mốc `k / loopHz` làm tròn tới bước 1 ms. Khi 1/loopHz không chia hết cho 1 ms (STM32 400 Hz = 2,5 ms) số bước xen kẽ 3/2 nên khoảng thời gian thật giữa hai lần `loop()` dao động ±0,5 ms, trung bình vẫn đúng. Runtime nên tính `dt()` bằng hiệu `SensorFrame.t` của hai khung liên tiếp, không dùng hằng `controlPeriod`.

## Mô hình vật lý

- **Thân**: một vật cứng gồm khung (tấm dài = wheelbase, cao = frame.height tính từ trục bánh, dày 2 cm) và mọi linh kiện (hộp đặc theo `size`, quay theo `rotationDeg`). Khối lượng/trọng tâm/tensor quán tính tính đầy đủ (định lý trục song song, chéo hoá Jacobi). Mỗi linh kiện là một collider để phát hiện "thân chạm đất".
- **Bánh** `wheel_btc`: vật riêng, collider trụ bo tròn (bán kính bo = nửa bề rộng ⇒ mặt lốp cong), quán tính trục 0,6·m·r², nối khớp quay trục z. Bánh trước có càng lái (khớp quay trục y + motor vị trí của Rapier, mô-men tối đa = stallTorque servo) nếu `frame.steerable` và có servo.
- **Động cơ kéo**: τ = τkẹt·(u − ω/ω₀), giới hạn ±τkẹt, tác dụng lên bánh và phản lực lên thân. Bánh được chọn theo `attachTo`, nếu không có thì bánh gần nhất.
- **Bánh đà**: đĩa `flywheel` gắn động cơ `reaction` qua `attachTo` (hoặc gần nhất < 10 cm), quay quanh trục dọc x. Tốc độ bánh đà là trạng thái riêng (tích phân 1 ms); mô-men động cơ cùng công thức trên, phản lực + mô-men con quay (−ω×h) lên thân; bão hoà ở tốc độ không tải (BLDC 24H: 5000 rpm ≈ 83 vòng/s). Không có đĩa ⇒ chỉ có quán tính rotor 2·10⁻⁶ kg·m².
- Hằng số: g = 9,81; 8 vòng lặp solver; ma sát nền 0,9, bánh 1,0, vách 0,4; cản lăn bánh 0,02; ổ bi bánh đà 10⁻⁶ N·m·s/rad; nghiêng ban đầu ngẫu nhiên ±0,8° theo seed. Nhiễu đẩy: 0,03–0,07 N·s mỗi 2–4 s, nhân {thấp 0,7; vừa 1; cao 1,2}. Khi bánh đà chạm trần tốc độ, phần động lượng bị kẹp được trả lại thân (bảo toàn động lượng).

## Cảm biến

Mỗi cảm biến lấy mẫu đúng `rateHz`, giá trị ra sau `latencyMs`, nhiễu Gauss theo seed. Độ thực tế: nhiễu × {thấp 0,25; vừa 1; cao 2}, độ trễ × {0,5; 1; 1,5}. Tia đo xuất phát từ mặt trước cảm biến theo +x cục bộ, chỉ trúng vật của map.

| Loại | `read()` | Mô hình |
|---|---|---|
| IMU | `frame.imu` | Góc (độ) + lệch lắp ±0,2°·hệ số, gyro (độ/s) nhiễu 2σ + lệch không, gia tốc (m/s², có g); MPU6050 yaw trôi 0,02°/s·hệ số |
| encoder | vòng/s | Trục động cơ kéo / bánh đà / bánh, dấu dương = chiều lệnh dương |
| siêu âm | cm | 15 tia trong nón `fovDeg`, lấy gần nhất; bỏ bề mặt quá xiên (> 55°); mất tiếng vọng 1%·hệ số; ngoài tầm = maxRange |
| ToF laser | cm | 1 tia; nhiễu tăng theo khoảng cách; ngoài tầm = maxRange |
| IR Sharp | cm | Đường cong điện áp V(d) (đỉnh 7 cm), nhiễu cộng vào điện áp rồi tra ngược ⇒ sai số tăng nhanh theo khoảng cách, vật < 7 cm bị đọc thành xa |
| IR phản xạ | 0/1 | 1 khi thấy bề mặt trắng (vách, vạch sơn) trong tầm, hoặc nền xám sát ≤ 15% tầm |
| LiDAR 360 | mảng cm | `samples` tia trong mặt phẳng ngang của cảm biến, phần tử i = góc i·360/samples độ từ phía trước quay sang phải (+z) |

## Kết thúc & điểm (`scoring.ts`)

- `fell`: |roll| > 45° hoặc thân (không tính bánh) chạm nền/đá/ván cầu.
- `out_of_bounds`: lệch ngang > mép đường + 8 cm, trượt khỏi cầu (> mép cầu + 2 cm), rơi dưới nền, hoặc xa điểm xuất phát > 1,2 m ở `balance_flat`.
- Rơi/trượt khỏi cầu bập bênh = **kết thúc lượt** (`out_of_bounds`), không có luật quay lại đầu cầu trong mô phỏng — thể lệ nên ghi thống nhất.
- `timeout`: hết `maxTimeS` (riêng `balance_flat`: trụ hết giờ = `completed`). `completed`: qua checkpoint cuối đúng thứ tự.
- `balancedS` = thời gian liên tục dài nhất có |roll| ≤ 20°. Checkpoint `balance_flat`: `giu_10s`, `giu_20s`, `giu_30s`.

```
score = 100 × số checkpoint
      + (completed ? round(200 × min(1, parTime / timeS)) : 0)
      + (completed ? round(100 × balancedS / timeS × max(0, 1 − maxRollDeg / 45)) : 0)
```

Thời gian chuẩn: straight 2,5 s; u_turn 3,5 s; seesaw 3,5 s; rocks 3 s; full_course 10 s; balance_flat không có.

## Sa hình (`maps/spec.ts`)

Lòng đường 50 cm, vách 15 cm × 1 cm. full_course: xuất phát 1,2 m → cua U (R = 60 cm, rẽ **trái**, về −z) → cầu bập bênh 1,0 × 0,25 m (**không có vách** ở đoạn cầu, ±10°, trục cao 8,7 cm, hai đầu ván vát 4 cm, ván ban đầu tì đầu vào xuống nền) → bãi đá 0,8 m (≈ 40 viên, cao 0,5–1,5 cm, theo seed) → đích 0,8 m → đoạn dư 0,35 m có vách chặn. Hộp bao nằm trong 4,0 × 2,5 m (có test kiểm).

Map luyện từng đoạn có đoạn dẫn 0,4 m trước/sau. Xe xuất phát tại s = 0,2 m tính từ vách đầu.

## Kết quả kiểm chứng (Vitest)

- Xe mẫu + PID mẫu (Kp 0,4; Kd 0,035; Kw 0,07) giữ thăng bằng 32 s trên `balance_flat` có đẩy, test chạy seed 1–8 × realism vừa & cao (đã quét tay seed 1–30: không lượt nào ngã); bỏ Kw thì bánh đà bão hoà và xe đổ sau vài giây.
- Chạy hết `straight` (≈ 2,3 s ở lệnh 0,5). Có servo lái + bám đường + nghiêng vào cua: qua hết `full_course` ≈ 8 s.
- 12 s mô phỏng ≈ 0,5 s CPU (Node).
