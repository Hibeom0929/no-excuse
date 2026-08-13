// 그룹 초대코드 생성용 (DB에는 이제 gen_random_uuid()로 id를 자동 채번하므로 uid()는 더 이상 필요 없음)
export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
