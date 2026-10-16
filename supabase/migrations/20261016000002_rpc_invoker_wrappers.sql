-- Các RPC công khai chuyển sang SECURITY INVOKER; phần cần quyền cao nằm trong schema `private`
-- (PostgREST không lộ schema này), chỉ cấp EXECUTE đúng vai trò cần thiết.

create or replace function private.register_team_impl(
  p_team_name text, p_school text, p_leader_name text, p_leader_phone text, p_members jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  return private.create_team(auth.uid(), p_team_name, p_school, p_leader_name, p_leader_phone, p_members);
end $$;
revoke execute on function private.register_team_impl(text, text, text, text, jsonb) from public;
grant execute on function private.register_team_impl(text, text, text, text, jsonb) to authenticated;

create or replace function private.check_team_registration_impl(p_team_name text, p_emails text[])
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
revoke execute on function private.check_team_registration_impl(text, text[]) from public;
grant usage on schema private to anon;
grant execute on function private.check_team_registration_impl(text, text[]) to anon, authenticated;

create or replace function private.claim_membership_impl()
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
revoke execute on function private.claim_membership_impl() from public;
grant execute on function private.claim_membership_impl() to authenticated;

create or replace function public.register_team(
  p_team_name text, p_school text, p_leader_name text, p_leader_phone text, p_members jsonb
) returns uuid
language sql security invoker set search_path = ''
as $$ select private.register_team_impl(p_team_name, p_school, p_leader_name, p_leader_phone, p_members); $$;

create or replace function public.check_team_registration(p_team_name text, p_emails text[])
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.check_team_registration_impl(p_team_name, p_emails); $$;

create or replace function public.claim_membership()
returns uuid
language sql security invoker set search_path = ''
as $$ select private.claim_membership_impl(); $$;

-- Hàm dùng trong policy: chỉ authenticated.
revoke execute on function private.is_admin() from public;
revoke execute on function private.my_team_ids() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.my_team_ids() to authenticated;
