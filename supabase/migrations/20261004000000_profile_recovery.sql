-- 오래된 계정에서 프로필 행이 빠졌어도 본인의 이름을 저장하고 복구할 수 있다.
-- 사용자 ID를 클라이언트에서 받지 않고, 항상 인증된 본인의 ID만 사용한다.
create or replace function public.save_my_profile(p_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_name is not null and (length(trim(p_name)) = 0 or length(trim(p_name)) > 80) then
    raise exception 'Name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  insert into public.profiles (id, name)
  values (v_user_id, coalesce(trim(p_name), ''))
  on conflict (id) do update
    set name = case when p_name is null then profiles.name else trim(p_name) end
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.save_my_profile(text) from public, anon;
grant execute on function public.save_my_profile(text) to authenticated;
