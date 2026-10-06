import { AttendanceRecord, TimetableEntry, Weekday } from '../types'

export function weekdayForDate(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  // Parse a local calendar date, not UTC midnight (which can be yesterday in
  // some timezones). Noon also avoids daylight-saving midnight transitions.
  return new Date(year, month - 1, day, 12).getDay() as Weekday
}

export function entriesForDay(
  timetable: TimetableEntry[], groupId: string, date: string, memberId?: string,
): TimetableEntry[] {
  const weekday = weekdayForDate(date)
  return timetable.filter(entry => entry.groupId === groupId && entry.weekday === weekday
    && !entry.archivedAt && (memberId === undefined || entry.memberId === memberId))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function attendanceForDay(
  attendance: AttendanceRecord[], groupId: string, memberId: string, entryId: string, date: string,
): AttendanceRecord | undefined {
  return attendance.find(record => record.groupId === groupId && record.memberId === memberId
    && record.timetableEntryId === entryId && record.date === date)
}
