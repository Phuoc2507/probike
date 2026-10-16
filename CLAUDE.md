# ProBike — hướng dẫn cho các session

Đọc `PLAN.md` trước. Giao diện, nội dung, comment viết **tiếng Việt**; tên biến/hàm tiếng Anh.

## Môi trường

Cần Node.js ≥ 20 và Git trong PATH hệ thống (Claude Desktop cần `git` để tạo worktree). Máy mới: xem `BAN_GIAO.md` mục 1
(`copy .env.example .env`, `npm install`).

Riêng máy cũ dùng bản portable (MinGit/NodeJS trong LocalAppData): mỗi lệnh PowerShell cần thêm vào PATH trước:

```powershell
$env:Path = "$env:LOCALAPPDATA\NodeJS;$env:LOCALAPPDATA\MinGit\cmd;" + $env:Path
```

- Cài thư viện: `npm install` (worktree mới cần chạy một lần). Hạn chế thêm thư viện mới; nếu thêm phải ghi trong báo cáo cuối.
- Kiểm tra: `npm run build` (tsc + vite) và `npm test` (Vitest) phải qua trước khi báo xong.
- Chạy thử giao diện: `npm run dev` (dùng preview của app, cổng 5173).

## Quy tắc

- Chỉ sửa file trong thư mục được giao (PLAN.md mục 9). Hợp đồng chung ở `src/shared/types.ts`, `src/lib/api.ts`:
  không tự đổi chữ ký; cần đổi thì ghi đề xuất trong báo cáo cuối.
- Alias `@/` = `src/`. Style bằng Tailwind v4, màu thương hiệu trong `src/index.css` (`bg-brand`, `text-ink`, `border-line`...).
- Commit nhỏ, thông điệp tiếng Việt rõ ràng. **Không push** — session điều phối sẽ gộp và đẩy GitHub.
- Supabase project ref: `mzdpczafjotnmozmrhyi`. Chỉ session Backend được chạy migration.
