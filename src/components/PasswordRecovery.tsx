import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import LanguageToggle from './LanguageToggle'

export default function PasswordRecovery() {
  const { updatePassword } = useAuth()
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 6) {
      setError(t('비밀번호는 6자리 이상으로 만들어주세요.'))
      return
    }
    if (password !== passwordAgain) {
      setError(t('비밀번호가 서로 다릅니다.'))
      return
    }
    setLoading(true)
    setError(null)
    const { error: updateError } = await updatePassword(password)
    if (updateError) setError(updateError)
    setLoading(false)
  }

  return (
    <div className="max-w-sm mx-auto px-5 py-16 md:py-24">
      <div className="absolute right-5 top-[calc(env(safe-area-inset-top)+0.75rem)]"><LanguageToggle /></div>
      <p className="text-xs tracking-[0.2em] text-campus/70 font-mono uppercase mb-2">Attendance &amp; Fine Log</p>
      <h1 className="text-3xl font-black text-ink mb-2">{t('새 비밀번호 만들기')}</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink/50">{t('새 비밀번호를 저장한 뒤 홈 화면의 No Excuse 앱으로 돌아가 로그인하세요.')}</p>
      <form className="space-y-3" onSubmit={submit}>
        <input type="password" autoComplete="new-password" minLength={6} required value={password}
          onChange={event => setPassword(event.target.value)} placeholder={t('새 비밀번호 (6자리 이상)')}
          className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
        <input type="password" autoComplete="new-password" minLength={6} required value={passwordAgain}
          onChange={event => setPasswordAgain(event.target.value)} placeholder={t('비밀번호 한 번 더 입력')}
          className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
        {error && <p className="text-xs text-stamp">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-campus text-paper font-bold text-sm rounded-lg py-3 hover:bg-campusLight disabled:opacity-50">
          {loading ? t('저장중...') : t('비밀번호 저장')}
        </button>
      </form>
    </div>
  )
}
