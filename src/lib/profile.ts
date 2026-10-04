import { supabase } from './supabase'

export interface Profile {
  id: string
  name: string
}

function readProfile(data: unknown, userId: string): Profile {
  const row = data as Partial<Profile> | null
  if (!row || row.id !== userId || typeof row.name !== 'string') {
    throw new Error('프로필을 저장하지 못했어요. 다시 시도해주세요.')
  }
  return { id: row.id, name: row.name }
}

export async function loadMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id, name').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return readProfile(data, userId)

  // 이전 계정에 프로필이 누락되어 있으면 서버에서 로그인한 본인의 행만 복구한다.
  const { data: restored, error: restoreError } = await supabase.rpc('save_my_profile', { p_name: null }).single()
  if (restoreError) throw new Error(restoreError.message)
  return readProfile(restored, userId)
}

export async function saveMyProfileName(userId: string, name: string): Promise<Profile> {
  const { data, error } = await supabase.rpc('save_my_profile', { p_name: name.trim() }).single()
  if (error) throw new Error(error.message)
  return readProfile(data, userId)
}
