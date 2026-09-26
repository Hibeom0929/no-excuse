import React from 'react'
import { useLanguage } from '../lib/i18n'

export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className="inline-flex rounded-full border border-line bg-white p-0.5 shadow-card" aria-label="Language">
      {(['ko', 'en'] as const).map(option => (
        <button
          key={option}
          type="button"
          onClick={() => setLanguage(option)}
          aria-label={option === 'ko' ? t('한국어') : t('영어')}
          aria-pressed={language === option}
          className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide transition-colors ${
            language === option ? 'bg-campus text-paper' : 'text-ink/35 hover:text-ink'
          }`}
        >
          {option === 'ko' ? 'KR' : 'EN'}
        </button>
      ))}
    </div>
  )
}
