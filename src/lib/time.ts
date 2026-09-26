import { Weekday } from '../types'
import { Language } from './i18n'

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
}

const WEEKDAY_LABEL_EN: Record<Weekday, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
}

export function weekdayLabel(weekday: Weekday, language: Language): string {
  return language === 'ko' ? `${WEEKDAY_LABEL[weekday]}요일` : WEEKDAY_LABEL_EN[weekday]
}

export function todayDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayWeekday(d: Date = new Date()): Weekday {
  return d.getDay() as Weekday
}

export function nowHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "09:00" -> 540 (분)
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinCheckInWindow(startTime: string, endTime: string, now: string): boolean {
  const start = toMinutes(startTime) - 10 // 10분 전부터 체크인 허용
  const end = toMinutes(endTime)
  const cur = toMinutes(now)
  return cur >= start && cur <= end
}

export function hasClassEnded(endTime: string, now: string): boolean {
  return toMinutes(now) > toMinutes(endTime)
}

export function formatDate(dateStr: string, language: Language): string {
  const [y, m, d] = dateStr.split('-')
  if (language === 'ko') return `${Number(m)}월 ${Number(d)}일`
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
