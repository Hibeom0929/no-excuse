-- 그룹장만 그룹 이름을 변경할 수 있다.
create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
begin
  if not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 그룹 이름을 변경할 수 있어요';
  end if;
  if nullif(v_name, '') is null then
    raise exception '그룹 이름을 입력해주세요';
  end if;
  if char_length(v_name) > 80 then
    raise exception '그룹 이름은 80자 이내로 입력해주세요';
  end if;

  update public.groups
  set name = v_name
  where id = p_group_id;
end;
$$;
