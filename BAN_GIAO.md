# Bàn giao — ProBike (16/10/2026)

File này dành cho **phiên điều phối mới** mở trong thư mục `C:\Users\Administrator\Downloads\probike`.
Đọc lần lượt: file này → `PLAN.md` → `CLAUDE.md` → `src/shared/types.ts` → `src/shared/catalog.ts`.

---

## 1. Tình trạng hiện tại

**Đã xong:**
- Kế hoạch tổng thể `PLAN.md`: luật xe, sa hình, danh sách trang, 3 giai đoạn mô phỏng, hợp đồng giữa các phần,
  API lập trình cho thí sinh, schema database, bảng phân công.
- Khung dự án Vite 8 + React 18 + TypeScript + Tailwind v4, đã cài đủ thư viện (three, @react-three/fiber 8, drei 9,
  Rapier compat, Blockly 13, CodeMirror, Yjs, Supabase JS, Zustand, Recharts, Vitest). `npm run build` và `npm test` đều chạy qua.
- Routes trong `src/App.tsx`. Mỗi trang hiện là trang tạm, chờ các session thay bằng trang thật.
- Hợp đồng chung: `src/shared/types.ts`, `src/shared/catalog.ts` (26 linh kiện kèm giá và thông số), `src/lib/api.ts` (mới có chữ ký hàm).
- Supabase project **probike**: ref `mzdpczafjotnmozmrhyi`, tổ chức Geo3D, vùng Singapore, gói Free. Database còn trống.
  URL và khoá publishable đã nằm trong `.env`.
- GitHub: commit `8435cd8` đã được đẩy lên `main` của https://github.com/Phuoc2507/probike.

**Chưa commit:** chỉ có file `BAN_GIAO.md` này. Phiên mới cần commit file này rồi đẩy lên.

**Sự cố:** 5 session con không khởi động được, vì phiên cũ mở thư mục khi nó chưa phải repo git, nên Claude Desktop
không tạo được worktree. Phiên mới mở thẳng vào repo này sẽ tạo được.

## 2. Môi trường máy (máy net, không cài sẵn gì)

- Node.js và Git là bản portable. Thêm vào PATH trước mỗi lệnh PowerShell:
  `$env:Path = "$env:LOCALAPPDATA\NodeJS;$env:LOCALAPPDATA\MinGit\cmd;" + $env:Path`
- Trong app, đường dẫn thật là `C:\Users\Administrator\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\MinGit\cmd\git.exe`
  (tương tự với `...\Local\NodeJS`).
- **`git push` không chạy được từ công cụ PowerShell** vì Git Credential Manager không hiện được hộp thoại đăng nhập.
  Hãy chạy lệnh push trong tab Terminal của app (`run_in_terminal`) bằng đường dẫn đầy đủ của git.exe ở trên.
  Người dùng đã đăng nhập GitHub một lần qua trình duyệt nên các lần push sau sẽ chạy được.
- Danh tính commit đã đặt trong repo: `Phuoc2507 <phuocphuoc2507@gmail.com>`.
- Nhắc người dùng: trước khi rời quán net, đăng xuất GitHub và xoá thông tin đăng nhập trong Windows Credential Manager.

## 3. Việc của phiên điều phối mới

1. Commit `BAN_GIAO.md` rồi push.
2. Khởi động **5 session song song**, mỗi session một worktree hoặc nhánh riêng, dùng nguyên văn **Bối cảnh chung** (mục 4)
   và **Đề bài** của từng session (mục 5). Tên nhánh gợi ý: `sim-core`, `code-runtime`, `assembly`, `public-site`, `backend`.
3. Khi các session báo xong: kiểm tra diff, **hỏi người dùng** trước khi gộp từng nhánh vào `main`, xử lý xung đột ở
   `src/shared/**`, `package.json`, `src/App.tsx`, chạy `npm run build` và `npm test`, rồi push.
4. Sau đó giao **session 6: Ghép trang mô phỏng** (mục 5.6).
5. Ghi mọi thay đổi hợp đồng vào `PLAN.md` mục 10.

## 4. Bối cảnh chung (dán vào phần background của mọi session)

> ProBike là website cho một cuộc thi học thuật **xe máy tự cân bằng**. Mỗi đội 5 người tự thiết kế xe giống xe máy:
> 2 bánh thẳng hàng, dùng bánh do BTC phát, cân bằng bằng bánh đà (reaction wheel), lập trình PID, chạy trong sa hình
> carton phủ sơn có vách hai bên gồm đường thẳng, cua chữ U, cầu bập bênh và bãi đá. Chi phí dự kiến khoảng 1.000.000 đ
> mỗi đội. Web gồm: trang công khai và đăng ký đội; trình mô phỏng (lắp ráp xe → lập trình PID cân bằng → chạy sa hình),
> trong đó mỗi đội có một không gian làm việc chung realtime (một người kéo khối thì cả đội thấy, một người bấm Thi thì
> cả đội cùng xem và nhận kết quả); các trang ẩn cho BTC (chi phí tổ chức, danh sách đội, thành viên, tiến độ).
> Stack: Vite + React 18 + TS, React Router 6, Tailwind v4, three.js + @react-three/fiber 8 + drei 9,
> Rapier (`@dimforge/rapier3d-compat`), Blockly 13, CodeMirror, Yjs, Supabase (ref `mzdpczafjotnmozmrhyi`).
> Khung dự án đã có trên `main`: `PLAN.md` (kế hoạch đầy đủ, hợp đồng, phân công), `CLAUDE.md` (cách dùng Node/Git
> portable trên máy này, quy tắc), `src/shared/types.ts`, `src/shared/catalog.ts`, `src/lib/api.ts`. 5 session làm
> song song, mỗi session một thư mục riêng; không push. Người dùng là người Việt, giao diện và nội dung bằng tiếng Việt.

## 5. Đề bài từng session

### 5.1 Lõi mô phỏng vật lý (nhánh `sim-core`, chỉ sửa `src/sim/**`)

Hiện thực `SimEngine` (interface trong `src/shared/types.ts`) chạy **headless** (không import React/three), dùng Rapier,
bước vật lý cố định 1 ms. Mỗi lần `step(cmd)` chạy đúng một chu kỳ điều khiển (= 1 / `controller.loopHz`).
1. Dựng xe từ `VehicleDesign`:
   - Thân cứng gồm khung và linh kiện; tính khối lượng, trọng tâm, quán tính.
   - 2 bánh `wheel_btc` nối bằng khớp quay.
   - Động cơ kéo nhận lệnh -1..1, mô-men tuyến tính theo stallTorque và noLoadRpm.
   - Servo lái bánh trước (tuỳ chọn).
   - **Bánh đà**: động cơ loại `reaction` cùng đĩa `flywheel` (gắn qua `attachTo`) quay quanh trục dọc x. Mô-men phản lực
     lên thân giữ thăng bằng; tốc độ bánh đà có giới hạn (bão hoà).
2. `src/sim/maps/spec.ts` là nguồn số đo duy nhất của sa hình, lấy theo PLAN.md mục 3. Hiện thực 6 map: `balance_flat`,
   `straight`, `u_turn`, `seesaw` (cầu xoay ±10°, không có vách), `rocks` (đá sinh theo seed), `full_course`, mỗi đoạn có
   checkpoint. Xuất thêm dữ liệu hình học để phần hiển thị 3D vẽ được.
3. Cảm biến:
   - Gồm IMU, encoder, siêu âm (nhiều tia trong nón, lấy giá trị gần nhất), ToF laser (1 tia), IR Sharp (đường cong phi
     tuyến), IR phản xạ (0/1), LiDAR 360.
   - Có nhiễu Gauss theo seed, giữ đúng tần số `rateHz`, có độ trễ.
   - `realism` low / medium / high nhân hệ số nhiễu.
4. Kết thúc và chấm điểm:
   - Ngã (|roll| > 45° hoặc thân chạm đất) → `fell`; ra khỏi map → `out_of_bounds`; hết giờ → `timeout`; qua đích → `completed`.
   - Tính `balancedS`, `maxRollDeg`, `score`. Ghi rõ công thức điểm.
5. `push(impulse)` và nhiễu đẩy ngẫu nhiên khi `disturbances` bật.
6. Thiết kế mẫu `src/sim/sampleDesign.ts` (ESP32, MPU6050, BLDC + đĩa thép, N20, pin 18650) cùng bộ PID mẫu bằng TS,
   chứng minh được: giữ thăng bằng ≥ 30 s trên `balance_flat` có đẩy, và chạy hết `straight`.
7. Test Vitest headless (`await RAPIER.init()`).

Xong khi build và test qua, đã commit. Báo cáo cuối: API đã xuất, công thức điểm, tham số vật lý chính, đề xuất đổi `src/shared/**`.

### 5.2 Lập trình xe (nhánh `code-runtime`, chỉ sửa `src/code/**`)

1. **Runtime** hiện thực `ControllerRuntime`:
   - Chạy code thí sinh (JS kiểu Arduino: `setup()` / `loop()`) trong **Web Worker**.
   - Khoá bước: `tick(frame)` gọi `loop()` một lần và trả về `ActuatorCommand`.
   - Watchdog khoảng 50 ms mỗi tick. Báo lỗi bằng tiếng Việt, kèm số dòng.
   - API đúng PLAN.md mục 7.
   - Chặn DOM và mạng: fetch, importScripts, XMLHttpRequest, WebSocket.
   - Tách lõi khỏi lớp Worker để test được trong Node.
2. **Blockly**:
   - Khối tiếng Việt khớp 1-1 với API (dropdown tên linh kiện, IMU, motor, servo, PID, plot, print, cùng các khối chuẩn).
   - Generator sinh ra JS.
   - Component `BlocklyEditor { partNames, value(JSON), onChange }` phát thay đổi theo từng thao tác khối, và nhận được
     thay đổi từ ngoài vào mà không lặp sự kiện (để nối Yjs).
3. **CodeEditor** dùng CodeMirror: gợi ý API và tên linh kiện, đánh dấu dòng lỗi.
4. **Xuất Arduino C++** từ Blockly (MPU6050, TB6612, Servo.h), có comment tiếng Việt ở chỗ cần chỉnh chân cắm.
   Có component để xem và copy.
5. Code mẫu PID (cả dạng khối và dạng JS), kèm bài hướng dẫn P → PD → PID dạng dữ liệu.
6. Test Vitest: PID, watchdog, lỗi, chặn API nguy hiểm, Blockly → JS chạy được.

Xong khi build và test qua, có `src/code/index.ts`, đã commit.

### 5.3 Lắp ráp xe 3D (nhánh `assembly`, chỉ sửa `src/assembly/**` và `src/shared/catalog.ts` — chỉ được thêm, không đổi id)

1. `checkDesign(design): DesignCheck` có test:
   - Kiểm tra luật: đúng 2 bánh `wheel_btc` thẳng hàng; kích thước ≤ 35×15×30 cm; khối lượng ≤ 1,5 kg; đúng 1 vi điều
     khiển; motor reaction phải có flywheel; không chồng lấn; không chạm đất.
   - Tính khối lượng, trọng tâm, chi phí; cảnh báo khi vượt 1.000.000 đ.
   - Thông báo lỗi tiếng Việt, dễ hiểu với học sinh.
2. Component `Assembler { design, onChange }` (controlled):
   - Thanh trượt chỉnh khung; 2 bánh tự đặt đúng trục.
   - Kho linh kiện chia theo nhóm; kéo linh kiện vào để gắn.
   - Gizmo di chuyển/xoay, bắt lưới 5 mm.
   - Đổi tên linh kiện (kiểm tra trùng), chọn chân cắm, xoá.
   - Hiển thị tia/nón của cảm biến.
   - Bảng thông tin: khối lượng, trọng tâm, chi phí/ngân sách, lỗi và cảnh báo.
3. Mô hình 3D linh kiện nhìn nhận ra được. Xuất `VehicleModel` để trang mô phỏng dùng lại.
4. 2–3 xe mẫu khởi đầu.
5. Trang thử `src/assembly/AssemblerDemo.tsx`, kiểm tra bằng `npm run dev`.

Xong khi build và test qua, có `src/assembly/index.ts`, đã commit.

### 5.4 Trang công khai (nhánh `public-site`, chỉ sửa `src/pages/public/**`, `src/components/site/**`, `public/images/**`)

1. `SiteLayout`: header (logo, menu, nút Đăng ký và Đăng nhập), footer, menu cho mobile.
2. Landing `/`:
   - Hero (xe 3D xoay hoặc SVG), giới thiệu cuộc thi, 3 giai đoạn luyện tập.
   - Sơ đồ sa hình SVG theo PLAN.md mục 3.
   - Lịch trình (để placeholder), đối tượng tham gia, chi phí dự kiến, FAQ, nút kêu gọi đăng ký.
3. Đăng ký `/dang-ky`:
   - Form gồm: tên đội, trường; trưởng nhóm (họ tên, email, SĐT, mật khẩu); tối đa 4 thành viên khác.
   - Kiểm tra hợp lệ bằng tiếng Việt, gọi `registerTeam` (không đổi chữ ký).
4. Thể lệ `/the-le`:
   - Luật xe, sa hình, cách chấm điểm (bản dự thảo), vòng thi, làm việc nhóm, nộp bài, khiếu nại.
   - Mục lục bám dính bên trái.
5. Giải thưởng `/giai-thuong`: Nhất / Nhì / Ba / Khuyến khích và các giải phụ; giá trị để "Đang cập nhật".
6. Kiểm tra trên desktop và mobile.

Xong khi build qua, đã commit. Báo cáo cuối liệt kê những gì BTC cần điền.

### 5.5 Backend + BTC + cộng tác (nhánh `backend`, chỉ sửa `supabase/**`, `src/lib/**`, `src/collab/**`, `src/pages/admin/**`, `src/pages/auth/**`)

Chỉ session này được chạy migration. Lưu migration thành file trong `supabase/migrations`.
1. Schema theo PLAN.md mục 8:
   - RLS chặt: thành viên chỉ thấy đội mình, admin thấy tất cả, `budget_items` chỉ admin.
   - Trigger tạo profile; RPC đăng ký đội chạy nguyên tử.
   - Kiểm tra bằng `get_advisors` (security).
2. Hiện thực `src/lib/api.ts` (giữ chữ ký, được thêm hàm), cùng `useAuth` và `useMyTeam`. Chọn cách gắn thành viên vào
   đội đơn giản nhất và ghi rõ đã làm thế nào.
3. Trang `/dang-nhap`, có chức năng quên mật khẩu.
4. Trang `/btc/*`:
   - Kiểm tra quyền admin; không phải admin thì hiện 404 giả.
   - **Chi phí tổ chức**: bảng sửa trực tiếp, nhóm theo hạng mục, tự cộng tổng, điền sẵn vài dòng ước lượng.
   - **Đội đăng ký**: duyệt / từ chối, tìm kiếm, xuất CSV.
   - **Chi tiết đội**.
   - **Tiến độ**.
   - Ghi câu SQL cấp quyền admin.
5. `src/collab/**`:
   - Provider Yjs qua Supabase Realtime broadcast, kèm presence.
   - Snapshot lưu vào `workspaces` (có debounce).
   - Doc gồm `design`, `blockly`, `code` (Y.Text), `mode`, `params`, `run`.
   - Hook `useTeamWorkspace(teamId)` và các binding.
   - Kênh "run": sự kiện bắt đầu, luồng SimSnapshot khoảng 20 Hz, kết quả cuối.
   - Chế độ cá nhân khi chưa đăng nhập (lưu localStorage).
6. Test Vitest cho phần không cần mạng.

Xong khi build và test qua, migration đã áp, advisors không còn lỗi bảo mật nghiêm trọng, đã commit.

### 5.6 Ghép trang mô phỏng (làm SAU khi 5.1–5.5 đã gộp vào `main`; chỉ sửa `src/pages/sim/**`)

Trang `/mo-phong` ghép 3 giai đoạn:
- **Lắp ráp**: dùng Assembler.
- **Cân bằng**: bài hướng dẫn PID, thanh trượt Kp/Ki/Kd, biểu đồ góc nghiêng, nút "đẩy". Mở khoá giai đoạn 3 khi giữ
  thăng bằng ≥ 30 s.
- **Sa hình**: chọn map, hiển thị 3D bằng VehicleModel cùng hình học map.

Ngoài ra:
- Chuyển qua lại giữa khối và code.
- Thanh công cụ: Chạy / Dừng / **Thi**. Khi Thi, cả đội xem chung qua kênh run và kết quả được lưu `saveRun`.
- Hiện thành viên đang online. Cập nhật tiến độ.
- Có chế độ luyện tập cá nhân khi chưa đăng nhập.
