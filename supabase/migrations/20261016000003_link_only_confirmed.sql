-- Chỉ gắn tài khoản vào dòng team_members khi email ĐÃ XÁC NHẬN
-- (tránh người lạ đăng ký bằng email của thành viên để "chiếm chỗ" trước).

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
  elsif new.email_confirmed_at is not null then
    perform private.link_member_rows(new.id, new.email);
  end if;
  return new;
end $$;

-- Khi người dùng bấm link xác nhận email → gắn vào đội
create or replace function private.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.link_member_rows(new.id, new.email);
  return new;
end $$;
revoke execute on function private.handle_user_confirmed() from public;

create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_user_confirmed();

-- Lúc tạo đội: chỉ gắn sẵn những thành viên có tài khoản đã xác nhận
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
      (select u.id from auth.users u where lower(u.email) = v_m_email and u.email_confirmed_at is not null
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
revoke execute on function private.create_team(uuid, text, text, text, text, jsonb) from public;
