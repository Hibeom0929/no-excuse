-- 그룹장만 출석 인증샷 필수 여부를 변경할 수 있다.
create or replace function public.set_group_photo_requirement(
  p_group_id uuid,
  p_require_photo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the group owner can change the photo requirement';
  end if;

  update public.groups
  set require_photo = p_require_photo
  where id = p_group_id
    and archived_at is null;

  if not found then
    raise exception 'Active group not found';
  end if;
end;
$$;

revoke all on function public.set_group_photo_requirement(uuid, boolean) from public;
grant execute on function public.set_group_photo_requirement(uuid, boolean) to authenticated;
