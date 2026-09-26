import React, { useState } from 'react'
import { compressImageFile } from '../lib/image'
import { useLanguage } from '../lib/i18n'

export function StampMark({ kind }: { kind: 'present' | 'absent' | 'excused' }) {
  const { t } = useLanguage()
  const label = kind === 'present' ? t('출석') : kind === 'absent' ? t('결석') : t('해명중')
  const color = kind === 'present' ? 'border-campus text-campus' : kind === 'absent' ? 'border-stamp text-stamp' : 'border-gold text-gold'
  return (
    <span
      className={`stamp-pop inline-flex items-center justify-center border-[3px] rounded-full w-16 h-16 -rotate-6 font-black text-xs tracking-wider ${color}`}
      style={{ fontFamily: 'inherit' }}
    >
      {label}
    </span>
  )
}

export function CheckInStamp({
  onConfirm, requirePhoto,
}: {
  onConfirm: (photo?: string) => void
  requirePhoto: boolean
}) {
  const { t } = useLanguage()
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [stamped, setStamped] = useState(false)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const handleFile = async (file?: File) => {
    if (!file) return
    setLoadingPhoto(true)
    setPhotoError(null)
    try {
      // 원본을 그대로 저장하면 용량이 너무 커서 리사이즈 + 압축 후 저장
      const compressed = await compressImageFile(file)
      setPhoto(compressed)
    } catch {
      setPhotoError(t('사진을 처리하지 못했어요. 다시 시도해주세요.'))
    } finally {
      setLoadingPhoto(false)
    }
  }

  if (stamped) {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <StampMark kind="present" />
        <span className="text-xs text-campus font-bold">{t('출석 완료!')}</span>
      </div>
    )
  }

  const canConfirm = (!requirePhoto || !!photo) && !loadingPhoto

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {photo && (
          <img src={photo} alt={t('인증샷')} className="w-11 h-11 rounded-lg object-cover border border-line" />
        )}
        <label className={`cursor-pointer text-xs font-bold rounded-lg px-2.5 py-2 whitespace-nowrap border ${
          requirePhoto && !photo ? 'border-gold text-gold' : 'border-line text-ink/50 hover:border-campus/40'
        }`}>
          {loadingPhoto ? t('처리중...') : t('📷 인증샷{{required}}', { required: requirePhoto ? t(' (필수)') : '' })}
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={loadingPhoto}
            onChange={e => handleFile(e.target.files?.[0])} />
        </label>
        <button
          onClick={() => { if (!canConfirm) return; setStamped(true); onConfirm(photo) }}
          disabled={!canConfirm}
          className="flex-1 bg-campus text-paper font-bold text-sm rounded-lg py-2.5 hover:bg-campusLight transition-colors disabled:bg-line disabled:text-ink/30 disabled:cursor-not-allowed"
        >
          {loadingPhoto ? t('사진 처리중...') : t('출석 도장 찍기')}
        </button>
      </div>
      {photoError && <p className="text-[11px] text-stamp">{photoError}</p>}
    </div>
  )
}
