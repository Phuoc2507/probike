-- ProBike: schema chính (PLAN.md mục 8)
-- Bảng: profiles, teams, team_members, workspaces, runs, progress, budget_items
-- RLS: thành viên chỉ thấy đội mình, admin thấy tất cả, budget_items chỉ admin.
-- Hàm trợ giúp đặt trong schema `private` (PostgREST không lộ ra ngoài).

create schema if not exists private;
grant usage on schema private to authenticated;

-- ============================================================ Bảng

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  school text not null default '',
  phone text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  school text not null default '',
  leader_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now()
);
create unique index teams_name_unique on public.teams (lower(btrim(name)));
create index teams_leader_idx on public.teams (leader_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  phone text not null default '',
  role_in_team text not null default '',
  created_at timestamptz not null default now()
);
-- Mỗi email chỉ thuộc một đội; mỗi tài khoản chỉ thuộc một đội.
create unique index team_members_email_unique on public.team_members (email);
create unique index team_members_user_unique on public.team_members (user_id) where user_id is not null;
create index team_members_team_idx on public.team_members (team_id);

create table public.workspaces (
  team_id uuid primary key references public.teams (id) on delete cascade,
  ydoc_snapshot bytea,
  design jsonb,
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  map_id text not null,
  result jsonb not null,
  design jsonb,
  score numeric not null default 0,
  time_s numeric not null default 0,
  created_at timestamptz not null default now()
);
create index runs_team_idx on public.runs (team_id, created_at desc);
create index runs_user_idx on public.runs (user_id);

create table public.progress (
  team_id uuid primary key references public.teams (id) on delete cascade,
  stage_reached int not null default 1 check (stage_reached between 1 and 3),
  balance_best_s numeric not null default 0,
  best_score numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Khác',
  name text not null default '',
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  note text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================ Hàm trợ giúp (private)

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function private.my_team_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.my_team_ids() to authenticated;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger workspaces_touch before update on public.workspaces
  for each row execute function private.touch_updated_at();
create trigger progress_touch before update on public.progress
  for each row execute function private.touch_updated_at();

-- Tối đa 5 thành viên mỗi đội (kể cả trưởng nhóm)
create or replace function private.check_team_size()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.team_members where team_id = new.team_id) >= 5 then
    raise exception 'Mỗi đội tối đa 5 thành viên' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger team_members_size before insert on public.team_members
  for each row execute function private.check_team_size();

-- Gắn các dòng team_members (chưa có user_id) có cùng email vào tài khoản.
create or replace function private.link_member_rows(p_user uuid, p_email text)
returns void language sql security definer set search_path = ''
as $$
  update public.team_members
     set user_id = p_user
   where email = lower(btrim(p_email))
     and user_id is null
     and not exists (select 1 from public.team_members t2 where t2.user_id = p_user);
$$;

-- Tạo đội nguyên tử: đội + trưởng nhóm + thành viên + progress + workspace.
-- p_members: [{full_name, email, phone, role_in_team}] (không gồm trưởng nhóm, tối đa 4)
create or replace function private.create_team(
  p_user uuid, p_team_name text, p_school text, p_leader_name text, p_leader_phone text, p_members jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_team uuid;
  v_email text;
  v_m jsonb;
  v_m_email text;
  v_seen text[] := '{}';
begin
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'Không tìm thấy tài khoản'; end if;
  if coalesce(btrim(p_team_name), '') = '' then raise exception 'Thiếu tên đội'; end if;
  if jsonb_typeof(coalesce(p_members, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_members, '[]'::jsonb)) > 4 then
    raise exception 'Đội tối đa 5 người (trưởng nhóm + 4 thành viên)';
  end if;
  if exists (select 1 from public.team_members where user_id = p_user or email = v_email) then
    raise exception 'Tài khoản này đã thuộc một đội';
  end if;
  if exists (select 1 from public.teams where lower(btrim(name)) = lower(btrim(p_team_name))) then
    raise exception 'Tên đội đã được dùng';
  end if;

  insert into public.teams (name, school, leader_id)
  values (btrim(p_team_name), btrim(coalesce(p_school, '')), p_user)
  returning id into v_team;

  update public.profiles
     set full_name = coalesce(nullif(btrim(p_leader_name), ''), full_name),
         phone = coalesce(nullif(btrim(p_leader_phone), ''), phone),
         school = btrim(coalesce(p_school, ''))
   where id = p_user;

  insert into public.team_members (team_id, user_id, full_name, email, phone, role_in_team)
  values (v_team, p_user, coalesce(nullif(btrim(p_leader_name), ''), v_email), v_email,
          coalesce(btrim(p_leader_phone), ''), 'Trưởng nhóm');
  v_seen := array_append(v_seen, v_email);

  for v_m in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) loop
    v_m_email := lower(btrim(coalesce(v_m ->> 'email', '')));
    if v_m_email = '' or position('@' in v_m_email) = 0 then
      raise exception 'Email thành viên không hợp lệ: %', coalesce(v_m ->> 'email', '');
    end if;
    if v_m_email = any (v_seen) then raise exception 'Email bị trùng: %', v_m_email; end if;
    if exists (select 1 from public.team_members where email = v_m_email) then
      raise exception 'Email đã thuộc đội khác: %', v_m_email;
    end if;
    v_seen := array_append(v_seen, v_m_email);
    insert into public.team_members (team_id, user_id, full_name, email, phone, role_in_team)
    values (
      v_team,
      -- Thành viên đã có tài khoản (và chưa thuộc đội nào) thì gắn luôn
      (select u.id from auth.users u where lower(u.email) = v_m_email
         and not exists (select 1 from public.team_members x where x.user_id = u.id) limit 1),
      coalesce(nullif(btrim(v_m ->> 'full_name'), ''), v_m_email),
      v_m_email,
      btrim(coalesce(v_m ->> 'phone', '')),
      btrim(coalesce(v_m ->> 'role_in_team', ''))
    );
  end loop;

  insert into public.progress (team_id) values (v_team);
  insert into public.workspaces (team_id) values (v_team);
  return v_team;
end $$;

-- ============================================================ Trigger tài khoản mới

-- Tạo profile; gắn vào đội nếu email đã được trưởng nhóm khai báo;
-- nếu metadata có `pending_team` (đăng ký đội lúc tạo tài khoản) thì tạo đội luôn — cùng transaction.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_team jsonb := v_meta -> 'pending_team';
begin
  insert into public.profiles (id, full_name, phone, school)
  values (new.id, coalesce(v_meta ->> 'full_name', ''), coalesce(v_meta ->> 'phone', ''), coalesce(v_meta ->> 'school', ''))
  on conflict (id) do nothing;

  if v_team is not null and jsonb_typeof(v_team) = 'object' then
    perform private.create_team(
      new.id, v_team ->> 'team_name', v_team ->> 'school',
      v_meta ->> 'full_name', v_meta ->> 'phone', v_team -> 'members');
  else
    perform private.link_member_rows(new.id, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Hàm nội bộ: không ai gọi trực tiếp được (chỉ chạy qua trigger/RPC security definer).
revoke execute on function private.link_member_rows(uuid, text) from public;
revoke execute on function private.create_team(uuid, text, text, text, text, jsonb) from public;
revoke execute on function private.handle_new_user() from public;
revoke execute on function private.check_team_size() from public;
revoke execute on function private.touch_updated_at() from public;

-- ============================================================ RPC công khai

-- Đăng ký đội cho người đã đăng nhập (người dùng đã có tài khoản).
create or replace function public.register_team(
  p_team_name text, p_school text, p_leader_name text, p_leader_phone text, p_members jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  return private.create_team(auth.uid(), p_team_name, p_school, p_leader_name, p_leader_phone, p_members);
end $$;
revoke execute on function public.register_team(text, text, text, text, jsonb) from public, anon;
grant execute on function public.register_team(text, text, text, text, jsonb) to authenticated;

-- Kiểm tra trước khi đăng ký (tránh lỗi chung chung từ Auth): tên đội đã dùng? email nào đã thuộc đội?
create or replace function public.check_team_registration(p_team_name text, p_emails text[])
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name_taken', exists (select 1 from public.teams where lower(btrim(name)) = lower(btrim(p_team_name))),
    'emails_taken', coalesce((
      select jsonb_agg(distinct m.email) from public.team_members m
       where m.email = any (select lower(btrim(e)) from unnest(p_emails) e)
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.check_team_registration(text, text[]) from public;
grant execute on function public.check_team_registration(text, text[]) to anon, authenticated;

-- Gắn tài khoản hiện tại vào đội theo email (cho người đã có tài khoản trước khi được khai báo).
create or replace function public.claim_membership()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_email text; v_team uuid;
begin
  if auth.uid() is null then return null; end if;
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is not null then perform private.link_member_rows(auth.uid(), v_email); end if;
  select team_id into v_team from public.team_members where user_id = auth.uid() limit 1;
  return v_team;
end $$;
revoke execute on function public.claim_membership() from public, anon;
grant execute on function public.claim_membership() to authenticated;

-- Cập nhật tiến độ chỉ tăng (không bao giờ giảm). Chạy với quyền người gọi → RLS áp dụng.
create or replace function public.update_progress(
  p_team uuid, p_stage int default null, p_balance numeric default null, p_score numeric default null
) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.progress as p (team_id, stage_reached, balance_best_s, best_score)
  values (p_team, coalesce(p_stage, 1), coalesce(p_balance, 0), coalesce(p_score, 0))
  on conflict (team_id) do update set
    stage_reached = greatest(p.stage_reached, coalesce(excluded.stage_reached, p.stage_reached)),
    balance_best_s = greatest(p.balance_best_s, excluded.balance_best_s),
    best_score = greatest(p.best_score, excluded.best_score);
$$;
revoke execute on function public.update_progress(uuid, int, numeric, numeric) from public, anon;
grant execute on function public.update_progress(uuid, int, numeric, numeric) to authenticated;

-- ============================================================ RLS

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.runs enable row level security;
alter table public.progress enable row level security;
alter table public.budget_items enable row level security;

-- Chỉ authenticated được đụng tới bảng; anon không có quyền gì.
revoke all on public.profiles, public.teams, public.team_members, public.workspaces,
  public.runs, public.progress, public.budget_items from anon;

-- profiles: xem của mình (admin xem tất cả); chỉ được sửa tên/trường/SĐT, KHÔNG sửa role.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, school, phone) on public.profiles to authenticated;

-- teams: thành viên xem đội mình; admin toàn quyền. Tạo đội qua RPC.
create policy teams_select on public.teams for select to authenticated
  using (id in (select private.my_team_ids()) or (select private.is_admin()));
create policy teams_admin_update on public.teams for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy teams_admin_delete on public.teams for delete to authenticated
  using ((select private.is_admin()));

-- team_members: thành viên xem cả đội; admin toàn quyền.
create policy members_select on public.team_members for select to authenticated
  using (team_id in (select private.my_team_ids()) or (select private.is_admin()));
create policy members_admin_insert on public.team_members for insert to authenticated
  with check ((select private.is_admin()));
create policy members_admin_update on public.team_members for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy members_admin_delete on public.team_members for delete to authenticated
  using ((select private.is_admin()));

-- workspaces: thành viên đọc/ghi workspace đội mình; admin đọc.
create policy ws_select on public.workspaces for select to authenticated
  using (team_id in (select private.my_team_ids()) or (select private.is_admin()));
create policy ws_insert on public.workspaces for insert to authenticated
  with check (team_id in (select private.my_team_ids()));
create policy ws_update on public.workspaces for update to authenticated
  using (team_id in (select private.my_team_ids())) with check (team_id in (select private.my_team_ids()));

-- runs: thành viên xem lịch sử đội, thêm lượt chạy của chính mình; admin đọc/xoá.
create policy runs_select on public.runs for select to authenticated
  using (team_id in (select private.my_team_ids()) or (select private.is_admin()));
create policy runs_insert on public.runs for insert to authenticated
  with check (team_id in (select private.my_team_ids()) and user_id = (select auth.uid()));
create policy runs_admin_delete on public.runs for delete to authenticated
  using ((select private.is_admin()));

-- progress: thành viên đọc/ghi đội mình; admin đọc.
create policy progress_select on public.progress for select to authenticated
  using (team_id in (select private.my_team_ids()) or (select private.is_admin()));
create policy progress_insert on public.progress for insert to authenticated
  with check (team_id in (select private.my_team_ids()));
create policy progress_update on public.progress for update to authenticated
  using (team_id in (select private.my_team_ids())) with check (team_id in (select private.my_team_ids()));

-- budget_items: chỉ admin.
create policy budget_admin_all on public.budget_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ============================================================ Realtime (kênh riêng của đội)
-- Kênh `team:<team_id>` (private). Chỉ thành viên đội nhận/gửi broadcast & presence.

create policy team_channel_read on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) in (select 'team:' || t::text from private.my_team_ids() t)
  );
create policy team_channel_write on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) in (select 'team:' || t::text from private.my_team_ids() t)
  );

-- ============================================================ Dữ liệu mẫu: chi phí tổ chức (ước lượng, BTC sửa lại)

insert into public.budget_items (category, name, qty, unit_price, note, sort) values
  ('Giải thưởng', 'Giải Nhất', 1, 5000000, 'Tiền mặt + cúp', 10),
  ('Giải thưởng', 'Giải Nhì', 1, 3000000, '', 20),
  ('Giải thưởng', 'Giải Ba', 2, 1500000, '', 30),
  ('Giải thưởng', 'Giải Khuyến khích', 3, 500000, '', 40),
  ('Giải thưởng', 'Giấy chứng nhận + khung', 40, 30000, 'Cho mọi đội vào chung kết', 50),
  ('Linh kiện phát cho đội', 'Bánh xe BTC phát', 60, 25000, '2 bánh × 30 đội (ước lượng)', 10),
  ('Linh kiện phát cho đội', 'Linh kiện dự phòng ngày thi', 1, 1500000, 'IMU, driver, pin dự phòng', 20),
  ('Sa hình', 'Carton, sơn, keo dựng sa hình 4 × 2,5 m', 1, 1200000, '', 10),
  ('Sa hình', 'Cầu bập bênh (gỗ + trục)', 1, 350000, '', 20),
  ('Sa hình', 'Đá dăm, sỏi dán bãi đá', 1, 150000, '', 30),
  ('Sa hình', 'Cảm biến bấm giờ vạch xuất phát/đích', 1, 400000, '', 40),
  ('Tổ chức ngày thi', 'Thuê hội trường', 1, 3000000, '', 10),
  ('Tổ chức ngày thi', 'Nước uống, ăn nhẹ', 150, 20000, '', 20),
  ('Tổ chức ngày thi', 'In banner, standee, bảng tên', 1, 1500000, '', 30),
  ('Tổ chức ngày thi', 'Bồi dưỡng giám khảo', 3, 500000, '', 40),
  ('Truyền thông & web', 'Tên miền', 1, 300000, '1 năm', 10),
  ('Truyền thông & web', 'Chạy quảng cáo mạng xã hội', 1, 1000000, '', 20),
  ('Truyền thông & web', 'Hosting Vercel + Supabase', 1, 0, 'Gói miễn phí', 30);
