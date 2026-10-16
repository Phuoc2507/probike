-- Siết bảo mật theo review của phiên điều phối:
--  (a) Chỉ tạo đội khi email trưởng nhóm ĐÃ XÁC NHẬN (pending_team nằm trong metadata, tạo ở trigger xác nhận).
--  (b) Không tự gắn user_id thành viên lúc tạo đội — chỉ gắn khi chính người đó xác nhận email / đăng nhập.
--  (c) check_team_registration: tối đa 6 email, chỉ trả boolean (không lộ email nào đã dự thi).
--  (d) Ghi chú của BTC tách sang bảng riêng chỉ admin đọc được.
--  (e) Thành viên không được ghi thẳng bảng progress; chỉ qua RPC update_progress (kiểm tra thành viên, chỉ tăng).

-- ============================================================ (a) + (b)

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
  select lower(email) into v_email from auth.users where id = p_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Email trưởng nhóm chưa được xác nhận'; end if;
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
      raise exception 'Có email thành viên đã thuộc đội khác';
    end if;
    v_seen := array_append(v_seen, v_m_email);
    -- user_id để trống: chỉ gắn khi chính thành viên xác nhận email / đăng nhập (link_member_rows)
    insert into public.team_members (team_id, user_id, full_name, email, phone, role_in_team)
    values (v_team, null, coalesce(nullif(btrim(v_m ->> 'full_name'), ''), v_m_email), v_m_email,
            btrim(coalesce(v_m ->> 'phone', '')), btrim(coalesce(v_m ->> 'role_in_team', '')));
  end loop;

  insert into public.progress (team_id) values (v_team);
  insert into public.workspaces (team_id) values (v_team);
  return v_team;
end $$;
revoke execute on function private.create_team(uuid, text, text, text, text, jsonb) from public;

-- Tài khoản đã xác nhận: tạo đội đang chờ (nếu có) hoặc gắn vào đội đã khai báo email này.
-- Lỗi tạo đội (vd tên đã bị lấy trong lúc chờ xác nhận) không được chặn việc xác nhận email:
-- bỏ qua, người dùng đăng nhập rồi đăng ký lại ở /dang-ky (RPC register_team).
create or replace function private.on_confirmed(p_user uuid, p_email text, p_meta jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_team jsonb := p_meta -> 'pending_team';
begin
  if v_team is not null and jsonb_typeof(v_team) = 'object' then
    begin
      perform private.create_team(
        p_user, v_team ->> 'team_name', v_team ->> 'school',
        p_meta ->> 'full_name', p_meta ->> 'phone', v_team -> 'members');
      return;
    exception when others then
      null;
    end;
  end if;
  perform private.link_member_rows(p_user, p_email);
end $$;
revoke execute on function private.on_confirmed(uuid, text, jsonb) from public;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, full_name, phone, school)
  values (new.id, coalesce(v_meta ->> 'full_name', ''), coalesce(v_meta ->> 'phone', ''), coalesce(v_meta ->> 'school', ''))
  on conflict (id) do nothing;
  -- Dự án tắt xác nhận email → tài khoản được xác nhận ngay lúc tạo
  if new.email_confirmed_at is not null then
    perform private.on_confirmed(new.id, new.email, v_meta);
  end if;
  return new;
end $$;

create or replace function private.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.on_confirmed(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end $$;

-- ============================================================ (c)

drop function public.check_team_registration(text, text[]);
drop function private.check_team_registration_impl(text, text[]);

create function private.check_team_registration_impl(p_team_name text, p_emails text[])
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(array_length(p_emails, 1), 0) > 6 then
    raise exception 'Tối đa 6 email mỗi lần kiểm tra';
  end if;
  return jsonb_build_object(
    'name_taken', exists (select 1 from public.teams where lower(btrim(name)) = lower(btrim(p_team_name))),
    'any_email_taken', exists (
      select 1 from public.team_members m
       where m.email = any (select lower(btrim(e)) from unnest(p_emails) e))
  );
end $$;
revoke execute on function private.check_team_registration_impl(text, text[]) from public;
grant execute on function private.check_team_registration_impl(text, text[]) to anon, authenticated;

create function public.check_team_registration(p_team_name text, p_emails text[])
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.check_team_registration_impl(p_team_name, p_emails); $$;
grant execute on function public.check_team_registration(text, text[]) to anon, authenticated;

-- ============================================================ (d)

create table public.team_admin_notes (
  team_id uuid primary key references public.teams (id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.team_admin_notes enable row level security;
revoke all on public.team_admin_notes from anon;
create policy admin_notes_all on public.team_admin_notes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create trigger admin_notes_touch before update on public.team_admin_notes
  for each row execute function private.touch_updated_at();

insert into public.team_admin_notes (team_id, note)
select id, admin_note from public.teams where admin_note <> '';
alter table public.teams drop column admin_note;

-- ============================================================ (e)

drop policy progress_insert on public.progress;
drop policy progress_update on public.progress;
revoke insert, update, delete on public.progress from authenticated;

create or replace function private.update_progress_impl(p_team uuid, p_stage int, p_balance numeric, p_score numeric)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid()) then
    raise exception 'Không phải thành viên đội';
  end if;
  if p_stage is not null and (p_stage < 1 or p_stage > 3) then raise exception 'Giai đoạn không hợp lệ'; end if;
  insert into public.progress as p (team_id, stage_reached, balance_best_s, best_score)
  values (p_team, coalesce(p_stage, 1), greatest(coalesce(p_balance, 0), 0), greatest(coalesce(p_score, 0), 0))
  on conflict (team_id) do update set
    stage_reached = greatest(p.stage_reached, excluded.stage_reached),
    balance_best_s = greatest(p.balance_best_s, excluded.balance_best_s),
    best_score = greatest(p.best_score, excluded.best_score);
end $$;
revoke execute on function private.update_progress_impl(uuid, int, numeric, numeric) from public;
grant execute on function private.update_progress_impl(uuid, int, numeric, numeric) to authenticated;

create or replace function public.update_progress(
  p_team uuid, p_stage int default null, p_balance numeric default null, p_score numeric default null
) returns void
language sql security invoker set search_path = ''
as $$ select private.update_progress_impl(p_team, p_stage, p_balance, p_score); $$;
