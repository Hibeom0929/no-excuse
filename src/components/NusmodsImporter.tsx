import React, { useMemo, useState } from 'react'
import { TimetableEntry, Weekday } from '../types'
import { weekdayLabel } from '../lib/time'
import { useLanguage } from '../lib/i18n'
import {
  academicYearOptions,
  currentAcademicYear,
  defaultSemester,
  ImportedTimetableEntry,
  parseNusmodsShareLink,
  readNusmodsImage,
  resolveNusmodsSelections,
} from '../lib/nusmods'

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6]

export default function NusmodsImporter({
  existingEntries,
  onImport,
}: {
  existingEntries: TimetableEntry[]
  onImport: (entries: ImportedTimetableEntry[]) => Promise<void>
}) {
  const { language, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'link' | 'photo'>('link')
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [academicYear, setAcademicYear] = useState(currentAcademicYear())
  const [semester, setSemester] = useState(defaultSemester())
  const [drafts, setDrafts] = useState<ImportedTimetableEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isValidDraft = (draft: ImportedTimetableEntry) => (
    draft.selected && !!draft.subject.trim() && draft.startTime < draft.endTime
  )
  const selectedCount = drafts.filter(isValidDraft).length
  const yearOptions = useMemo(() => academicYearOptions(), [])

  const loadSelections = async (selections: Parameters<typeof resolveNusmodsSelections>[0], targetSemester: number) => {
    const result = await resolveNusmodsSelections(selections, academicYear, targetSemester)
    const freshEntries = result.entries.filter(entry => !existingEntries.some(existing => (
      !existing.archivedAt
      && existing.subject === entry.subject
      && existing.weekday === entry.weekday
      && existing.startTime === entry.startTime
      && existing.endTime === entry.endTime
    )))
    const skipped = result.entries.length - freshEntries.length
    setDrafts(freshEntries)

    const notices: string[] = []
    if (skipped > 0) notices.push(t('이미 등록된 수업 {{count}}개는 제외했어요.', { count: skipped }))
    if (result.unresolved.length > 0) notices.push(t('분반을 찾지 못한 항목 {{count}}개가 있어요.', { count: result.unresolved.length }))
    setNotice(notices.join(' '))
    if (freshEntries.length === 0 && result.entries.length === 0) throw new Error('NO_RESULTS')
  }

  const readLink = async () => {
    setBusy(true); setError(null); setNotice(null); setDrafts([])
    try {
      const parsed = parseNusmodsShareLink(link)
      setSemester(parsed.semester)
      await loadSelections(parsed.selections, parsed.semester)
    } catch {
      setError(t('시간표를 불러오지 못했어요. NUSMods 공유 링크와 학년도를 확인해주세요.'))
    } finally {
      setBusy(false)
    }
  }

  const readPhoto = async () => {
    if (!file) return
    setBusy(true); setError(null); setNotice(null); setDrafts([]); setProgress(0)
    try {
      const selections = await readNusmodsImage(file, setProgress)
      if (selections.length === 0) throw new Error('NO_COMPONENTS')
      await loadSelections(selections, semester)
    } catch {
      setError(t('사진에서 시간표를 읽지 못했어요. NUSMods에서 내려받은 선명한 시간표 이미지를 사용해주세요.'))
    } finally {
      setBusy(false)
    }
  }

  const updateDraft = (id: string, patch: Partial<ImportedTimetableEntry>) => {
    setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...patch } : draft))
  }

  return (
    <div className="bg-white border border-line rounded-xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-bold text-ink">{t('NUSMods에서 시간표 불러오기')}</p>
          <p className="text-[11px] text-ink/45 mt-0.5">{t('공유 링크 또는 시간표 사진으로 한 번에 등록해요.')}</p>
        </div>
        <span className="text-campus font-bold">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 bg-paper rounded-lg p-1">
            <button type="button" onClick={() => setMode('link')} className={`rounded-md py-2 text-xs font-bold ${mode === 'link' ? 'bg-white text-campus shadow-sm' : 'text-ink/45'}`}>
              {t('공유 링크')}
            </button>
            <button type="button" onClick={() => setMode('photo')} className={`rounded-md py-2 text-xs font-bold ${mode === 'photo' ? 'bg-white text-campus shadow-sm' : 'text-ink/45'}`}>
              {t('시간표 사진')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-ink/50">
              {t('학년도')}
              <select value={academicYear} onChange={event => setAcademicYear(event.target.value)} disabled={busy}
                className="mt-1 w-full border border-line rounded-lg px-2.5 py-2 text-xs bg-white font-mono">
                {yearOptions.map(year => <option key={year} value={year}>AY {year.replace('-', '/')}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-ink/50">
              {t('학기')}
              <select value={semester} onChange={event => setSemester(Number(event.target.value))} disabled={busy || mode === 'link'}
                className="mt-1 w-full border border-line rounded-lg px-2.5 py-2 text-xs bg-white">
                <option value={1}>Semester 1</option>
                <option value={2}>Semester 2</option>
                <option value={3}>Special Term I</option>
                <option value={4}>Special Term II</option>
              </select>
            </label>
          </div>
          {mode === 'link' ? (
            <div className="space-y-2">
              <input value={link} onChange={event => setLink(event.target.value)} disabled={busy}
                placeholder={t('NUSMods 공유 링크 붙여넣기')}
                className="w-full border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
              <button type="button" onClick={readLink} disabled={busy || !link.trim()}
                className="w-full rounded-lg py-2.5 text-sm font-bold bg-campus text-paper disabled:opacity-40">
                {busy ? t('불러오는 중...') : t('링크 읽기')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block border border-dashed border-campus/30 bg-campus/5 rounded-lg px-4 py-4 text-center cursor-pointer">
                <span className="block text-sm font-bold text-campus">{file ? file.name : t('NUSMods 시간표 사진 선택')}</span>
                <span className="block text-[11px] text-ink/40 mt-1">PNG · JPG · WEBP</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  onChange={event => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <button type="button" onClick={readPhoto} disabled={busy || !file}
                className="w-full rounded-lg py-2.5 text-sm font-bold bg-campus text-paper disabled:opacity-40">
                {busy ? t('사진 분석 중... {{progress}}%', { progress }) : t('사진 읽기')}
              </button>
              <p className="text-[11px] text-ink/40 leading-relaxed">{t('API 비용 없이 이 기기에서 사진을 분석하며, 사진은 외부 서버에 업로드되지 않아요.')}</p>
            </div>
          )}

          {error && <p className="text-xs text-stamp bg-stamp/5 rounded-lg px-3 py-2 leading-relaxed">{error}</p>}
          {notice && <p className="text-xs text-gold bg-gold/5 rounded-lg px-3 py-2 leading-relaxed">{notice}</p>}

          {drafts.length > 0 && (
            <div className="space-y-3 pt-1">
              <div>
                <p className="text-xs font-bold text-ink/70">{t('인식 결과 ({{count}})', { count: drafts.length })}</p>
                <p className="text-[11px] text-ink/40 mt-1">{t('틀린 내용은 수정하고, 필요 없는 수업은 체크를 해제하세요.')}</p>
              </div>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {drafts.map(draft => (
                  <div key={draft.id} className={`rounded-lg border p-3 ${draft.selected ? 'border-campus/25 bg-campus/[0.03]' : 'border-line opacity-55'}`}>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={draft.selected} onChange={event => updateDraft(draft.id, { selected: event.target.checked })} className="accent-campus" />
                      <input value={draft.subject} onChange={event => updateDraft(draft.id, { subject: event.target.value })}
                        className="min-w-0 flex-1 bg-transparent font-bold text-sm text-ink outline-none border-b border-transparent focus:border-campus" />
                    </label>
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <select value={draft.weekday} onChange={event => updateDraft(draft.id, { weekday: Number(event.target.value) as Weekday })}
                        className="border border-line rounded-md px-2 py-1.5 text-xs bg-white">
                        {WEEKDAYS.map(day => <option key={day} value={day}>{weekdayLabel(day, language)}</option>)}
                      </select>
                      <div className="flex items-center gap-1.5">
                        <input type="time" value={draft.startTime} onChange={event => updateDraft(draft.id, { startTime: event.target.value })}
                          className="min-w-0 flex-1 border border-line rounded-md px-2 py-1.5 text-xs font-mono" />
                        <span className="text-ink/25">–</span>
                        <input type="time" value={draft.endTime} onChange={event => updateDraft(draft.id, { endTime: event.target.value })}
                          className="min-w-0 flex-1 border border-line rounded-md px-2 py-1.5 text-xs font-mono" />
                      </div>
                    </div>
                    <input value={draft.location} onChange={event => updateDraft(draft.id, { location: event.target.value })}
                      placeholder={t('강의실 (선택)')}
                      className="mt-2 w-full border border-line rounded-md px-2 py-1.5 text-xs" />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={async () => {
                  setBusy(true); setError(null)
                  try {
                    await onImport(drafts.filter(isValidDraft))
                    setDrafts([]); setNotice(t('시간표를 추가했어요.'))
                  } catch {
                    setError(t('시간표를 추가하지 못했어요.'))
                  } finally {
                    setBusy(false)
                  }
                }}
                className="w-full rounded-lg py-2.5 text-sm font-bold bg-campus text-paper disabled:opacity-40"
              >
                {busy ? t('저장중...') : t('선택한 {{count}}개 시간표에 추가', { count: selectedCount })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
