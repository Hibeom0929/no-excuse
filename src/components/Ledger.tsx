import React from 'react'
import { useStore } from '../lib/store'
import { Group } from '../types'
import { formatDateKor } from '../lib/time'
import { formatMoney } from '../lib/currency'

export default function Ledger({ group, meId }: { group: Group; meId: string }) {
  const { data, markFinesSettled } = useStore()
  const fines = data.fines.filter(f => f.groupId === group.id).sort((a, b) => b.date.localeCompare(a.date))
  const isTreasurer = meId === group.treasurerId

  const totals = group.members.map(m => {
    const memberFines = fines.filter(f => f.memberId === m.id)
    const owed = memberFines.filter(f => f.status === 'charged' && !f.settled).reduce((s, f) => s + f.amount, 0)
    // 이번 학기 동안 부과된 누적 금액 (면제된 건 제외, 정산 여부와 무관하게 합산)
    const accumulated = memberFines.filter(f => f.status === 'charged').reduce((s, f) => s + f.amount, 0)
    const waived = memberFines.filter(f => f.status === 'waived').length
    return { member: m, owed, accumulated, waived }
  }).sort((a, b) => b.accumulated - a.accumulated)

  const totalPool = totals.reduce((s, t) => s + t.owed, 0)
  const totalAccumulated = totals.reduce((s, t) => s + t.accumulated, 0)

  return (
    <div className="space-y-6">
      <div className="bg-campus text-paper rounded-xl p-5 shadow-card">
        <p className="text-xs text-paper/60 font-mono uppercase tracking-wider">이번 학기 쌓인 벌금 총액</p>
        <p className="text-3xl font-black mt-1 font-mono">{formatMoney(totalAccumulated, group.currency)}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-paper/50">그중 미정산 금액</p>
          <p className="text-xs font-mono text-paper/70">{formatMoney(totalPool, group.currency)}</p>
        </div>
        <div className="receipt-dash my-3 opacity-30" />
        <p className="text-xs text-paper/70">입금 계좌 · {group.accountInfo}</p>
        {!isTreasurer && (
          <p className="text-[11px] text-paper/50 mt-1">입금 확인은 총무({group.members.find(m => m.id === group.treasurerId)?.name})만 처리할 수 있어요.</p>
        )}
      </div>

      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">멤버별 벌금 현황</h2>
        <div className="bg-white border border-line rounded-xl divide-y divide-line">
          {totals.map(({ member, owed, accumulated, waived }) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3.5">
              <div>
                <div className="text-sm font-bold text-ink">{member.name}{member.id === meId && <span className="text-ink/30 font-normal"> (나)</span>}</div>
                {owed > 0
                  ? <div className="text-[11px] text-stamp/80 mt-0.5">미정산 {formatMoney(owed, group.currency)}</div>
                  : <div className="text-[11px] text-campus/60 mt-0.5">미정산 없음</div>}
                {waived > 0 && <div className="text-[11px] text-campus/70 mt-0.5">해명 승인 {waived}건 면제</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono text-sm font-bold ${accumulated > 0 ? 'text-ink' : 'text-ink/30'}`}>{formatMoney(accumulated, group.currency)}</span>
                {owed > 0 && isTreasurer && (
                  <button
                    onClick={() => { if (confirm(`${member.name}님이 ${formatMoney(owed, group.currency)}를 입금했다고 확인할까요?`)) markFinesSettled(member.id, group.id).catch(err => alert(err instanceof Error ? err.message : '처리하지 못했어요')) }}
                    className="text-[11px] font-bold text-ink/40 border border-line rounded-full px-2.5 py-1 hover:border-campus hover:text-campus"
                  >
                    입금 확인
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">전체 내역</h2>
        {fines.length === 0 ? (
          <div className="bg-white border border-dashed border-line rounded-xl p-6 text-center text-sm text-ink/40">
            아직 벌금 내역이 없어요. 좋은 신호예요!
          </div>
        ) : (
          <div className="bg-white border border-line rounded-xl p-4 font-mono text-xs">
            {fines.map((f, i) => {
              const member = group.members.find(m => m.id === f.memberId)
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between py-2">
                    <div className="text-ink/70">
                      <div>{formatDateKor(f.date)} · {member?.name}</div>
                      <div className="text-ink/40">{f.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className={f.status === 'waived' ? 'text-ink/30 line-through' : f.settled ? 'text-campus' : 'text-stamp'}>
                        {formatMoney(f.amount, group.currency)}
                      </div>
                      <div className="text-[10px] text-ink/30">
                        {f.status === 'waived' ? '면제됨' : f.settled ? '정산완료' : '미정산'}
                      </div>
                    </div>
                  </div>
                  {i < fines.length - 1 && <div className="receipt-dash" />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
