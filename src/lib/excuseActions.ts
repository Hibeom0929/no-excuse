interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

export async function submitExcuse(client: RpcClient, attendanceId: string, reason: string): Promise<void> {
  const { data, error } = await client.rpc('submit_excuse', {
    p_attendance_record_id: attendanceId, p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string' || !data) throw new Error('해명 제출에 실패했어요')
}

export async function voteOnExcuse(client: RpcClient, excuseId: string, approve: boolean): Promise<void> {
  // The database derives the voter from the signed-in session, never an id
  // supplied by the browser. One RPC persists vote + outcome + fine together.
  const { data, error } = await client.rpc('cast_excuse_vote', {
    p_excuse_id: excuseId, p_approve: approve,
  })
  if (error) throw new Error(error.message)
  if (!['pending', 'approved', 'rejected'].includes(data as string)) throw new Error('투표에 실패했어요')
}
