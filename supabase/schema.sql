-- ============================================================
-- 출첵벌금 (setlog-attendance) — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 그대로 실행하세요.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles: 로그인한 사람의 프로필 (이름) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

-- 회원가입(첫 로그인) 시 profiles row 자동 생성
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name) values (new.id, '');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- groups ----------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  fine_amount numeric not null default 0,
  currency text not null default 'KRW',
  account_info text not null default '',
  require_photo boolean not null default false,
  owner_id uuid not null references profiles(id),
  treasurer_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- group_members ----------
create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

-- ---------- timetable_entries ----------
create table if not exists timetable_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references profiles(id),
  subject text not null,
  location text,
  weekday int not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null
);

-- ---------- attendance_records ----------
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references profiles(id),
  timetable_entry_id uuid not null references timetable_entries(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','excused_pending','excused_approved','excused_rejected')),
  checked_in_at timestamptz,
  photo text,
  unique (timetable_entry_id, date)
);

-- ---------- fine_transactions ----------
create table if not exists fine_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references profiles(id),
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  amount numeric not null,
  reason text not null,
  date date not null,
  status text not null check (status in ('charged','waived')),
  settled boolean not null default false
);

-- ---------- excuse_requests ----------
create table if not exists excuse_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  member_id uuid not null references profiles(id),
  reason text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected'))
);

-- ---------- excuse_votes ----------
create table if not exists excuse_votes (
  excuse_id uuid not null references excuse_requests(id) on delete cascade,
  voter_id uuid not null references profiles(id),
  approve boolean not null,
  voted_at timestamptz not null default now(),
  primary key (excuse_id, voter_id)
);

-- ============================================================
-- Row Level Security: 그룹 멤버만 그 그룹의 데이터를 보고 쓸 수 있게 제한
-- ============================================================

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table timetable_entries enable row level security;
alter table attendance_records enable row level security;
alter table fine_transactions enable row level security;
alter table excuse_requests enable row level security;
alter table excuse_votes enable row level security;

-- 내가 속한 그룹인지 확인하는 헬퍼 함수
create or replace function is_group_member(gid uuid)
returns boolean as $$
  select exists (
    select 1 from group_members
    where group_id = gid and member_id = auth.uid()
  );
$$ language sql security definer stable;

-- profiles: 누구나 읽기 가능(그룹 내 이름 표시용), 본인만 수정 가능
create policy "profiles are readable by anyone signed in" on profiles
  for select using (auth.role() = 'authenticated');
create policy "users can update own profile" on profiles
  for update using (auth.uid() = id);

-- groups: 멤버만 조회, 로그인한 사람 누구나 생성 가능, 멤버만 수정
create policy "members can read their groups" on groups
  for select using (is_group_member(id));
create policy "authenticated users can create groups" on groups
  for insert with check (auth.uid() = owner_id);
create policy "members can update their groups" on groups
  for update using (is_group_member(id));

-- group_members: 멤버만 조회, 본인 가입/그룹 생성 시에만 insert
create policy "members can read group membership" on group_members
  for select using (is_group_member(group_id));
create policy "users can insert their own membership" on group_members
  for insert with check (member_id = auth.uid());

-- timetable_entries: 그룹 멤버만 조회, 본인 데이터만 쓰기/수정/삭제
create policy "members can read timetable" on timetable_entries
  for select using (is_group_member(group_id));
create policy "members can insert own timetable" on timetable_entries
  for insert with check (is_group_member(group_id) and member_id = auth.uid());
create policy "members can update own timetable" on timetable_entries
  for update using (member_id = auth.uid());
create policy "members can delete own timetable" on timetable_entries
  for delete using (member_id = auth.uid());

-- attendance_records: 그룹 멤버만 조회, 본인 체크인만 쓰기, 자동결석은 그룹 멤버 누구나 insert 가능(클라이언트 트리거)
create policy "members can read attendance" on attendance_records
  for select using (is_group_member(group_id));
create policy "members can insert attendance in their group" on attendance_records
  for insert with check (is_group_member(group_id));
create policy "members can delete own present record" on attendance_records
  for delete using (member_id = auth.uid());
create policy "members can update attendance status in their group" on attendance_records
  for update using (is_group_member(group_id));

-- fine_transactions: 그룹 멤버만 조회, 그룹 멤버 누구나 insert(자동 벌금 부과), 정산 처리를 위한 update
create policy "members can read fines" on fine_transactions
  for select using (is_group_member(group_id));
create policy "members can insert fines in their group" on fine_transactions
  for insert with check (is_group_member(group_id));
create policy "members can update fines in their group" on fine_transactions
  for update using (is_group_member(group_id));

-- excuse_requests: 그룹 멤버만 조회, 본인 것만 생성, 그룹 멤버가 투표 결과 반영 위해 update 가능
create policy "members can read excuses" on excuse_requests
  for select using (is_group_member(group_id));
create policy "members can file own excuse" on excuse_requests
  for insert with check (is_group_member(group_id) and member_id = auth.uid());
create policy "members can update excuse status in their group" on excuse_requests
  for update using (is_group_member(group_id));

-- excuse_votes: 그룹 멤버만 조회/투표 (본인 표만 insert)
create policy "members can read votes" on excuse_votes
  for select using (
    exists (select 1 from excuse_requests e where e.id = excuse_id and is_group_member(e.group_id))
  );
create policy "members can cast own vote" on excuse_votes
  for insert with check (voter_id = auth.uid());

-- ============================================================
-- Realtime: 각 테이블 변경사항을 클라이언트가 구독할 수 있게 publication에 추가
-- ============================================================
alter publication supabase_realtime add table groups;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table timetable_entries;
alter publication supabase_realtime add table attendance_records;
alter publication supabase_realtime add table fine_transactions;
alter publication supabase_realtime add table excuse_requests;
alter publication supabase_realtime add table excuse_votes;
