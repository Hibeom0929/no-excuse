import React, { useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import LanguageToggle from './LanguageToggle'
import { validateEmail } from '../lib/email'

type Mode = 'signIn' | 'signUp'

export default function Login() {
  const { signInWithPassword, signUpWithPassword, requestPasswordReset } = useAuth()
  const { t } = useLanguage()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const checkedEmail = validateEmail(email)
  const showEmailError = !checkedEmail.valid && (emailTouched || !!checkedEmail.suggestion)
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const friendlyError = (message: string) => {
    if (message === 'Invalid login credentials') return t('이메일 또는 비밀번호가 맞지 않아요.')
    if (message === 'Email not confirmed') return t('먼저 이메일로 보낸 확인 링크를 눌러주세요.')
    if (message === 'User already registered') return t('이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해주세요.')
    return t(message)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setPassword('')
    setPasswordAgain('')
    setError(null)
    setNotice(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setEmailTouched(true)
    if (!checkedEmail.valid) { setError(null); setNotice(null); return }
    const normalizedEmail = checkedEmail.email
    if (!password) { setError(t('비밀번호를 입력해주세요.')); return }

    if (mode === 'signUp' && password.length < 6) {
      setError(t('비밀번호는 6자리 이상으로 만들어주세요.'))
      return
    }
    if (mode === 'signUp' && password !== passwordAgain) {
      setError(t('비밀번호가 서로 다릅니다.'))
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    if (mode === 'signIn') {
      const { error: signInError } = await signInWithPassword(normalizedEmail, password)
      if (signInError) setError(friendlyError(signInError))
    } else {
      const { error: signUpError, needsEmailConfirmation } = await signUpWithPassword(normalizedEmail, password)
      if (signUpError) setError(friendlyError(signUpError))
      else if (needsEmailConfirmation) {
        setNotice(t('확인 메일을 보냈어요. 메일의 링크를 한 번 누른 뒤 이 앱으로 돌아와 로그인하세요.'))
        setMode('signIn')
        setPassword('')
        setPasswordAgain('')
      }
    }
    setLoading(false)
  }

  const resetPassword = async () => {
    setEmailTouched(true)
    if (!checkedEmail.valid) { setError(null); setNotice(null); return }
    setLoading(true)
    setError(null)
    setNotice(null)
    const { error: resetError } = await requestPasswordReset(checkedEmail.email)
    if (resetError) setError(friendlyError(resetError))
    else setNotice(t('비밀번호 설정 메일을 보냈어요. 메일의 링크에서 새 비밀번호를 만들어주세요.'))
    setLoading(false)
  }

  return (
    <div className="max-w-sm mx-auto px-5 py-16 md:py-24">
      <div className="absolute right-5 top-[calc(env(safe-area-inset-top)+0.75rem)]"><LanguageToggle /></div>
      <p className="text-xs tracking-[0.2em] text-campus/70 font-mono uppercase mb-2">Attendance &amp; Fine Log</p>
      <h1 className="text-3xl font-black text-ink leading-tight mb-2">No Excuse</h1>
      <p className="text-sm text-ink/60 mb-2 leading-relaxed">{t('이메일과 비밀번호로 로그인하면 친구들과 같은 그룹을 실시간으로 공유할 수 있어요.')}</p>
      <p className="text-xs text-ink/40 mb-6 leading-relaxed">{t('한 번 로그인하면 이 기기에서 로그인 상태가 유지됩니다.')}</p>

      <div className="mb-5 grid grid-cols-2 rounded-xl bg-campus/5 p-1">
        <button type="button" onClick={() => switchMode('signIn')}
          className={`rounded-lg py-2 text-xs font-bold ${mode === 'signIn' ? 'bg-white text-campus shadow-card' : 'text-ink/40'}`}>
          {t('로그인')}
        </button>
        <button type="button" onClick={() => switchMode('signUp')}
          className={`rounded-lg py-2 text-xs font-bold ${mode === 'signUp' ? 'bg-white text-campus shadow-card' : 'text-ink/40'}`}>
          {t('처음 가입')}
        </button>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-campus/20 bg-campus/5 p-3 text-xs leading-relaxed text-campus">{notice}</div>}

      <form className="space-y-3" onSubmit={submit} noValidate>
        <input
          ref={emailInput}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={event => { setEmail(event.target.value); setError(null); setNotice(null) }}
          onBlur={() => setEmailTouched(true)}
          aria-label={t('이메일')}
          aria-invalid={showEmailError}
          aria-describedby={showEmailError ? 'email-feedback' : undefined}
          placeholder={t('학교 이메일 또는 자주 쓰는 이메일')}
          className={`w-full border rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30 ${showEmailError ? 'border-stamp/50' : 'border-line'}`}
        />
        {showEmailError && !checkedEmail.valid && (
          <div id="email-feedback" aria-live="polite" className="rounded-lg border border-stamp/20 bg-stamp/5 p-3 text-xs leading-relaxed">
            <p className="text-stamp">{t(checkedEmail.error)}</p>
            {checkedEmail.suggestion && (
              <button type="button"
                onClick={() => {
                  setEmail(checkedEmail.suggestion!); setEmailTouched(true); setError(null); setNotice(null)
                  emailInput.current?.focus()
                }}
                className="mt-2 max-w-full break-all text-left font-bold text-campus underline underline-offset-2">
                {t('{{email}}으로 수정', { email: checkedEmail.suggestion })}
              </button>
            )}
          </div>
        )}
        <input
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder={t('비밀번호 (6자리 이상)')}
          className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30"
        />
        {mode === 'signUp' && (
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={passwordAgain}
            onChange={event => setPasswordAgain(event.target.value)}
            placeholder={t('비밀번호 한 번 더 입력')}
            className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30"
          />
        )}
        {error && <p className="text-xs text-stamp">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-campus text-paper font-bold text-sm rounded-lg py-3 hover:bg-campusLight disabled:opacity-50">
          {loading ? t('처리중...') : mode === 'signIn' ? t('로그인') : t('계정 만들기')}
        </button>
      </form>

      {mode === 'signIn' && (
        <button type="button" onClick={resetPassword} disabled={loading}
          className="mt-4 w-full text-center text-xs font-bold text-ink/40 hover:text-campus disabled:opacity-50">
          {t('비밀번호 만들기 / 재설정')}
        </button>
      )}
    </div>
  )
}
