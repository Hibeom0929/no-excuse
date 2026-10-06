import React, { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { AttendanceRecord } from '../types'
import { useLanguage } from '../lib/i18n'

export default function ExcuseModal({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  const { fileExcuse } = useStore()
  const { t } = useLanguage()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end md:items-center justify-center z-50 px-0 md:px-4"
      onClick={() => { if (!busy) onClose() }}>
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:max-w-sm shadow-card"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-ink mb-1">{t('결석 해명하기')}</h3>
        <p className="text-xs text-ink/50 mb-4">{t('사유를 적으면 팀원들의 투표로 벌금 면제 여부가 결정돼요. 과반수가 인정하면 벌금이 면제돼요.')}</p>
        <textarea
          value={reason}
          disabled={busy}
          maxLength={2000}
          onChange={e => setReason(e.target.value)}
          placeholder={t('예) 갑자기 몸살이 나서 병원에 다녀왔어요. 진료 확인서 있어요.')}
          rows={4}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-campus/30"
        />
        {error && <p role="alert" className="text-sm text-stamp mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button disabled={busy} onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper disabled:opacity-40">
            {t('취소')}
          </button>
          <button
            onClick={async () => {
              if (!reason.trim() || submitting.current) return
              submitting.current = true
              setBusy(true); setError(null)
              try {
                await fileExcuse(record, reason.trim())
                onClose()
              } catch (err) {
                setError(t(err instanceof Error ? err.message : '해명 제출에 실패했어요'))
              } finally {
                submitting.current = false
                setBusy(false)
              }
            }}
            disabled={busy || !reason.trim()}
            className="flex-[2] rounded-lg py-2.5 text-sm font-bold bg-gold text-ink hover:brightness-95 disabled:opacity-40"
          >
            {busy ? t('처리중...') : t('해명 제출하고 투표 요청')}
          </button>
        </div>
      </div>
    </div>
  )
}
