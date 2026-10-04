import React, { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import GroupHome from './components/GroupHome'
import GroupDashboard from './components/GroupDashboard'
import ErrorBoundary from './components/ErrorBoundary'
import InstallAppPrompt from './components/InstallAppPrompt'
import LanguageToggle from './components/LanguageToggle'
import PasswordRecovery from './components/PasswordRecovery'
import { LanguageProvider, useLanguage } from './lib/i18n'

function Shell() {
  const [groupId, setGroupId] = useState<string | null>(null)

  return groupId
    ? <GroupDashboard groupId={groupId} onBack={() => setGroupId(null)} />
    : <GroupHome onSelect={setGroupId} />
}

function LoadingScreen() {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-ink/30">{t('불러오는 중...')}</p>
    </div>
  )
}

function TopBar() {
  const { profile, session, signOut } = useAuth()
  const { t } = useLanguage()
  return (
    <div className="max-w-xl mx-auto px-5 pt-3 flex items-center justify-end gap-3">
      <LanguageToggle />
      <div className="min-w-0 text-right text-[11px] text-ink/40">
        <p>{profile?.name}</p>
        <p className="truncate" title={session?.user.email}>{session?.user.email}</p>
      </div>
      <button onClick={signOut} className="shrink-0 text-[11px] font-bold text-ink/30 hover:text-ink">{t('로그아웃')}</button>
    </div>
  )
}

function Gate() {
  const { session, profile, loading, profileError, retryProfile, signOut, passwordRecovery } = useAuth()
  const { t } = useLanguage()

  if (loading) return <LoadingScreen />
  if (passwordRecovery) return <PasswordRecovery />
  if (!session) return <Login />
  if (profileError) return (
    <div className="max-w-sm mx-auto px-5 py-16 text-center">
      <p className="text-sm text-ink/60 mb-4">{t('프로필을 불러오지 못했어요. 다시 시도해주세요.')}</p>
      <button onClick={retryProfile} className="rounded-lg bg-campus text-paper px-4 py-2 text-sm font-bold">{t('다시 시도')}</button>
      <button onClick={signOut} className="ml-4 text-xs text-ink/40">{t('로그아웃')}</button>
    </div>
  )
  if (!profile || !profile.name.trim()) return <Onboarding />

  return (
    <StoreProvider key={session.user.id}>
      <TopBar />
      <Shell />
    </StoreProvider>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <AuthProvider>
          <Gate />
          <InstallAppPrompt />
        </AuthProvider>
      </ErrorBoundary>
    </LanguageProvider>
  )
}
