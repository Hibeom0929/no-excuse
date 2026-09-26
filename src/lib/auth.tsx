import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Profile {
  id: string
  name: string
}

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  loading: boolean
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(() => (
    window.location.hash.includes('type=recovery')
    || new URLSearchParams(window.location.search).get('type') === 'recovery'
  ))

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('id, name').eq('id', userId).single()
    if (!error && data) setProfile(data as Profile)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (newSession) loadProfile(newSession.user.id)
      else setProfile(null)
    })

    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

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
    const { error } = await supabase.from('profiles').update({ name }).eq('id', session.user.id)
    if (!error) setProfile(p => (p ? { ...p, name } : { id: session.user.id, name }))
    return { error: error?.message }
  }, [session])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <Ctx.Provider value={{
      session, profile, loading, passwordRecovery,
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
