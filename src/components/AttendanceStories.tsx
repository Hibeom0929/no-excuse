import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AttendanceRecord, Group } from '../types'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { visibleGroupStories, AttendanceStory, loadStories, loadStoryPhoto } from '../lib/stories'

export default function AttendanceStories({ group, meId, records }: {
  group: Group; meId: string; records: AttendanceRecord[]
}) {
  const { t } = useLanguage()
  const [stories, setStories] = useState<AttendanceStory[]>([])
  const [clock, setClock] = useState(() => Date.now())
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const revision = useRef(0)
  const mounted = useRef(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  const refresh = useCallback(async () => {
    const request = ++revision.current
    try {
      const next = await loadStories(supabase, group.id)
      if (mounted.current && request === revision.current) { setStories(next); setError(false) }
    } catch { if (mounted.current && request === revision.current) setError(true) }
  }, [group.id])

  useEffect(() => {
    mounted.current = true
    const resume = () => {
      setClock(Date.now())
      if (document.visibilityState === 'visible') void refresh()
    }
    const tick = setInterval(() => setClock(Date.now()), 1000)
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      mounted.current = false; revision.current++
      clearInterval(tick); clearInterval(poll)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [refresh])
  useEffect(() => { if (!group.archivedAt) void refresh() }, [records, group.archivedAt, refresh])

  // Cancellation/expiry hides the photo immediately, before a metadata refresh.
  const visible = visibleGroupStories(stories, group, records, clock)
  const selectedStory = visible.find(s => s.id === selected)
  const selectedPhotos = selectedStory ? visible.filter(s => s.memberId === selectedStory.memberId) : []
  const selectedIndex = selectedPhotos.findIndex(s => s.id === selected)
  const markSelected = (id: string) => {
    setSelected(id)
    setSeen(previous => new Set([...previous, id]))
  }
  const close = useCallback(() => {
    setSelected(null)
    if (opener.current?.isConnected) opener.current.focus()
  }, [])
  useEffect(() => { if (selected && !selectedStory) close() }, [selected, selectedStory, close])

  const members = group.members.filter(m => !m.leftAt && visible.some(s => s.memberId === m.id))
    .sort((a, b) => a.id === meId ? -1 : b.id === meId ? 1 : 0)
  if (!visible.length && !error) return null

  return <>
    {error && <p role="status" className="text-xs text-ink/50">
      {t('인증사진을 불러오지 못했어요.')}
      <button type="button" onClick={() => void refresh()} className="ml-2 underline font-bold">{t('다시 시도')}</button>
    </p>}
    {visible.length > 0 && <section aria-label={t('우리 팀의 하루')}>
      <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">{t('우리 팀의 하루')}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {members.map(member => {
          const photos = visible.filter(s => s.memberId === member.id)
          const allSeen = photos.every(s => seen.has(s.id))
          return <button type="button" key={member.id}
            aria-label={t('{{name}}의 스토리 {{count}}개', { name: member.name, count: photos.length })}
            onClick={event => { opener.current = event.currentTarget; markSelected((photos.find(s => !seen.has(s.id)) ?? photos[0]).id) }}
            className="flex shrink-0 w-16 flex-col items-center gap-1.5 rounded-lg focus-visible:outline-campus">
            <span className={`h-16 w-16 rounded-full border-2 p-1 ${allSeen ? 'border-line' : 'border-campus'}`}>
              <span className="flex h-full w-full rounded-full items-center justify-center bg-campus/10 text-campus text-lg font-bold" aria-hidden="true">{Array.from(member.name)[0] ?? '?'}</span>
            </span>
            <span className="text-xs font-medium max-w-full truncate">{member.id === meId ? t('나') : member.name}</span>
          </button>
        })}
      </div>
    </section>}
    {selectedStory && <StoryViewer key={selectedStory.id} story={selectedStory}
      name={group.members.find(m => m.id === selectedStory.memberId)?.name ?? '?'}
      index={selectedIndex} total={selectedPhotos.length} onClose={close}
      onPrevious={selectedIndex > 0 ? () => markSelected(selectedPhotos[selectedIndex - 1].id) : undefined}
      onNext={selectedIndex < selectedPhotos.length - 1 ? () => markSelected(selectedPhotos[selectedIndex + 1].id) : undefined} />}
  </>
}

function StoryViewer({ story, name, index, total, onClose, onPrevious, onNext }: {
  story: AttendanceStory; name: string; index: number; total: number; onClose: () => void;
  onPrevious?: () => void; onNext?: () => void;
}) {
  const { t, language } = useLanguage()
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setSource(null); setError(false)
    void loadStoryPhoto(supabase, story).then(blob => {
      if (disposed || Date.now() >= Date.parse(story.expiresAt)) return
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl)
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [story.id, story.expiresAt, story.objectPath, attempt])

  useEffect(() => {
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => { document.body.style.overflow = oldOverflow }
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'ArrowLeft' && onPrevious) { event.preventDefault(); onPrevious() }
      if (event.key === 'ArrowRight' && onNext) { event.preventDefault(); onNext() }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, onPrevious, onNext])

  return createPortal(<div className="fixed inset-0 z-[60] bg-ink/70 flex items-center justify-center p-3 sm:p-5" onClick={onClose}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('{{name}}의 출석 스토리', { name })}
      className="w-full max-w-md max-h-[95dvh] overflow-y-auto bg-paper rounded-2xl p-4 shadow-card" onClick={event => event.stopPropagation()}>
      <div className="flex gap-1 mb-4" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-campus' : 'bg-line'}`} />)}
      </div>
      <div className="flex justify-between items-center gap-3 mb-4">
        <div className="min-w-0"><h3 className="font-bold break-words">{name}</h3>
          <p className="text-xs text-ink/50">{new Date(story.checkedInAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-SG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <button type="button" ref={closeButton} onClick={onClose} className="rounded-lg bg-white border border-line min-h-11 px-4 text-sm font-bold">{t('닫기')}</button>
      </div>
      <div className="bg-white rounded-xl min-h-48 flex items-center justify-center overflow-hidden">
        {source ? <img src={source} alt={t('{{subject}} 출석 인증사진', { subject: story.subject })}
          className="max-h-[58dvh] w-full object-contain" referrerPolicy="no-referrer" onError={() => { setSource(null); setError(true) }} />
          : error ? <div role="alert" className="p-6 text-center text-sm text-ink/60">
            <p>{t('사진을 불러오지 못했어요. 다시 시도해주세요.')}</p>
            <button type="button" className="mt-3 min-h-11 underline font-bold" onClick={() => setAttempt(a => a + 1)}>{t('다시 시도')}</button>
          </div> : <p role="status" className="p-6 text-sm text-ink/50">{t('불러오는 중...')}</p>}
      </div>
      <p className="mt-4 font-bold break-words">{story.subject}</p>
      <p className="mt-1 text-xs text-campus">{t('출석 완료!')} · {index + 1} / {total}</p>
      <div className="flex gap-2 mt-4">
        <button type="button" disabled={!onPrevious} onClick={onPrevious} className="flex-1 min-h-11 border border-line rounded-lg text-sm font-bold disabled:opacity-30">{t('← 이전')}</button>
        <button type="button" disabled={!onNext} onClick={onNext} className="flex-1 min-h-11 bg-campus text-paper rounded-lg text-sm font-bold disabled:opacity-30">{t('다음 →')}</button>
      </div>
    </div>
  </div>, document.body)
}
