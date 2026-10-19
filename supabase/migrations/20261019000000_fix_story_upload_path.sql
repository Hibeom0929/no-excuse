-- Correct a name-binding bug: inside the groups subquery, unqualified `name`
-- resolves to groups.name rather than the uploading storage.objects.name.
-- Keep the existing bucket, authentication, owner, path and membership rules.
-- No records/files, delete policies or bucket settings are changed.
begin;
-- INSERT ... RETURNING also checks the SELECT policy. Its pending-upload check
-- runs before the new row can be looked up inside can_read_story_object().
-- Use the candidate row's server timestamp for the SAME owner-only 10-minute
-- pending window. Committed stories still use the existing membership/24h check.
create or replace function public.can_read_pending_story_upload(p_path text,p_created_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and split_part(p_path,'/',2)=auth.uid()::text
    and p_created_at > statement_timestamp()-interval '10 minutes'
    and p_created_at <= statement_timestamp()
    and not exists(select 1 from public.attendance_stories s where s.object_path=p_path)
    and exists(select 1 from public.groups g
      where g.id::text=split_part(p_path,'/',1) and g.archived_at is null and public.is_group_member(g.id));
$$;
revoke all on function public.can_read_pending_story_upload(text,timestamptz) from public,anon;
grant execute on function public.can_read_pending_story_upload(text,timestamptz) to authenticated;

alter policy "story authenticated read" on storage.objects
using (bucket_id='attendance-stories' and (
  public.can_read_story_object(objects.name)
  or public.can_read_pending_story_upload(objects.name,objects.created_at)
));

alter policy "story owner upload" on storage.objects
with check (
  bucket_id='attendance-stories' and split_part(objects.name,'/',2)=auth.uid()::text
  and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and exists (
    select 1 from public.groups g
    where g.id::text=split_part(objects.name,'/',1)
      and g.archived_at is null and public.is_group_member(g.id)
  )
);
commit;
