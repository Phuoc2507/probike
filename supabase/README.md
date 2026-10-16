# Supabase — ProBike

Project ref `mzdpczafjotnmozmrhyi`. Migration trong `migrations/` đã được áp lên project (chỉ session Backend chạy migration).

## Bảng

| Bảng | Ghi chú |
|---|---|
| `profiles` | tạo tự động khi có tài khoản mới (trigger `on_auth_user_created`). Người dùng chỉ sửa được `full_name`, `school`, `phone` — **không** sửa được `role` |
| `teams` | `status` pending/approved/rejected. Tên đội duy nhất (không phân biệt hoa thường) |
| `team_admin_notes` | ghi chú của BTC về đội — **chỉ admin** (tách khỏi `teams` để thành viên không đọc được) |
| `team_members` | tối đa 5 người/đội (trigger), mỗi email và mỗi tài khoản chỉ thuộc 1 đội |
| `workspaces` | `ydoc_snapshot` (bytea, cập nhật Yjs đầy đủ), `design` (jsonb, bản sao để BTC xem nhanh) |
| `runs` | lịch sử lượt chạy (`result`, `design` tại thời điểm chạy, `score`, `time_s`) |
| `progress` | `stage_reached`, `balance_best_s`, `best_score` — thành viên KHÔNG ghi thẳng được; chỉ qua RPC `update_progress` (kiểm tra thành viên, chỉ tăng) |
| `budget_items` | chi phí tổ chức — **chỉ admin**; đã điền sẵn 18 dòng ước lượng |

## RPC (gọi qua `supabase.rpc`)

| Hàm | Ai gọi | Việc |
|---|---|---|
| `check_team_registration(p_team_name, p_emails[])` | anon, authenticated | tối đa 6 email; trả `{name_taken, any_email_taken}` (chỉ đúng/sai, không lộ email nào) |
| `register_team(p_team_name, p_school, p_leader_name, p_leader_phone, p_members jsonb)` | authenticated | tạo đội nguyên tử cho người đã đăng nhập (trả team id) |
| `claim_membership()` | authenticated | gắn tài khoản (email đã xác nhận) vào dòng `team_members` cùng email; trả team id |
| `update_progress(p_team, p_stage, p_balance, p_score)` | thành viên đội | upsert tiến độ, lấy `greatest`; người ngoài đội bị từ chối |

Phần cần quyền cao nằm trong schema `private` (không lộ qua API): `create_team`, `link_member_rows`, `is_admin`, `my_team_ids`, `handle_new_user`.

## Đăng ký đội & gắn thành viên

1. Trưởng nhóm điền form `/dang-ky` → `api.registerTeam()` gọi `auth.signUp`, thông tin đội nằm chờ trong metadata
   `pending_team`. **Đội chỉ được tạo khi trưởng nhóm bấm link xác nhận email** (trigger `on_auth_user_confirmed`):
   đội + các dòng thành viên + progress + workspace tạo trong một transaction. Nếu lúc xác nhận tên đội đã bị lấy thì
   bỏ qua (không chặn xác nhận) — trưởng nhóm đăng nhập rồi đăng ký lại; khi đã đăng nhập, form dùng RPC `register_team`
   (không cần mật khẩu).
2. Thành viên: dòng `team_members` được tạo với `user_id = null`. Chỉ khi **chính người đó** xác nhận email / đăng nhập
   bằng đúng email trưởng nhóm đã khai báo (tab **Link qua email** hoặc **Thành viên mới** ở `/dang-nhap`) thì tài khoản
   mới được gắn vào đội (trigger xác nhận email; người có tài khoản từ trước thì `getMyTeam()` gọi `claim_membership()`).
   Không cần mã mời.
3. Giới hạn còn lại: trưởng nhóm có thể khai email của người khác; email đó bị giữ cho đội ấy cho tới khi BTC xoá dòng
   thành viên (bảng `team_members`, policy admin delete). Nếu một đội báo "email đã thuộc đội khác", BTC kiểm tra và xoá.

## Giới hạn cố hữu: điểm do trình duyệt tự khai

Mô phỏng chạy trong trình duyệt của thí sinh, nên `runs.score`, `runs.time_s`, `progress.*` là số **client gửi lên**
(RLS chỉ đảm bảo đúng đội, không đảm bảo đúng kết quả). Bảng tiến độ dùng để theo dõi; kết quả chính thức phải chấm ở
vòng thi thật (hoặc BTC chạy lại mô phỏng từ `runs.design` + code của đội).

## Realtime

Kênh private `team:<team_id>` — policy trên `realtime.messages` chỉ cho thành viên đội nhận/gửi broadcast & presence.

## Cấp quyền admin (chạy trong SQL Editor của Supabase)

```sql
-- Người đó phải đã có tài khoản (đăng ký/đăng nhập ít nhất một lần)
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'email-btc@example.com');

-- Thu hồi
update public.profiles set role = 'member'
where id = (select id from auth.users where email = 'email-btc@example.com');
```

## Cấu hình Auth cần làm trên dashboard

- Authentication → URL Configuration: **Site URL** = domain thật; **Redirect URLs** thêm `http://localhost:5173/**`
  và domain Vercel `/**` (link xác nhận email, magic link, đặt lại mật khẩu đều trỏ về `/dang-nhap`).
- Email mặc định của Supabase giới hạn vài thư/giờ — trước khi mở đăng ký nên cấu hình SMTP riêng.
- Nếu tắt "Confirm email": ai cũng có thể tạo tài khoản bằng email bất kỳ rồi được gắn vào đội có email đó.
  **Nên giữ bật xác nhận email.**
