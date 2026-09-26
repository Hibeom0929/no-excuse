import React, { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import GroupHome from './components/GroupHome'
import GroupDashboard from './components/GroupDashboard'
import ErrorBoundary from './components/ErrorBoundary'
import InstallAppPrompt from './components/InstallAppPrompt'

function Shell() {
  const [groupId, setGroupId] = useState<string | null>(null)

  return groupId
    ? <GroupDashboard groupId={groupId} onBack={() => setGroupId(null)} />
    : <GroupHome onSelect={setGroupId} />
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-ink/30">불러오는 중...</p>
    </div>
  )
}

function TopBar() {
  const { profile, signOut } = useAuth()
  return (
    <div className="max-w-xl mx-auto px-5 pt-3 flex items-center justify-end gap-3">
      <span className="text-[11px] text-ink/30">{profile?.name}</span>
      <button onClick={signOut} className="text-[11px] font-bold text-ink/30 hover:text-ink">로그아웃</button>
    </div>
  )
}

function Gate() {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Login />
  if (!profile || !profile.name.trim()) return <Onboarding />

  return (
    <StoreProvider>
      <TopBar />
      <Shell />
    </StoreProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
        <InstallAppPrompt />
      </AuthProvider>
    </ErrorBoundary>
  )
}
