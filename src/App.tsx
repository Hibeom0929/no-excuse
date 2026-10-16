import React, { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider, useStore } from './lib/store'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import GroupHome from './components/GroupHome'
import GroupDashboard from './components/GroupDashboard'
import ErrorBoundary from './components/ErrorBoundary'
import InstallAppPrompt from './components/InstallAppPrompt'
import LanguageToggle from './components/LanguageToggle'
import PasswordRecovery from './components/PasswordRecovery'
import { LanguageProvider, useLanguage } from './lib/i18n'
import NotificationSettings from './components/NotificationSettings'
import { pushRoute, validPushId } from './lib/push'

function Shell() {
  const [groupId, setGroupId] = useState<string | null>(() => pushRoute(window.location.search)?.groupId ?? null)
  const [routeVersion, setRouteVersion] = useState(0)
  const { loading } = useStore()
  useEffect(() => {
    const open = (event: MessageEvent) => {
      if (event.data?.type !== 'NO_EXCUSE_OPEN_CLASS' || !validPushId(event.data.groupId) || !validPushId(event.data.entryId)) return
      const target = new URL(window.location.href)
      target.searchParams.set('group', event.data.groupId); target.searchParams.set('entry', event.data.entryId)
      window.history.replaceState(null, '', target)
      setGroupId(event.data.groupId); setRouteVersion(value => value + 1)
    }
    navigator.serviceWorker?.addEventListener('message', open)
    return () => navigator.serviceWorker?.removeEventListener('message', open)
  }, [])
  const select = (next: string | null) => {
    const target = new URL(window.location.href)
    target.searchParams.delete('group'); target.searchParams.delete('entry')
    window.history.replaceState(null, '', target)
    setGroupId(next)
  }
  if (loading) return <LoadingScreen />

  return groupId
    ? <GroupDashboard key={`${groupId}:${routeVersion}`} groupId={groupId} onBack={() => select(null)} />
    : <GroupHome onSelect={select} />
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
      <NotificationSettings />
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
