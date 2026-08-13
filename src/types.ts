export interface Member {
  id: string
  name: string
}

export type CurrencyCode = 'KRW' | 'SGD' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'MYR' | 'CNY'

export interface Group {
  id: string
  name: string
  inviteCode: string
  fineAmount: number // 결석 1회당 벌금 (currency 단위)
  currency: CurrencyCode
  accountInfo: string // 벌금이 모이는 계좌 (총무 계좌 등)
  requirePhotoToCheckIn: boolean // 켜면 인증샷을 첨부해야만 출석 체크 가능
  members: Member[]
  ownerId: string // 방장 (그룹을 만든 사람)
  treasurerId: string // 입금 확인 권한을 가진 사람 (기본값: 방장)
  createdAt: string
}

// 0=일 1=월 2=화 3=수 4=목 5=금 6=토
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TimetableEntry {
  id: string
  groupId: string
  memberId: string
  subject: string
  location?: string
  weekday: Weekday
  startTime: string // "09:00"
  endTime: string // "10:15"
}

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'excused_pending'
  | 'excused_approved'
  | 'excused_rejected'

export interface AttendanceRecord {
  id: string
  groupId: string
  memberId: string
  timetableEntryId: string
  date: string // yyyy-mm-dd
  status: AttendanceStatus
  checkedInAt?: string
  photo?: string // dataURL
}

export interface FineTransaction {
  id: string
  groupId: string
  memberId: string
  attendanceRecordId: string
  amount: number
  reason: string
  date: string
  status: 'charged' | 'waived'
  settled?: boolean
}

export interface ExcuseRequest {
  id: string
  groupId: string
  attendanceRecordId: string
  memberId: string
  reason: string
  createdAt: string
  votes: Record<string, boolean> // memberId -> 승인(true)/반려(false)
  status: 'pending' | 'approved' | 'rejected'
}

export interface AppData {
  groups: Group[]
  timetable: TimetableEntry[]
  attendance: AttendanceRecord[]
  fines: FineTransaction[]
  excuses: ExcuseRequest[]
}
