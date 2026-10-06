import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Group, Member } from '../types'
import { todayDateStr, todayWeekday, nowHHMM, isWithinCheckInWindow, hasClassEnded, weekdayLabel, formatDate } from '../lib/time'
import { entriesForDay } from '../lib/attendanceView'
import { formatMoney } from '../lib/currency'
import { CheckInStamp, StampMark } from './StampButton'
import ExcuseModal from './ExcuseModal'
import MemberHistory from './MemberHistory'
import { useLanguage } from '../lib/i18n'

export default function TodayAttendance({ group, meId }: { group: Group; meId: string }) {
  const { data, checkIn, cancelCheckIn, processAutoAbsences } = useStore()
  const { language, t } = useLanguage()
  const [clock, setClock] = useState(() => new Date())
  const [excuseTarget, setExcuseTarget] = useState<string | null>(null)
  const [viewingMember, setViewingMember] = useState<Member | null>(null)

  useEffect(() => {
    const tick = () => {
      setClock(new Date())
      void processAutoAbsences(group)
    }
    const resume = () => { if (document.visibilityState === 'visible') tick() }
    tick()
    const timer = setInterval(tick, 20000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [group, processAutoAbsences])

  const date = todayDateStr(clock)
  const wd = todayWeekday(clock)
  const now = nowHHMM(clock)

  const myEntries = entriesForDay(data.timetable, group.id, date, meId)

  const findRecord = (entryId: string) =>
    data.attendance.find(a => a.groupId === group.id && a.timetableEntryId === entryId && a.date === date)

  // 팀 전체 오늘 현황 (나 제외)
  const teamToday = group.members
    .filter(m => m.id !== meId && !m.leftAt)
    .map(m => {
      const entries = entriesForDay(data.timetable, group.id, date, m.id)
      return { member: m, entries }
    })
    .filter(x => x.entries.length > 0)

  // A cast vote must not make its request look deleted. Keep pending requests
  // (including my own/voted ones) and today's decided requests visible.
  const visibleExcuses = data.excuses.filter(e => e.groupId === group.id && (
    e.status === 'pending' || data.attendance.some(a => a.id === e.attendanceRecordId && a.date === date)
  ))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">
          {t('오늘 · {{weekday}} · {{time}}', { weekday: weekdayLabel(wd, language), time: now })}
        </h2>

        {myEntries.length === 0 ? (
          <div className="bg-white border border-dashed border-line rounded-xl p-6 text-center text-sm text-ink/40">
            {t('오늘은 등록된 내 수업이 없어요.')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {myEntries.map(entry => {
              const record = findRecord(entry.id)
              const canCheckIn = !record && isWithinCheckInWindow(entry.startTime, entry.endTime, now)
              const ended = hasClassEnded(entry.endTime, now)
              return (
                <div key={entry.id} className="bg-white border border-line rounded-xl p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-ink">{entry.subject}</div>
                      <div className="text-xs text-ink/50 font-mono mt-0.5">
                        {entry.startTime}–{entry.endTime}{entry.location ? ` · ${entry.location}` : ''}
                      </div>
                    </div>

                    {record?.status === 'present' && <StampMark kind="present" />}
                    {record?.status === 'absent' && <StampMark kind="absent" />}
                    {(record?.status === 'excused_pending') && <StampMark kind="excused" />}
                    {record?.status === 'excused_approved' && (
                      <span className="text-xs font-bold text-campus bg-campus/10 rounded-full px-3 py-1">{t('해명 승인됨')}</span>
                    )}
                    {record?.status === 'excused_rejected' && (
                      <span className="text-xs font-bold text-stamp bg-stamp/10 rounded-full px-3 py-1">{t('해명 반려됨')}</span>
                    )}
                  </div>

                  {!record && canCheckIn && (
                    <div className="mt-3">
                      <CheckInStamp
                        onConfirm={photo => checkIn(entry, photo).catch(e => alert(e instanceof Error ? e.message : t('체크인에 실패했어요')))}
                        requirePhoto={group.requirePhotoToCheckIn}
                      />
                    </div>
                  )}
                  {!record && !canCheckIn && !ended && (
                    <div className="mt-3 text-xs text-ink/40">
                      {t('수업 시작 10분 전부터 출석 도장을 찍을 수 있어요.')}
                    </div>
                  )}

                  {record?.status === 'present' && (
                    <div className="mt-3 flex items-center justify-between gap-3 bg-campus/5 rounded-lg px-3 py-2.5">
                      <span className="text-xs text-campus/80">
                        {t('{{time}} 체크인', { time: record.checkedInAt ? new Date(record.checkedInAt).toLocaleTimeString(language === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '' })}
                      </span>
                      <button
                        onClick={() => { if (confirm(t('출석 체크를 취소할까요?'))) cancelCheckIn(record).catch(e => alert(e instanceof Error ? e.message : t('처리하지 못했어요'))) }}
                        className="text-xs font-bold text-ink/40 bg-white border border-line rounded-lg px-3 py-1.5 hover:border-stamp hover:text-stamp"
                      >
                        {t('체크 취소')}
                      </button>
                    </div>
                  )}

                  {record?.status === 'absent' && (
                    <div className="mt-3 flex items-center justify-between gap-3 bg-stamp/5 rounded-lg px-3 py-2.5">
                      <span className="text-xs text-stamp/80">{t('벌금 {{amount}} 부과됨', { amount: formatMoney(group.fineAmount, group.currency) })}</span>
                      <button
                        onClick={() => setExcuseTarget(record.id)}
                        className="text-xs font-bold text-ink bg-white border border-line rounded-lg px-3 py-1.5 hover:border-gold"
                      >
                        {t('해명하기')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {visibleExcuses.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gold mb-3 tracking-wide">{t('🗳 해명·투표 현황')}</h2>
          <div className="space-y-2.5">
            {visibleExcuses.map(excuse => {
              const requester = group.members.find(m => m.id === excuse.memberId)
              const record = data.attendance.find(a => a.id === excuse.attendanceRecordId)
              const entry = record ? data.timetable.find(t => t.id === record.timetableEntryId) : undefined
              return (
                <VoteCard key={excuse.id} excuseId={excuse.id}
                  requesterName={requester?.name ?? '?'} subject={entry?.subject ?? t('수업')}
                  date={record?.date} reason={excuse.reason} status={excuse.status}
                  ownRequest={excuse.memberId === meId} myVote={excuse.votes[meId]} />
              )
            })}
          </div>
        </div>
      )}

      {teamToday.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">{t('우리 팀 오늘 현황')}</h2>
          <p className="text-xs text-ink/40 mb-2">{formatDate(date, language)} · {weekdayLabel(wd, language)}</p>
          <div className="bg-white border border-line rounded-xl divide-y divide-line">
            {teamToday.map(({ member, entries }) => (
              <button key={member.id} onClick={() => setViewingMember(member)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-paper/60 transition-colors text-left">
                <span className="min-w-0 flex-1 mr-2">
                  <span className="block text-sm font-medium text-ink/80">{member.name}</span>
                  {entries.map(entry => {
                    const r = findRecord(entry.id)
                    const label = r?.status === 'present' ? '출석' : r?.status === 'absent' ? '결석'
                      : r?.status === 'excused_pending' ? '해명 투표중'
                      : r?.status === 'excused_approved' ? '해명 승인'
                      : r?.status === 'excused_rejected' ? '해명 반려' : '체크인 전'
                    return <span key={entry.id} className="block text-[11px] text-ink/50 mt-1">{entry.subject} · {t(label)}</span>
                  })}
                </span>
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1.5">
                    {entries.map(entry => {
                      const r = findRecord(entry.id)
                      const dot =
                        r?.status === 'present' ? 'bg-campus' :
                        r?.status === 'absent' ? 'bg-stamp' :
                        r?.status === 'excused_pending' ? 'bg-gold' :
                        r?.status === 'excused_approved' ? 'bg-campus/50' :
                        r?.status === 'excused_rejected' ? 'bg-stamp/50' :
                        'bg-line'
                      return <span key={entry.id} title={entry.subject} className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                    })}
                  </div>
                  <span className="text-ink/20 text-xs">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {excuseTarget && (
        <ExcuseModal
          record={data.attendance.find(a => a.id === excuseTarget)!}
          onClose={() => setExcuseTarget(null)}
        />
      )}

      {viewingMember && (
        <MemberHistory group={group} member={viewingMember} date={date} onClose={() => setViewingMember(null)} />
      )}
    </div>
  )
}

function VoteCard({
  excuseId, requesterName, subject, reason, date, status, ownRequest, myVote,
}: { excuseId: string; requesterName: string; subject: string; reason: string; date?: string;
  status: 'pending' | 'approved' | 'rejected'; ownRequest: boolean; myVote?: boolean }) {
  const { castVote } = useStore()
  const { language, t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const vote = async (approve: boolean) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError(null)
    try {
      await castVote(excuseId, approve)
    } catch (err) {
      setError(t(err instanceof Error ? err.message : '투표에 실패했어요'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <div className="bg-white border border-gold/40 rounded-xl p-4 shadow-card">
      <div className="text-sm">
        <span className="text-ink/60">{t('{{name}}님이 {{subject}} 결석 해명을 요청했어요', { name: requesterName, subject })}</span>
      </div>
      {date && <div className="text-xs text-ink/40 mt-1">{formatDate(date, language)}</div>}
      <p className="text-xs font-bold text-campus mt-2">
        {status === 'approved' ? t('해명 승인됨') : status === 'rejected' ? t('해명 반려됨')
          : myVote !== undefined ? t('투표 완료 · 결과 대기 중') : ownRequest ? t('팀원 투표 대기 중') : t('내 투표가 필요해요')}
      </p>
      {myVote !== undefined && <p className="text-xs text-ink/50 mt-1">{t('내 투표: {{vote}}', { vote: t(myVote ? '인정' : '반려') })}</p>}
      <p className="text-sm text-ink/70 bg-paper rounded-lg px-3 py-2 mt-2 leading-relaxed">"{reason}"</p>
      {error && <p role="alert" className="text-sm text-stamp mt-2">{error}</p>}
      {status === 'pending' && !ownRequest && myVote === undefined && <div className="flex gap-2 mt-3">
        <button
          disabled={busy}
          onClick={() => vote(false)}
          className="flex-1 rounded-lg py-2 text-sm font-bold border border-line text-ink/60 hover:border-stamp hover:text-stamp disabled:opacity-40"
        >
          {t('반려')}
        </button>
        <button
          disabled={busy}
          onClick={() => vote(true)}
          className="flex-1 rounded-lg py-2 text-sm font-bold bg-campus text-paper hover:bg-campusLight disabled:opacity-40"
        >
          {busy ? t('처리중...') : t('인정')}
        </button>
      </div>}
    </div>
  )
}
