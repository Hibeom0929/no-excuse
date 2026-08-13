import { Group, Member, TimetableEntry, AttendanceRecord, FineTransaction, ExcuseRequest } from '../types'

// Supabase(Postgres)는 snake_case 컬럼을 쓰고, 앱 내부 타입은 camelCase를 쓰기 때문에
// 여기서 한 번에 변환한다. row 타입은 supabase-js가 넘겨주는 대로 loose하게 받는다.

export function mapGroup(row: any, members: Member[]): Group {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    fineAmount: Number(row.fine_amount),
    currency: row.currency,
    accountInfo: row.account_info,
    requirePhotoToCheckIn: row.require_photo,
    members,
    ownerId: row.owner_id,
    treasurerId: row.treasurer_id,
    createdAt: row.created_at,
  }
}

export function mapTimetable(row: any): TimetableEntry {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    subject: row.subject,
    location: row.location ?? undefined,
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

export function mapAttendance(row: any): AttendanceRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    timetableEntryId: row.timetable_entry_id,
    date: row.date,
    status: row.status,
    checkedInAt: row.checked_in_at ?? undefined,
    photo: row.photo ?? undefined,
  }
}

export function mapFine(row: any): FineTransaction {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    attendanceRecordId: row.attendance_record_id,
    amount: Number(row.amount),
    reason: row.reason,
    date: row.date,
    status: row.status,
    settled: !!row.settled,
  }
}

export function mapExcuse(row: any, votes: Record<string, boolean>): ExcuseRequest {
  return {
    id: row.id,
    groupId: row.group_id,
    attendanceRecordId: row.attendance_record_id,
    memberId: row.member_id,
    reason: row.reason,
    createdAt: row.created_at,
    votes,
    status: row.status,
  }
}
