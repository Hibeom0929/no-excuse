import type { SupabaseClient } from '@supabase/supabase-js'
import { AppData, Member } from '../types'
import { mapGroup, mapTimetable, mapAttendance, mapFine, mapExcuse } from './mappers'

function rows<T>(response: { data: T[] | null; error?: { message: string } | null }): T[] {
  if (response.error) throw new Error(response.error.message)
  if (!Array.isArray(response.data)) throw new Error('데이터를 불러오지 못했어요')
  return response.data
}

// Never convert a failed query into an empty attendance/voting history. Return
// a complete snapshot, or throw so the caller can preserve its last good one.
export async function loadAppData(client: SupabaseClient, meId: string): Promise<AppData> {
  const memberships = rows(await client.from('group_members').select('group_id').eq('member_id', meId).is('left_at', null))
  const groupIds = memberships.map(m => m.group_id as string)
  if (!groupIds.length) return { groups: [], timetable: [], attendance: [], fines: [], excuses: [] }

  const [groups, members, timetable, attendance, fines, excuses] = (await Promise.all([
    client.from('groups').select('*').in('id', groupIds),
    client.from('group_members').select('group_id, member_id, left_at, profiles ( id, name )').in('group_id', groupIds),
    client.from('timetable_entries').select('*').in('group_id', groupIds),
    client.from('attendance_records').select('*').in('group_id', groupIds),
    client.from('fine_transactions').select('*').in('group_id', groupIds),
    client.from('excuse_requests').select('*').in('group_id', groupIds).is('superseded_by', null),
  ])).map(result => rows(result))

  const membersByGroup = new Map<string, Member[]>()
  for (const row of members) {
    const list = membersByGroup.get(row.group_id) ?? []
    const p = row.profiles as unknown as { id: string; name: string } | null
    list.push({ id: row.member_id, name: p?.name?.trim() || '(이름 미설정)', leftAt: row.left_at ?? undefined })
    membersByGroup.set(row.group_id, list)
  }
  const excuseIds = excuses.map(row => row.id as string)
  const votes = excuseIds.length
    ? rows(await client.from('excuse_votes').select('*').in('excuse_id', excuseIds)) : []
  const votesByExcuse = new Map<string, Record<string, boolean>>()
  for (const vote of votes) {
    const record = votesByExcuse.get(vote.excuse_id) ?? {}
    record[vote.voter_id] = vote.approve
    votesByExcuse.set(vote.excuse_id, record)
  }
  return {
    groups: groups.map(group => mapGroup(group, membersByGroup.get(group.id) ?? [])),
    timetable: timetable.map(mapTimetable), attendance: attendance.map(mapAttendance),
    fines: fines.map(mapFine), excuses: excuses.map(excuse => mapExcuse(excuse, votesByExcuse.get(excuse.id) ?? {})),
  }
}
