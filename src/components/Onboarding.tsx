import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import LanguageToggle from './LanguageToggle'

export default function Onboarding() {
  const { updateName } = useAuth()
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="max-w-sm mx-auto px-5 py-16 md:py-24">
      <div className="absolute right-5 top-[calc(env(safe-area-inset-top)+0.75rem)]"><LanguageToggle /></div>
      <h1 className="text-2xl font-black text-ink mb-2">{t('거의 다 됐어요!')}</h1>
      <p className="text-sm text-ink/60 mb-6">{t('그룹 친구들에게 표시될 이름을 알려주세요.')}</p>
      <form
        className="space-y-3"
        onSubmit={async e => {
          e.preventDefault()
          if (!name.trim()) return
          setLoading(true); setError(null)
          const { error } = await updateName(name.trim())
          setLoading(false)
          if (error) setError(error)
        }}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('예) 김민준')}
          className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30"
        />
        {error && <p className="text-xs text-stamp">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-campus text-paper font-bold text-sm rounded-lg py-3 hover:bg-campusLight disabled:opacity-50"
        >
          {loading ? t('저장중...') : t('시작하기')}
        </button>
      </form>
    </div>
  )
}
