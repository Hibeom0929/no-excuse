import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Profile, loadMyProfile, saveMyProfileName } from './profile'
export type { Profile } from './profile'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
  retryProfile: () => void
  passwordRecovery: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>
  requestPasswordReset: (email: string) => Promise<{ error?: string }>
  updatePassword: (password: string) => Promise<{ error?: string }>
  updateName: (name: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profileState, setProfileState] = useState<{ userId: string | null; profile: Profile | null; error: string | null }>({
    userId: null, profile: null, error: null,
  })
  const [initializing, setInitializing] = useState(true)
  const [profileRetry, setProfileRetry] = useState(0)
  const userId = session?.user.id ?? null
  const profile = profileState.userId === userId ? profileState.profile : null
  const profileError = profileState.userId === userId ? profileState.error : null
  const loading = initializing || (!!userId && profileState.userId !== userId)
  const [passwordRecovery, setPasswordRecovery] = useState(() => (
    window.location.hash.includes('type=recovery')
    || new URLSearchParams(window.location.search).get('type') === 'recovery'
  ))

  useEffect(() => {
    let active = true
    let receivedEvent = false
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!receivedEvent) setSession(data.session)
      setInitializing(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      receivedEvent = true
      setSession(newSession)
      setInitializing(false)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // 인증 이벤트 밖에서 조회하고, 계정 전환 후 도착한 이전 계정의 응답은 무시한다.
  useEffect(() => {
    if (!userId) {
      setProfileState({ userId: null, profile: null, error: null })
      return
    }
    let active = true
    loadMyProfile(userId).then(profile => {
      if (active) setProfileState({ userId, profile, error: null })
    }).catch(error => {
      if (active) setProfileState({ userId, profile: null, error: error instanceof Error ? error.message : '프로필을 불러오지 못했어요.' })
    })
    return () => { active = false }
  }, [userId, profileRetry])

  const retryProfile = useCallback(() => {
    setProfileState({ userId: null, profile: null, error: null })
    setProfileRetry(value => value + 1)
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message }
  }, [])

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message, needsEmailConfirmation: !error && !data.session }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    return { error: error?.message }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) {
      setPasswordRecovery(false)
      await supabase.auth.signOut()
    }
    return { error: error?.message }
  }, [])

  const updateName = useCallback(async (name: string) => {
    if (!session) return { error: '로그인이 필요해요' }
    const currentUserId = session.user.id
    try {
      const saved = await saveMyProfileName(currentUserId, name)
      setProfileState(current => current.userId === currentUserId ? { userId: currentUserId, profile: saved, error: null } : current)
      return {}
    } catch (error) {
      return { error: error instanceof Error ? error.message : '프로필을 저장하지 못했어요. 다시 시도해주세요.' }
    }
  }, [session])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <Ctx.Provider value={{
      session, profile, loading, profileError, retryProfile, passwordRecovery,
      signInWithPassword, signUpWithPassword, requestPasswordReset, updatePassword,
      updateName, signOut,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
