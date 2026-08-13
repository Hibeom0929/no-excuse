import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import {
  AppData, Group, Member, TimetableEntry, AttendanceRecord, CurrencyCode,
} from '../types'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { makeInviteCode } from './inviteCode'
import { mapGroup, mapTimetable, mapAttendance, mapFine, mapExcuse } from './mappers'
import { todayDateStr, todayWeekday, nowHHMM, hasClassEnded } from './time'

const EMPTY: AppData = { groups: [], timetable: [], attendance: [], fines: [], excuses: [] }

interface Ctx {
  data: AppData
  loading: boolean
  createGroup: (name: string, fineAmount: number, currency: CurrencyCode, accountInfo: string, requirePhotoToCheckIn: boolean) => Promise<string>
  joinGroup: (inviteCode: string) => Promise<string | null>
  addTimetableEntry: (e: Omit<TimetableEntry, 'id'>) => Promise<void>
  updateTimetableEntry: (id: string, patch: Omit<TimetableEntry, 'id' | 'groupId' | 'memberId'>) => Promise<void>
  removeTimetableEntry: (id: string) => Promise<void>
  checkIn: (entry: TimetableEntry, photo?: string) => Promise<void>
  cancelCheckIn: (record: AttendanceRecord) => Promise<void>
  fileExcuse: (record: AttendanceRecord, reason: string) => Promise<void>
  castVote: (excuseId: string, voterMemberId: string, approve: boolean) => Promise<void>
  markFinesSettled: (memberId: string, groupId: string) => Promise<void>
  setTreasurer: (groupId: string, memberId: string) => Promise<void>
  processAutoAbsences: (group: Group) => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const meId = profile?.id ?? null

  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const dataRef = useRef(data)
  dataRef.current = data

  const refreshAll = useCallback(async () => {
    if (!meId) { setData(EMPTY); setLoading(false); return }

    const { data: myMemberships } = await supabase.from('group_members').select('group_id').eq('member_id', meId)
    const groupIds = (myMemberships ?? []).map(m => m.group_id as string)

    if (groupIds.length === 0) {
      setData(EMPTY); setLoading(false); return
    }

    const [groupsRes, membersRes, ttRes, attRes, fineRes, excRes] = await Promise.all([
      supabase.from('groups').select('*').in('id', groupIds),
      supabase.from('group_members').select('group_id, member_id, profiles ( id, name )').in('group_id', groupIds),
      supabase.from('timetable_entries').select('*').in('group_id', groupIds),
      supabase.from('attendance_records').select('*').in('group_id', groupIds),
      supabase.from('fine_transactions').select('*').in('group_id', groupIds),
      supabase.from('excuse_requests').select('*').in('group_id', groupIds),
    ])

    const membersByGroup = new Map<string, Member[]>()
    for (const row of membersRes.data ?? []) {
      const list = membersByGroup.get(row.group_id) ?? []
      const p = row.profiles as unknown as { id: string; name: string } | null
      list.push({ id: row.member_id, name: p?.name?.trim() || '(이름 미설정)' })
      membersByGroup.set(row.group_id, list)
    }

    const excuseIds = (excRes.data ?? []).map(r => r.id as string)
    const votesRes = excuseIds.length
      ? await supabase.from('excuse_votes').select('*').in('excuse_id', excuseIds)
      : { data: [] as any[] }

    const votesByExcuse = new Map<string, Record<string, boolean>>()
    for (const v of votesRes.data ?? []) {
      const rec = votesByExcuse.get(v.excuse_id) ?? {}
      rec[v.voter_id] = v.approve
      votesByExcuse.set(v.excuse_id, rec)
    }

    setData({
      groups: (groupsRes.data ?? []).map(g => mapGroup(g, membersByGroup.get(g.id) ?? [])),
      timetable: (ttRes.data ?? []).map(mapTimetable),
      attendance: (attRes.data ?? []).map(mapAttendance),
      fines: (fineRes.data ?? []).map(mapFine),
      excuses: (excRes.data ?? []).map(r => mapExcuse(r, votesByExcuse.get(r.id) ?? {})),
    })
    setLoading(false)
  }, [meId])

  useEffect(() => { refreshAll() }, [refreshAll])

  // 실시간 동기화: 친구가 체크인/투표하면 내 화면에도 반영되도록 구독.
  // (소규모 친구 그룹 용도라 테이블 전체를 구독 후 새로고침하는 단순한 방식을 씀 —
  //  사용자가 아주 많아지면 group_id 단위 필터 구독으로 최적화가 필요함)
  useEffect(() => {
    if (!meId) return
    let timeout: ReturnType<typeof setTimeout>
    const debouncedRefresh = () => { clearTimeout(timeout); timeout = setTimeout(refreshAll, 400) }

    const channel = supabase.channel('setlog-realtime')
    const tables = ['groups', 'group_members', 'timetable_entries', 'attendance_records', 'fine_transactions', 'excuse_requests', 'excuse_votes']
    for (const table of tables) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, debouncedRefresh)
    }
    channel.subscribe()

    return () => { clearTimeout(timeout); supabase.removeChannel(channel) }
  }, [meId, refreshAll])

  const createGroup = useCallback(async (name: string, fineAmount: number, currency: CurrencyCode, accountInfo: string, requirePhotoToCheckIn: boolean) => {
    if (!meId) throw new Error('로그인이 필요해요')
    const inviteCode = makeInviteCode()
    const { data: inserted, error } = await supabase.from('groups').insert({
      name, invite_code: inviteCode, fine_amount: fineAmount, currency,
      account_info: accountInfo, require_photo: requirePhotoToCheckIn,
      owner_id: meId, treasurer_id: meId,
    }).select().single()
    if (error || !inserted) throw new Error(error?.message ?? '그룹을 만들지 못했어요')

    const { error: memErr } = await supabase.from('group_members').insert({ group_id: inserted.id, member_id: meId })
    if (memErr) throw new Error(memErr.message)

    await refreshAll()
    return inserted.id as string
  }, [meId, refreshAll])

  const joinGroup = useCallback(async (inviteCode: string) => {
  if (!meId) throw new Error('로그인이 필요해요')
  const { data: groupId, error } = await supabase.rpc('get_group_id_by_invite_code', {
    code: inviteCode.trim().toUpperCase(),
  })
  if (error || !groupId) return null

  const { error: memErr } = await supabase.from('group_members').insert({ group_id: groupId, member_id: meId })
  if (memErr && !memErr.message.toLowerCase().includes('duplicate')) throw new Error(memErr.message)

  await refreshAll()
  return groupId as string
}, [meId, refreshAll])

  const addTimetableEntry = useCallback(async (e: Omit<TimetableEntry, 'id'>) => {
    const { error } = await supabase.from('timetable_entries').insert({
      group_id: e.groupId, member_id: e.memberId, subject: e.subject,
      location: e.location ?? null, weekday: e.weekday, start_time: e.startTime, end_time: e.endTime,
    })
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  const updateTimetableEntry = useCallback(async (id: string, patch: Omit<TimetableEntry, 'id' | 'groupId' | 'memberId'>) => {
    const { error } = await supabase.from('timetable_entries').update({
      subject: patch.subject, location: patch.location ?? null,
      weekday: patch.weekday, start_time: patch.startTime, end_time: patch.endTime,
    }).eq('id', id)
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  const removeTimetableEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  const checkIn = useCallback(async (entry: TimetableEntry, photo?: string) => {
    if (!meId) return
    const date = todayDateStr()
    const { error } = await supabase.from('attendance_records').insert({
      group_id: entry.groupId, member_id: entry.memberId, timetable_entry_id: entry.id,
      date, status: 'present', checked_in_at: new Date().toISOString(), photo: photo ?? null,
    })
    if (error && !error.message.toLowerCase().includes('duplicate')) throw new Error(error.message)
    await refreshAll()
  }, [meId, refreshAll])

  // 잘못 체크한 출석을 본인이 취소 (오늘 기록 + '출석' 상태일 때만)
  const cancelCheckIn = useCallback(async (record: AttendanceRecord) => {
    if (record.status !== 'present' || record.date !== todayDateStr()) return
    const { error } = await supabase.from('attendance_records').delete().eq('id', record.id)
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  const fileExcuse = useCallback(async (record: AttendanceRecord, reason: string) => {
    if (!meId) return
    const { error: excErr } = await supabase.from('excuse_requests').insert({
      group_id: record.groupId, attendance_record_id: record.id, member_id: meId, reason, status: 'pending',
    })
    if (excErr) throw new Error(excErr.message)
    const { error: updErr } = await supabase.from('attendance_records').update({ status: 'excused_pending' }).eq('id', record.id)
    if (updErr) throw new Error(updErr.message)
    await refreshAll()
  }, [meId, refreshAll])

  const castVote = useCallback(async (excuseId: string, voterMemberId: string, approve: boolean) => {
    const { error: voteErr } = await supabase.from('excuse_votes')
      .upsert({ excuse_id: excuseId, voter_id: voterMemberId, approve })
    if (voteErr) throw new Error(voteErr.message)

    const { data: excuseRow } = await supabase.from('excuse_requests').select('*').eq('id', excuseId).single()
    if (!excuseRow || excuseRow.status !== 'pending') { await refreshAll(); return }

    const { data: memberRows } = await supabase.from('group_members').select('member_id').eq('group_id', excuseRow.group_id)
    const otherMemberIds = (memberRows ?? []).map(r => r.member_id as string).filter(id => id !== excuseRow.member_id)
    const totalVoters = otherMemberIds.length

    const { data: voteRows } = await supabase.from('excuse_votes').select('*').eq('excuse_id', excuseId)
    const votesByVoter = new Map((voteRows ?? []).map(v => [v.voter_id as string, v.approve as boolean]))
    const votesForMembers = otherMemberIds.map(id => votesByVoter.get(id)).filter((v): v is boolean => v !== undefined)
    const approveCount = votesForMembers.filter(v => v === true).length
    const rejectCount = votesForMembers.filter(v => v === false).length

    let newStatus: 'pending' | 'approved' | 'rejected' = 'pending'
    if (totalVoters > 0 && approveCount > totalVoters / 2) newStatus = 'approved'
    else if (totalVoters > 0 && rejectCount > totalVoters / 2) newStatus = 'rejected'
    else if (totalVoters > 0 && votesForMembers.length === totalVoters) {
      newStatus = approveCount > rejectCount ? 'approved' : 'rejected'
    }

    if (newStatus !== 'pending') {
      await supabase.from('excuse_requests').update({ status: newStatus }).eq('id', excuseId)
      const attStatus = newStatus === 'approved' ? 'excused_approved' : 'excused_rejected'
      await supabase.from('attendance_records').update({ status: attStatus }).eq('id', excuseRow.attendance_record_id)
      if (newStatus === 'approved') {
        await supabase.from('fine_transactions').update({ status: 'waived' }).eq('attendance_record_id', excuseRow.attendance_record_id)
      }
    }
    await refreshAll()
  }, [refreshAll])

  // 데모/소규모 신뢰 그룹 전제: 실제로는 총무만 누를 수 있게 UI에서 막고 있음 (RLS는 그룹원 전체 허용)
  const markFinesSettled = useCallback(async (memberId: string, groupId: string) => {
    const { error } = await supabase.from('fine_transactions')
      .update({ settled: true })
      .eq('group_id', groupId).eq('member_id', memberId).eq('status', 'charged').eq('settled', false)
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  const setTreasurer = useCallback(async (groupId: string, memberId: string) => {
    const { error } = await supabase.from('groups').update({ treasurer_id: memberId }).eq('id', groupId)
    if (error) throw new Error(error.message)
    await refreshAll()
  }, [refreshAll])

  // 수업 종료 시간이 지났는데 출석 기록이 없는 항목 -> 자동 결석 처리 + 벌금 부과
  // (실 서비스라면 서버 스케줄러가 담당할 일이지만, 지금은 그룹원 중 누군가의 브라우저가
  //  열려있을 때 그 브라우저가 대신 처리한다 — DB의 unique 제약이 중복 처리를 막아줌)
  const processAutoAbsences = useCallback(async (group: Group) => {
    const date = todayDateStr()
    const wd = todayWeekday()
    const now = nowHHMM()
    const todaysEntries = dataRef.current.timetable.filter(t => t.groupId === group.id && t.weekday === wd)
    let changed = false
    for (const entry of todaysEntries) {
      if (!hasClassEnded(entry.endTime, now)) continue
      const exists = dataRef.current.attendance.find(a => a.timetableEntryId === entry.id && a.date === date)
      if (exists) continue
      const { data: inserted, error } = await supabase.from('attendance_records').insert({
        group_id: group.id, member_id: entry.memberId, timetable_entry_id: entry.id, date, status: 'absent',
      }).select().single()
      if (error || !inserted) continue // 이미 다른 클라이언트가 처리했을 수 있음 (unique 제약 충돌)
      await supabase.from('fine_transactions').insert({
        group_id: group.id, member_id: entry.memberId, attendance_record_id: inserted.id,
        amount: group.fineAmount, reason: `${entry.subject} 무단결석`, date, status: 'charged',
      })
      changed = true
    }
    if (changed) await refreshAll()
  }, [refreshAll])

  return (
    <StoreCtx.Provider value={{
      data, loading,
      createGroup, joinGroup, addTimetableEntry, updateTimetableEntry, removeTimetableEntry,
      checkIn, cancelCheckIn, fileExcuse, castVote, markFinesSettled, setTreasurer, processAutoAbsences,
    }}>
      {children}
    </StoreCtx.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
