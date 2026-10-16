# Bàn giao — ProBike (17/10/2026)

File này dành cho **phiên điều phối mới** trên máy khác. Đọc lần lượt: file này → `PLAN.md` (đặc biệt mục 10
"Nhật ký thay đổi hợp đồng") → `CLAUDE.md` → `src/shared/types.ts`. Mỗi phần có README riêng:
`src/sim/README.md` (vật lý, công thức điểm, quy ước dấu), `supabase/README.md` (bảng, RPC, RLS, cấp admin).

---

## 1. Bắt đầu trên máy mới

```bash
git clone https://github.com/Phuoc2507/probike.git
cd probike
copy .env.example .env
npm install
npm run build
npm test
npm run dev
```

- Cần **Node.js ≥ 20** (máy cũ dùng v24) và **Git**. Nên cài bản đầy đủ (Git for Windows, Node LTS) vào PATH hệ thống:
  Claude Desktop cần thấy `git` trong PATH thì mới tạo được worktree cho các session con. Ở máy cũ dùng bản portable
  (MinGit) nên lần đầu cả 5 session đều báo "Git is required but was not found" cho tới khi thêm vào PATH.
- `.env` không nằm trong git; `.env.example` đã có sẵn URL và khoá publishable thật, chỉ cần copy.
- Danh tính commit: `git config user.name "Phuoc2507"` và `git config user.email "phuocphuoc2507@gmail.com"`.
- Mở Claude Desktop thẳng vào thư mục repo (đã là repo git) để tạo được worktree.
- Nếu `git push` từ công cụ PowerShell bị treo vì Git Credential Manager không hiện được hộp đăng nhập: chạy push
  trong tab Terminal của app (`run_in_terminal`).

## 2. Tình trạng hiện tại — tất cả đã nằm trên `main` (commit `97d5bcf`), đã push

| Phần | Thư mục | Ghi chú |
|---|---|---|
| Trang công khai | `src/pages/public/**`, `src/components/site/**` | Trang chủ (sơ đồ sa hình SVG), `/dang-ky`, `/the-le`, `/giai-thuong`; đã kiểm desktop + mobile 375 px |
| Backend + BTC + cộng tác | `supabase/**`, `src/lib/**`, `src/collab/**`, `src/pages/admin/**`, `src/pages/auth/**` | 4 migration **đã áp** lên Supabase; advisors bảo mật 0 cảnh báo; `/dang-nhap` (quên mật khẩu), `/btc/*` |
| Lõi mô phỏng | `src/sim/**` | Rapier headless, bước 1 ms, 6 map, cảm biến có nhiễu/trễ, chấm điểm; xe mẫu giữ thăng bằng ≥ 30 s có đẩy |
| Lập trình xe | `src/code/**` | Runtime Worker có watchdog + sandbox, Blockly tiếng Việt, CodeEditor, xuất Arduino C++, bài hướng dẫn P→PD→PID |
| Lắp ráp 3D | `src/assembly/**` | `Assembler`, `checkDesign`, `VehicleModel`, 3 xe mẫu; catalog thêm 6 linh kiện |
| Trang mô phỏng | `src/pages/sim/**` | `/mo-phong` 3 giai đoạn, Chạy/Dừng/Thi, kênh run, chế độ cá nhân; lazy-load trang nặng |

- `npm run build` qua; `npm test` qua **181/181** (13 file, khoảng 20–80 s tuỳ máy).
- Đã thử tay ở chế độ cá nhân: lắp xe mẫu → cân bằng 37 s có 2 lần đẩy, mở khoá giai đoạn 3 → chạy hết `straight`
  (399 điểm). Không có lỗi console.
- Mọi nhánh con đã gộp; các worktree cũ ở máy cũ không cần mang theo.

### Thay đổi hợp đồng quan trọng
- **Hệ toạ độ tay phải**: x tiến, y lên, **z sang phải**; roll dương = nghiêng phải, yaw dương = rẽ trái
  (trước ghi nhầm "z sang trái"). Sim, lắp ráp, code mẫu và bản xuất Arduino đã khớp.
- `registerTeam` trả thêm trường tuỳ chọn `needsEmailConfirm`.
- Ghi chú BTC về đội tách sang bảng `team_admin_notes` (chỉ admin).
- Cấu hình test (`vite.config.ts`): chỉ quét `src/**/*.test.{ts,tsx}` (tránh quét worktree trong `.claude/`),
  `testTimeout` 60 s vì test vật lý chạy lâu.

### Đã review và sửa (để không làm lại)
Mỗi nhánh được một agent review độc lập rồi trả session sửa. Các lỗi nghiêm trọng đã sửa:
mất workspace khi tải snapshot lỗi; chiếm email/đội qua `pending_team` trước khi xác nhận email; lách giới hạn 1,5 kg
bằng thông số khung âm/NaN; dấu IMU ngược trong bản Arduino; BlocklyEditor ghi đè workspace đội bằng workspace trống;
các đường thoát sandbox (postMessage giả, `import()` động, tắt watchdog qua `performance.now`).

## 3. Việc còn lại

**Cần người thật / BTC:**
1. **Thử chế độ đội với 2 tài khoản thật** trên 2 máy/trình duyệt: đăng ký đội → xác nhận email → thành viên đăng nhập
   được gắn vào đội → cùng sửa khối/code thấy nhau → một người bấm **Thi**, người kia xem chung → kết quả lưu (`runs`,
   `progress`). Đây là phần duy nhất chưa kiểm được.
2. **Cấp quyền admin** cho tài khoản BTC: câu SQL trong `supabase/README.md` mục "Cấp quyền admin".
3. **Supabase Auth → URL Configuration**: Site URL và Redirect URLs (`http://localhost:5173/**` + domain deploy `/**`),
   xem `supabase/README.md`. Giữ bật xác nhận email.
4. **Nội dung BTC cần điền**: lịch trình, giá trị giải thưởng (đang "Đang cập nhật"), thông số bánh xe chính thức,
   thể lệ chấm điểm chính thức (hiện là dự thảo).
5. **Thống nhất thể lệ với mô phỏng**: sim coi **rơi khỏi cầu bập bênh = kết thúc lượt**; PLAN còn để ngỏ
   "quay lại đầu cầu hoặc trừ điểm". Cầu không có vách hai bên (đã bỏ vách trong sim).

**Kỹ thuật (tuỳ chọn):**
6. **Deploy Vercel** (PLAN ghi "sau"): build `npm run build`, thư mục `dist`, cần rewrite SPA về `index.html`, đặt 2 biến
   môi trường `VITE_SUPABASE_*`.
7. Trang `/mo-phong` nặng 7,3 MB (2,5 MB gzip), chủ yếu Rapier nhúng WASM + three + Blockly. Có thể tách Blockly/
   Arduino thành chunk riêng, tải khi mở tab.
8. Lỗi nhỏ thấy khi thử: chuyển giai đoạn Cân bằng → Sa hình thì bảng kết quả vẫn hiện kết quả lượt trước cho tới khi chạy lại.
9. Rủi ro còn lại đã chấp nhận: người có email thật đã xác nhận vẫn có thể khai email người khác làm thành viên để
   "giữ chỗ"; BTC gỡ ở `/btc` (xoá thành viên).
10. Điểm `runs` do client tự khai (giới hạn cố hữu của mô phỏng chạy trên trình duyệt). Vòng thi chính thức nên chạy lại
    trên máy BTC với code đội đã nộp.

## 4. Cách làm việc đã dùng (nên giữ)

- Phiên điều phối giao việc cho session con (mỗi session một worktree, chỉ sửa thư mục được giao, không push).
- Khi session báo xong: agent review độc lập (chỉ đọc) → gửi danh sách sửa về session → kiểm lại lỗi nghiêm trọng
  → thử `git merge-tree` → **hỏi người dùng** → gộp `--no-ff` → build/test → push.
- Hợp đồng chung (`src/shared/**`, `vite.config.ts`, `src/App.tsx`, `PLAN.md`) do phiên điều phối sửa, ghi vào PLAN mục 10.
- Supabase: chỉ một session được chạy migration; migration lưu file trong `supabase/migrations`.

## 5. Nhắc khi rời máy công cộng

Đăng xuất GitHub trên trình duyệt và xoá mục `git:https://github.com` trong Windows Credential Manager.
