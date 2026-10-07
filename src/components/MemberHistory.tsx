import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { AttendanceRecord, Group, Member } from '../types'
import { weekdayLabel, formatDate, todayDateStr } from '../lib/time'
import { attendanceForDay, entriesForDay, weekdayForDate } from '../lib/attendanceView'
import { useLanguage } from '../lib/i18n'
import ExcuseModal from './ExcuseModal'

const STATUS_COLOR: Record<string, string> = {
  present: 'text-campus bg-campus/10',
  absent: 'text-stamp bg-stamp/10',
  excused_pending: 'text-gold bg-gold/10',
  excused_approved: 'text-campus bg-campus/10',
  excused_rejected: 'text-stamp bg-stamp/10',
}

export default function MemberHistory({
  group, member, onClose, date, meId,
}: { group: Group; member: Member; onClose: () => void; date?: string; meId?: string }) {
  const { data } = useStore()
  const { language, t } = useLanguage()
  const [showAll, setShowAll] = useState(!date)
  const [excuseTarget, setExcuseTarget] = useState<AttendanceRecord | null>(null)
  const ownHistory = member.id === meId
  const canRequest = ownHistory && !group.archivedAt && !member.leftAt
  const day = date ?? todayDateStr()
  const statusLabel: Record<string, string> = {
    present: t('출석'), absent: t('결석'), excused_pending: t('해명 투표중'),
    excused_approved: t('해명 승인'), excused_rejected: t('해명 반려'),
  }

  const myTimetable = data.timetable.filter(t => t.groupId === group.id && t.memberId === member.id && !t.archivedAt)
  const records = data.attendance
    .filter(a => a.groupId === group.id && a.memberId === member.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const presentCount = records.filter(r => r.status === 'present').length
  const absentCount = records.filter(r => r.status === 'absent' || r.status === 'excused_rejected').length
  const dayEntries = entriesForDay(data.timetable, group.id, day, member.id)

  return (
    <>
    <div className="fixed inset-0 bg-ink/40 flex items-end md:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:max-w-sm max-h-[85vh] overflow-y-auto shadow-card"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-ink text-lg">{member.name}</h3>
          <span className="text-[10px] font-bold text-ink/30 bg-paper rounded-full px-2 py-1">{t(ownHistory ? '내 출석 기록' : '읽기 전용')}</span>
        </div>
        <div className="flex gap-2 my-3">
          <button onClick={() => setShowAll(false)} aria-pressed={!showAll}
            className={`rounded-lg px-3 py-2 text-xs font-bold ${!showAll ? 'bg-campus text-paper' : 'bg-paper text-ink/50'}`}>{t('오늘 현황')}</button>
          <button onClick={() => setShowAll(true)} aria-pressed={showAll}
            className={`rounded-lg px-3 py-2 text-xs font-bold ${showAll ? 'bg-campus text-paper' : 'bg-paper text-ink/50'}`}>{t('전체 기록')}</button>
        </div>
        {!showAll ? (
          <div>
            <p className="text-xs text-ink/40 mb-3">{formatDate(day, language)} · {weekdayLabel(weekdayForDate(day), language)}</p>
            {dayEntries.length === 0 ? (
              <div className="bg-paper rounded-xl p-6 text-center text-sm text-ink/40">{t('오늘은 등록된 수업이 없어요.')}</div>
            ) : (
              <div className="space-y-2">
                {dayEntries.map(entry => {
                  const record = attendanceForDay(data.attendance, group.id, member.id, entry.id, day)
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-2 bg-paper rounded-lg px-3 py-2.5">
                      <div className="min-w-0 text-sm">
                        <div className="font-medium text-ink">{entry.subject}</div>
                        <div className="text-[11px] text-ink/40 font-mono">{entry.startTime}–{entry.endTime}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${record ? STATUS_COLOR[record.status] : 'text-ink/40 bg-line/50'}`}>
                        {record ? statusLabel[record.status] : t('체크인 전')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-ink/40 mb-4">{t('등록 수업 {{classes}}개 · 출석 {{present}} · 결석 {{absent}}', { classes: myTimetable.length, present: presentCount, absent: absentCount })}</p>
            {canRequest && <p className="text-xs text-ink/50 mb-3">{t('지난 결석도 해명을 제출할 수 있어요. 미결 투표는 결과가 정해질 때까지 유지돼요.')}</p>}
            {records.length === 0 ? (
              <div className="bg-paper rounded-xl p-6 text-center text-sm text-ink/40">{t('아직 출석 기록이 없어요.')}</div>
            ) : (
              <div className="space-y-2">
                {records.map(r => {
                  const entry = data.timetable.find(t => t.id === r.timetableEntryId)
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 bg-paper rounded-lg px-3 py-2.5">
                      <div className="min-w-0 text-sm">
                        <div className="font-medium text-ink">{entry?.subject ?? t('(삭제된 수업)')}</div>
                        <div className="text-[11px] text-ink/40 font-mono">
                          {formatDate(r.date, language)}{entry ? ` · ${weekdayLabel(weekdayForDate(r.date), language)} ${entry.startTime}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${STATUS_COLOR[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                        {canRequest && r.status === 'absent' && !data.excuses.some(e => e.attendanceRecordId === r.id) && (
                          <button onClick={() => setExcuseTarget(r)} className="text-xs font-bold bg-white text-ink border border-gold/50 rounded-lg px-3 py-2 hover:bg-gold/10">
                            {t('해명하고 투표 요청')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="w-full mt-4 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper">{t('닫기')}</button>
      </div>
    </div>
    {excuseTarget && <ExcuseModal record={excuseTarget} onClose={() => setExcuseTarget(null)} />}
    </>
  )
}
