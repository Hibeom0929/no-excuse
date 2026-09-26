import React from 'react'
import { useStore } from '../lib/store'
import { Group, Member } from '../types'
import { WEEKDAY_LABEL, formatDateKor } from '../lib/time'

const STATUS_LABEL: Record<string, string> = {
  present: '출석',
  absent: '결석',
  excused_pending: '해명 투표중',
  excused_approved: '해명 승인',
  excused_rejected: '해명 반려',
}

const STATUS_COLOR: Record<string, string> = {
  present: 'text-campus bg-campus/10',
  absent: 'text-stamp bg-stamp/10',
  excused_pending: 'text-gold bg-gold/10',
  excused_approved: 'text-campus bg-campus/10',
  excused_rejected: 'text-stamp bg-stamp/10',
}

export default function MemberHistory({
  group, member, onClose,
}: { group: Group; member: Member; onClose: () => void }) {
  const { data } = useStore()

  const myTimetable = data.timetable.filter(t => t.groupId === group.id && t.memberId === member.id && !t.archivedAt)
  const records = data.attendance
    .filter(a => a.groupId === group.id && a.memberId === member.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const presentCount = records.filter(r => r.status === 'present').length
  const absentCount = records.filter(r => r.status === 'absent' || r.status === 'excused_rejected').length

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end md:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:max-w-sm max-h-[85vh] overflow-y-auto shadow-card"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-ink text-lg">{member.name}</h3>
          <span className="text-[10px] font-bold text-ink/30 bg-paper rounded-full px-2 py-1">읽기 전용</span>
        </div>
        <p className="text-xs text-ink/40 mb-4">등록 수업 {myTimetable.length}개 · 출석 {presentCount} · 결석 {absentCount}</p>

        {records.length === 0 ? (
          <div className="bg-paper rounded-xl p-6 text-center text-sm text-ink/40">아직 출석 기록이 없어요.</div>
        ) : (
          <div className="space-y-2">
            {records.map(r => {
              const entry = data.timetable.find(t => t.id === r.timetableEntryId)
              return (
                <div key={r.id} className="flex items-center justify-between bg-paper rounded-lg px-3 py-2.5">
                  <div className="text-sm">
                    <div className="font-medium text-ink">{entry?.subject ?? '(삭제된 수업)'}</div>
                    <div className="text-[11px] text-ink/40 font-mono">
                      {formatDateKor(r.date)}{entry ? ` · ${WEEKDAY_LABEL[entry.weekday]}요일 ${entry.startTime}` : ''}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${STATUS_COLOR[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper">닫기</button>
      </div>
    </div>
  )
}
