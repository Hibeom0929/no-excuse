import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttendanceRecord, Group } from '../types'

export const STORY_BUCKET = 'attendance-stories'
export const MAX_STORY_BYTES = 200 * 1024
export interface AttendanceStory {
  id: string
  attendanceRecordId: string
  groupId: string
  memberId: string
  subject: string
  checkedInAt: string
  createdAt: string
  expiresAt: string
  objectPath?: string
}

export function mapStory(row: any): AttendanceStory {
  return {
    id: row.id, attendanceRecordId: row.attendance_record_id,
    groupId: row.group_id, memberId: row.member_id, subject: row.subject,
    checkedInAt: row.checked_in_at, createdAt: row.created_at,
    expiresAt: row.expires_at, objectPath: row.object_path ?? undefined,
  }
}

export function activeStories(stories: AttendanceStory[], groupId: string, now: number): AttendanceStory[] {
  return stories.filter(s => s.groupId === groupId && Date.parse(s.createdAt) <= now && Date.parse(s.expiresAt) > now)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
}

export function visibleGroupStories(stories: AttendanceStory[], group: Group, records: AttendanceRecord[], now: number): AttendanceStory[] {
  if (group.archivedAt) return []
  return activeStories(stories, group.id, now).filter(s =>
    group.members.some(m => m.id === s.memberId && !m.leftAt) &&
    records.some(r => r.id === s.attendanceRecordId && r.groupId === group.id && r.memberId === s.memberId && r.status === 'present'))
}

export function storyPhotoBlob(photo: string): Blob {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) throw new Error('사진을 처리하지 못했어요. 다시 시도해주세요.')
  const binary = atob(photo.slice(photo.indexOf(',') + 1))
  if (!binary.length || binary.length > MAX_STORY_BYTES) throw new Error('사진은 200KB 이하로 압축해주세요.')
  return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: 'image/jpeg' })
}

// Upload first, then atomically commit attendance + its story on the server.
// Failed uploads must never produce a successful check-in or orphan attendance.
export async function checkInWithStory(
  client: SupabaseClient, entryId: string, groupId: string, meId: string, date: string, photo?: string,
): Promise<void> {
  let path: string | undefined
  let keepUpload = false
  let committed = false
  try {
    if (photo) {
      const blob = storyPhotoBlob(photo)
      path = `${groupId}/${meId}/${crypto.randomUUID()}.jpg`
      const { error } = await client.storage.from(STORY_BUCKET).upload(path, blob, {
        contentType: 'image/jpeg', cacheControl: '0', upsert: false,
      })
      if (error) throw new Error('사진 업로드에 실패했어요. 다시 시도해주세요.')
    }
    const { data, error } = await client.rpc('check_in_with_story', {
      p_entry_id: entryId, p_date: date, p_object_path: path ?? null,
    })
    if (error || !data?.attendance_id) throw new Error(error?.message ?? '체크인에 실패했어요')
    committed = true
    keepUpload = !!path && data.object_path === path
  } finally {
    if (path && committed && !keepUpload) {
      // A successful idempotent retry can leave an unused upload. On ANY RPC
      // failure/timeout its commit state is ambiguous: leave the file alone;
      // only the server's orphan sweep can safely decide whether to remove it.
      try { await client.storage.from(STORY_BUCKET).remove([path]) } catch { /* server sweep retries orphans */ }
    }
  }
}

export async function loadStories(client: SupabaseClient, groupId: string): Promise<AttendanceStory[]> {
  const { data, error } = await client.rpc('list_attendance_stories', { p_group_id: groupId })
  if (error || !Array.isArray(data)) throw new Error('인증사진을 불러오지 못했어요.')
  return data.map(mapStory)
}

export async function loadStoryPhoto(client: SupabaseClient, story: AttendanceStory): Promise<Blob> {
  if (story.objectPath) {
    // Authenticated download checks membership and expiry on every request;
    // no reusable public or signed URL is stored or shared.
    const { data, error } = await client.storage.from(STORY_BUCKET).download(story.objectPath)
    if (error || !data) throw new Error('사진을 불러오지 못했어요. 다시 시도해주세요.')
    return data
  }
  const { data, error } = await client.rpc('read_legacy_story_photo', { p_record_id: story.attendanceRecordId })
  if (error || typeof data !== 'string') throw new Error('사진을 불러오지 못했어요. 다시 시도해주세요.')
  return storyPhotoBlob(data)
}
