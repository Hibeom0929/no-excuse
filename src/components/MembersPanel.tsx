import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { Group, Member } from '../types'
import { formatMoney } from '../lib/currency'
import MemberHistory from './MemberHistory'

export default function MembersPanel({ group, meId }: { group: Group; meId: string }) {
  const { setTreasurer } = useStore()
  const [viewingMember, setViewingMember] = useState<Member | null>(null)
  const isOwner = meId === group.ownerId

  return (
    <div className="space-y-6">
      <div className="bg-white border border-line rounded-xl p-4 shadow-card">
        <p className="text-xs font-bold text-ink/50 mb-2">초대코드</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xl font-black tracking-[0.3em] text-campus">{group.inviteCode}</span>
          <button
            onClick={() => { navigator.clipboard?.writeText(group.inviteCode) }}
            className="text-xs font-bold border border-line rounded-lg px-3 py-1.5 hover:border-campus/40"
          >
            복사
          </button>
        </div>
        <p className="text-[11px] text-ink/40 mt-2">이 코드를 친구들에게 공유해서 그룹에 초대하세요.</p>
      </div>

      <div className="bg-white border border-line rounded-xl p-4 shadow-card space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-ink/50">결석 1회당 벌금</span><span className="font-mono font-bold">{formatMoney(group.fineAmount, group.currency)}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">벌금 계좌</span><span className="font-medium text-right">{group.accountInfo}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">인증샷</span><span className="font-medium">{group.requirePhotoToCheckIn ? '필수' : '선택'}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">입금 확인 담당(총무)</span><span className="font-medium">{group.members.find(m => m.id === group.treasurerId)?.name}</span></div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">멤버 ({group.members.length})</h2>
        <div className="bg-white border border-line rounded-xl divide-y divide-line">
          {group.members.map(m => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{m.name}{m.id === meId && <span className="text-ink/30 font-normal"> (나)</span>}</span>
                {m.id === group.ownerId && <span className="text-[10px] font-bold text-gold bg-gold/10 rounded-full px-2 py-0.5">방장</span>}
                {m.id === group.treasurerId && <span className="text-[10px] font-bold text-campus bg-campus/10 rounded-full px-2 py-0.5">총무</span>}
              </div>
              {m.id !== meId && (
                <button onClick={() => setViewingMember(m)} className="text-xs font-bold text-ink/40 hover:text-campus">출석 보기 →</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-card">
          <p className="text-xs font-bold text-ink/70 mb-2">💰 총무(입금 확인 담당) 지정</p>
          <p className="text-[11px] text-ink/50 mb-3 leading-relaxed">
            방장만 바꿀 수 있어요. 지정된 사람만 장부에서 "입금 확인"을 눌러 정산 처리를 할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.members.map(m => (
              <button
                key={m.id}
                onClick={() => setTreasurer(group.id, m.id).catch(err => alert(err instanceof Error ? err.message : '변경하지 못했어요'))}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${group.treasurerId === m.id ? 'bg-campus text-paper border-campus' : 'border-line text-ink/50 hover:border-campus/40'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewingMember && (
        <MemberHistory group={group} member={viewingMember} onClose={() => setViewingMember(null)} />
      )}
    </div>
  )
}
