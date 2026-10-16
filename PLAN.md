# ProBike — Kế hoạch tổng thể

Cuộc thi học thuật **xe máy tự cân bằng** chạy trong sa hình. Website gồm trang giới thiệu/đăng ký, thể lệ, giải thưởng,
trình **mô phỏng & luyện tập** (lắp ráp xe → lập trình cân bằng PID → chạy sa hình), không gian làm việc chung realtime
cho mỗi đội, và các trang ẩn cho ban tổ chức (BTC).

> Mọi session làm việc trên repo này PHẢI đọc file này và `CLAUDE.md` trước khi bắt đầu.

---

## 1. Quyết định đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| Frontend | Vite + React 18 + TypeScript, React Router, Tailwind CSS v4, Zustand |
| 3D & vật lý | three.js + @react-three/fiber + drei (hiển thị); **Rapier** (`@dimforge/rapier3d-compat`) cho vật lý |
| Lập trình xe | **Cả hai**: kéo thả Blockly **và** viết code JavaScript kiểu Arduino (`setup()` / `loop()`). Blockly sinh ra JS; có nút “Xem code Arduino C++” để mang sang xe thật |
| Cơ cấu cân bằng | **Bánh đà (reaction wheel)** — động cơ quay bánh đà quanh trục dọc xe để tạo mô-men chống đổ |
| Backend | Supabase project `probike` (ref `mzdpczafjotnmozmrhyi`, Singapore): Auth, Postgres + RLS, Realtime |
| Cộng tác realtime | Yjs document cho mỗi đội, đồng bộ qua Supabase Realtime (broadcast) + presence; snapshot lưu bảng `workspaces` |
| Deploy | Vercel (sau) — code để trên GitHub `Phuoc2507/probike` |
| Ngôn ngữ giao diện | Tiếng Việt |

## 2. Luật “xe hợp lệ” (dùng cho cả web và thi thật)

- Xe **giống xe máy**: đúng **2 bánh**, hai bánh **nằm trên cùng một đường thẳng** (đồng phẳng, không lệch ngang).
- Chỉ dùng **bánh xe do BTC phát** (trong web: item `wheel_btc`, không chỉnh được kích thước). Thông số mặc định
  (sẽ cập nhật khi BTC chọn được bánh thật): đường kính 68 mm, rộng 26 mm, cao su, 35 g.
- Bánh sau (hoặc trước) có thể gắn động cơ kéo; bánh trước có thể gắn servo lái (không bắt buộc).
- Cân bằng bằng **bánh đà** (khuyến nghị). Không được có bánh phụ, chân chống chạm đất khi chạy.
- Kích thước tối đa: dài 35 cm × rộng 15 cm × cao 30 cm. Khối lượng tối đa 1,5 kg.
- Ngân sách gợi ý mỗi đội: **≤ 1.000.000 đ** (5 người × ~200.000 đ). Web hiển thị tổng chi phí linh kiện khi lắp ráp,
  vượt ngân sách thì cảnh báo (không chặn).

## 3. Sa hình (map thật và map mô phỏng)

Map thật làm bằng **carton phủ sơn**, dựng vách hai bên tạo thành đường hành lang, xe đi giữa hai vách.
Map mô phỏng phải dùng **cùng kích thước** để thí sinh tinh chỉnh dễ.

- Kích thước tổng (đề xuất): 4,0 m × 2,5 m. Lòng đường rộng **50 cm**, vách cao **15 cm**, vách màu trắng, nền xám.
- Thứ tự đoạn đường:
  1. **Xuất phát** — đoạn thẳng 1,2 m (ô xuất phát có vạch).
  2. **Cua chữ U** — bán kính tâm đường 60 cm, quay đầu 180°.
  3. **Cầu bập bênh** — dài 1,0 m, rộng **25 cm**, trục xoay giữa cầu, nghiêng tối đa ±10°, dốc lên cao 8 cm; hai bên cầu
     không có vách (rơi xuống = trượt khỏi cầu, phải quay lại đầu cầu hoặc bị trừ điểm — xem thể lệ).
  4. **Bãi đá** — dài 80 cm, đá dăm/sỏi dán cố định, cao 0,5–1,5 cm.
  5. **Đích** — đoạn thẳng 0,8 m, vạch đích.
- Có **checkpoint** ở cuối mỗi đoạn (dùng để chấm điểm và tiến độ).
- Map luyện tập trong web: `balance_flat` (sàn phẳng, có đẩy ngẫu nhiên), `straight`, `u_turn`, `seesaw`, `rocks`, `full_course`.
- Toàn bộ số đo nằm trong `src/sim/maps/spec.ts` — một nguồn duy nhất, sửa ở đó là cả web cập nhật.

## 4. Cấu trúc website

| Đường dẫn | Trang | Ai xem |
|---|---|---|
| `/` | Landing: giới thiệu, video/ảnh 3D xe, sa hình, lịch trình, nút **Đăng ký** | công khai |
| `/dang-ky` | Đăng ký đội (tên đội, trường, 5 thành viên, người liên hệ) — tạo tài khoản trưởng nhóm | công khai |
| `/dang-nhap` | Đăng nhập (email + mật khẩu / magic link) | công khai |
| `/the-le` | Thể lệ: luật xe, sa hình, cách chấm điểm, vòng thi, lịch | công khai |
| `/giai-thuong` | Giải thưởng | công khai |
| `/mo-phong` | Trình mô phỏng — chưa đăng nhập: chế độ luyện tập cá nhân (lưu localStorage) | công khai |
| `/mo-phong/doi` | Không gian làm việc **chung của đội** (realtime) | thành viên đội |
| `/btc` | Trang ẩn BTC (không có link trên menu, cần quyền `admin`) | BTC |
| `/btc/chi-phi` | Chi phí tổ chức cuộc thi (bảng dự toán, sửa được, tổng tự động) | BTC |
| `/btc/doi` | Danh sách đội đăng ký, duyệt đội | BTC |
| `/btc/doi/:id` | Chi tiết đội: thành viên, thiết kế xe, lịch sử chạy | BTC |
| `/btc/tien-do` | Tiến độ các đội (giai đoạn đạt được, điểm tốt nhất) | BTC |

## 5. Trình mô phỏng — 3 giai đoạn

1. **Lắp ráp** — chọn khung (chiều dài trục bánh, chiều cao), gắn linh kiện từ kho (vi điều khiển, IMU, laser ToF,
   hồng ngoại, siêu âm, encoder, động cơ, bánh đà, driver, pin...) lên khung bằng kéo thả 3D, đặt tên cho từng linh kiện,
   gán chân cắm. Hiện khối lượng, trọng tâm, tổng chi phí, kiểm tra luật (mục 2).
2. **Cân bằng (PID)** — hướng dẫn từng bước: đọc góc nghiêng từ IMU → điều khiển bánh đà → P → PD → PID; biểu đồ
   góc nghiêng/thời gian realtime, thanh trượt chỉnh Kp/Ki/Kd. **Mở khoá giai đoạn 3** khi giữ thăng bằng ≥ 30 giây trên
   `balance_flat` có nhiễu đẩy.
3. **Sa hình** — chạy từng đoạn rồi toàn bộ `full_course`. Bấm **Thi** → kết quả (thời gian, checkpoint, điểm) lưu vào
   lịch sử đội.

Cảm biến mô phỏng (đều có nhiễu, giới hạn tầm, tần số cập nhật, độ trễ — có nút “độ thực tế” thấp/vừa/cao):
IMU (MPU6050: roll/pitch/yaw, gyro, accel), encoder bánh/bánh đà, siêu âm HC-SR04 (chùm nón ~15°, 2–400 cm),
laser ToF VL53L0X/VL53L1X (tia hẹp, ≤ 2 m / 4 m), hồng ngoại đo khoảng cách Sharp (đường cong analog phi tuyến),
hồng ngoại phản xạ (dò vạch/nền), LiDAR 360° (tuỳ chọn, đắt).

## 6. Hợp đồng giữa các phần (KHÔNG tự ý đổi — đổi phải ghi vào mục 9)

Tất cả kiểu dùng chung nằm ở **`src/shared/types.ts`** và kho linh kiện ở **`src/shared/catalog.ts`**.

- Hệ toạ độ: mét, **x tiến về trước, y hướng lên, z sang trái**. Gốc toạ độ của xe = trung điểm hai điểm tiếp đất của bánh.
- `VehicleDesign` (JSON) — đầu ra của Lắp ráp, đầu vào của Mô phỏng, lưu trong workspace.
- `SimEngine` — lõi vật lý **headless** (không phụ thuộc React/three), chạy theo bước cố định 1 ms, mỗi chu kỳ điều khiển
  trả `SensorFrame` và nhận `ActuatorCommand`. Phần hiển thị 3D chỉ đọc `SimSnapshot`.
- `ControllerRuntime` — chạy code người dùng trong **Web Worker**, khoá bước (lockstep) với mô phỏng, có watchdog
  chống vòng lặp vô hạn. API cho thí sinh: xem mục 7.
- `TeamWorkspace` — Yjs doc gồm: `design` (VehicleDesign), `blockly` (JSON workspace), `code` (Y.Text), `mode`
  ('blocks' | 'code'), `params` (Kp/Ki/Kd...), `run` (trạng thái lượt chạy đang phát).

## 7. API lập trình cho thí sinh (JavaScript kiểu Arduino)

```js
const pid = new PID(20, 0, 1.5);         // Kp, Ki, Kd

function setup() {
  print("Xe khởi động");
}

function loop() {                          // gọi mỗi chu kỳ điều khiển (tần số tuỳ vi điều khiển)
  const goc = imu.roll();                  // độ, nghiêng trái dương
  const tocDoGoc = imu.gyroX();            // độ/giây
  const u = pid.update(0 - goc, dt());     // dt() = giây kể từ lần loop trước
  motor("banhDa", u);                      // -1..1, tên = tên đặt khi lắp ráp
  motor("dongCoSau", 0.4);
  servo("lai", 0);                         // độ
  const truoc = read("laserTruoc");        // cm (ToF/siêu âm/IR) hoặc 0/1 (IR phản xạ)
  if (truoc < 20) motor("dongCoSau", 0);
  plot("goc", goc);                        // vẽ lên biểu đồ
}
```

Hàm có sẵn: `millis()`, `dt()`, `read(name)`, `imu.roll() / pitch() / yaw() / gyroX() / gyroY() / gyroZ() / accX()...`,
`encoder(name)` (vòng/giây), `motor(name, v)`, `servo(name, deg)`, `print(...)`, `plot(label, value)`, `constrain`,
`map`, lớp `PID(kp, ki, kd)` có `.update(error, dt)` và `.reset()`. Blockly có khối tương ứng 1-1.

## 8. Cơ sở dữ liệu (Supabase)

- `profiles` (id = auth.uid, full_name, school, phone, role: 'member' | 'admin')
- `teams` (id, name, school, leader_id, status: 'pending' | 'approved' | 'rejected', created_at)
- `team_members` (team_id, user_id null được, full_name, email, phone, role_in_team) — tối đa 5 người
- `workspaces` (team_id PK, ydoc_snapshot bytea, design jsonb, updated_at)
- `runs` (id, team_id, user_id, map_id, result jsonb, score, time_s, created_at)
- `progress` (team_id, stage_reached 1–3, balance_best_s, best_score, updated_at)
- `budget_items` (id, category, name, qty, unit_price, note, sort) — chi phí tổ chức, chỉ admin
- RLS: thành viên chỉ đọc/ghi dữ liệu đội mình; admin đọc tất cả; `budget_items` chỉ admin.

## 9. Phân công các session (nhân viên)

Session 0 (điều phối, session hiện tại): khung dự án, hợp đồng, gộp nhánh, đẩy GitHub.

| # | Session | Thư mục được sửa | Xong khi |
|---|---|---|---|
| 1 | **Trang công khai** | `src/pages/public/**`, `src/components/site/**`, `public/images/**` | Landing, đăng ký (form gọi `src/lib/api.ts`), thể lệ, giải thưởng đẹp, responsive |
| 2 | **Lõi mô phỏng vật lý** | `src/sim/**` | `SimEngine` chạy headless, xe bánh đà giữ thăng bằng được với PID mẫu, đủ 6 map, đủ cảm biến, test Vitest |
| 3 | **Lập trình xe** | `src/code/**` | Blockly + code editor + Worker runtime + PID helper + xuất Arduino C++, test runtime |
| 4 | **Lắp ráp xe** | `src/assembly/**`, `src/shared/catalog.ts` | Trình lắp ráp 3D, kiểm tra luật, tính khối lượng/trọng tâm/chi phí, xuất `VehicleDesign` |
| 5 | **Backend + BTC + cộng tác** | `supabase/**`, `src/lib/**`, `src/collab/**`, `src/pages/admin/**`, `src/pages/auth/**` | Migration + RLS, auth, đăng ký đội, trang ẩn BTC, Yjs-Supabase realtime |
| 6 | **Ghép trang mô phỏng** (sau 2–5) | `src/pages/sim/**` | Trang `/mo-phong` ghép 3 giai đoạn, hướng dẫn PID, nút Thi chung đội |

Quy tắc: chỉ sửa file trong thư mục của mình; cần đổi `src/shared/**`, `package.json`, `src/App.tsx` thì ghi rõ trong
báo cáo cuối để session 0 gộp. Mỗi session làm trên nhánh riêng (worktree), commit thường xuyên, **không push**.

## 10. Nhật ký thay đổi hợp đồng

- (trống)
