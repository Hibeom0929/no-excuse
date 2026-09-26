import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { Group, Weekday, TimetableEntry } from '../types'
import { WEEKDAY_LABEL } from '../lib/time'

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]

export default function TimetableEditor({ group, meId }: { group: Group; meId: string }) {
  const { data, addTimetableEntry, updateTimetableEntry, removeTimetableEntry, restoreTimetableEntry } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [location, setLocation] = useState('')
  const [weekday, setWeekday] = useState<Weekday>(1)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:15')

  const myEntries = data.timetable
    .filter(t => t.groupId === group.id && t.memberId === meId)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
  const activeEntries = myEntries.filter(t => !t.archivedAt)
  const archivedEntries = myEntries.filter(t => !!t.archivedAt)

  const me = group.members.find(m => m.id === meId)

  const resetForm = () => {
    setEditingId(null); setSubject(''); setLocation(''); setWeekday(1); setStartTime('09:00'); setEndTime('10:15')
  }

  const startEdit = (entry: TimetableEntry) => {
    setEditingId(entry.id)
    setSubject(entry.subject)
    setLocation(entry.location ?? '')
    setWeekday(entry.weekday)
    setStartTime(entry.startTime)
    setEndTime(entry.endTime)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">
          {me?.name}님의 시간표 {editingId ? '수정' : '등록'}
        </h2>
        <form
          className="bg-white border border-line rounded-xl p-4 shadow-card space-y-3"
          onSubmit={async e => {
            e.preventDefault()
            if (!subject.trim() || startTime >= endTime) return
            try {
              if (editingId) {
                await updateTimetableEntry(editingId, { subject: subject.trim(), location: location.trim() || undefined, weekday, startTime, endTime })
              } else {
                await addTimetableEntry({ groupId: group.id, memberId: meId, subject: subject.trim(), location: location.trim() || undefined, weekday, startTime, endTime })
              }
              resetForm()
            } catch (err) {
              alert(err instanceof Error ? err.message : '저장하지 못했어요')
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="수업명 (예: 경영통계학)"
              className="col-span-2 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="강의실 (선택)"
              className="col-span-2 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
          </div>
          <div className="flex gap-1.5">
            {WEEKDAYS.map(w => (
              <button type="button" key={w} onClick={() => setWeekday(w)}
                className={`flex-1 rounded-lg py-2 text-sm font-bold border ${weekday === w ? 'bg-campus text-paper border-campus' : 'border-line text-ink/50'}`}>
                {WEEKDAY_LABEL[w]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="flex-1 border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-campus/30" />
            <span className="text-ink/30">–</span>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="flex-1 border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-campus/30" />
          </div>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="flex-1 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper border border-line">
                취소
              </button>
            )}
            <button type="submit" className={`rounded-lg py-2.5 text-sm font-bold bg-campus text-paper hover:bg-campusLight ${editingId ? 'flex-[2]' : 'w-full'}`}>
              {editingId ? '수정 완료' : '+ 시간표에 추가'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">등록된 수업 ({activeEntries.length})</h2>
        {activeEntries.length === 0 ? (
          <div className="bg-white border border-dashed border-line rounded-xl p-6 text-center text-sm text-ink/40">
            아직 등록한 수업이 없어요.
          </div>
        ) : (
          <div className="space-y-2">
            {activeEntries.map(entry => (
              <div key={entry.id} className={`bg-white border rounded-xl px-4 py-3 flex items-center justify-between ${editingId === entry.id ? 'border-campus' : 'border-line'}`}>
                <div>
                  <div className="font-medium text-sm text-ink">
                    <span className="font-mono text-campus mr-2">{WEEKDAY_LABEL[entry.weekday]}</span>
                    {entry.subject}
                  </div>
                  <div className="text-xs text-ink/50 font-mono mt-0.5">
                    {entry.startTime}–{entry.endTime}{entry.location ? ` · ${entry.location}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(entry)} className="text-xs text-ink/40 hover:text-campus px-2 py-1">수정</button>
                  <button onClick={() => { if (confirm('시간표에서 이 수업을 지울까요? 과거 출석과 벌금 기록은 그대로 보존돼요.')) removeTimetableEntry(entry.id).catch(err => alert(err instanceof Error ? err.message : '삭제하지 못했어요')) }} className="text-xs text-ink/30 hover:text-stamp px-2 py-1">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {archivedEntries.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-ink/35 mb-3 tracking-wide">삭제한 수업 ({archivedEntries.length})</h2>
          <div className="space-y-2">
            {archivedEntries.map(entry => (
              <div key={entry.id} className="bg-white/60 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-ink/45">
                    <span className="font-mono mr-2">{WEEKDAY_LABEL[entry.weekday]}</span>
                    {entry.subject}
                  </div>
                  <div className="text-xs text-ink/30 font-mono mt-0.5">{entry.startTime}–{entry.endTime}</div>
                </div>
                <button
                  onClick={() => restoreTimetableEntry(entry.id).catch(err => alert(err instanceof Error ? err.message : '복구하지 못했어요'))}
                  className="text-xs font-bold text-campus/70 border border-campus/20 rounded-lg px-3 py-1.5 hover:bg-campus/5"
                >
                  복구
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
