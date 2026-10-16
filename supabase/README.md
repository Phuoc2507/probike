# Supabase — ProBike

Project ref `mzdpczafjotnmozmrhyi`. Migration trong `migrations/` đã được áp lên project (chỉ session Backend chạy migration).

## Bảng

| Bảng | Ghi chú |
|---|---|
| `profiles` | tạo tự động khi có tài khoản mới (trigger `on_auth_user_created`). Người dùng chỉ sửa được `full_name`, `school`, `phone` — **không** sửa được `role` |
| `teams` | `status` pending/approved/rejected, `admin_note` (chỉ BTC thấy qua trang BTC). Tên đội duy nhất (không phân biệt hoa thường) |
| `team_members` | tối đa 5 người/đội (trigger), mỗi email và mỗi tài khoản chỉ thuộc 1 đội |
| `workspaces` | `ydoc_snapshot` (bytea, cập nhật Yjs đầy đủ), `design` (jsonb, bản sao để BTC xem nhanh) |
| `runs` | lịch sử lượt chạy (`result`, `design` tại thời điểm chạy, `score`, `time_s`) |
| `progress` | `stage_reached`, `balance_best_s`, `best_score` — chỉ tăng (RPC `update_progress`) |
| `budget_items` | chi phí tổ chức — **chỉ admin**; đã điền sẵn 18 dòng ước lượng |

## RPC (gọi qua `supabase.rpc`)

| Hàm | Ai gọi | Việc |
|---|---|---|
| `check_team_registration(p_team_name, p_emails[])` | anon, authenticated | `{name_taken, emails_taken[]}` — kiểm tra trước khi đăng ký |
| `register_team(p_team_name, p_school, p_leader_name, p_leader_phone, p_members jsonb)` | authenticated | tạo đội nguyên tử cho người đã đăng nhập (trả team id) |
| `claim_membership()` | authenticated | gắn tài khoản (email đã xác nhận) vào dòng `team_members` cùng email; trả team id |
| `update_progress(p_team, p_stage, p_balance, p_score)` | thành viên đội | upsert tiến độ, lấy `greatest` |

Phần cần quyền cao nằm trong schema `private` (không lộ qua API): `create_team`, `link_member_rows`, `is_admin`, `my_team_ids`, `handle_new_user`.

## Đăng ký đội & gắn thành viên

1. Trưởng nhóm điền form `/dang-ky` → `api.registerTeam()` gọi `auth.signUp` với metadata `pending_team`.
   Trigger tạo profile **và** đội + 5 dòng thành viên + progress + workspace trong **cùng một transaction** với việc tạo
   tài khoản (lỗi thì không tạo gì cả). Nếu trưởng nhóm đã đăng nhập sẵn bằng đúng email đó thì dùng RPC `register_team`.
2. Thành viên: vào `/dang-nhap` → tab **Link qua email** (hoặc **Thành viên mới** nếu muốn mật khẩu) bằng **đúng email**
   trưởng nhóm đã khai báo → tài khoản tự gắn vào đội (trigger khi tạo tài khoản; người đã có tài khoản từ trước thì
   `getMyTeam()` gọi `claim_membership()`). Không cần mã mời.

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
