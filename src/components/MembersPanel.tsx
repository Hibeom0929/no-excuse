import React, { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { Group, Member } from '../types'
import { formatMoney } from '../lib/currency'
import MemberHistory from './MemberHistory'
import { useLanguage } from '../lib/i18n'

export default function MembersPanel({
  group, meId, onExitGroup,
}: { group: Group; meId: string; onExitGroup: () => void }) {
  const {
    setTreasurer, setGroupPhotoRequirement, renameGroup, transferOwnership, leaveGroup, archiveGroup, restoreGroup, deleteGroup,
  } = useStore()
  const { t } = useLanguage()
  const [viewingMember, setViewingMember] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState(group.name)
  const isOwner = meId === group.ownerId
  const activeMembers = group.members.filter(m => !m.leftAt)
  const formerMembers = group.members.filter(m => !!m.leftAt)

  useEffect(() => { setGroupName(group.name) }, [group.name])

  const run = async (work: () => Promise<void>, leaveAfter = false) => {
    setBusy(true); setError(null)
    try {
      await work()
      if (leaveAfter) onExitGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('처리하지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-line rounded-xl p-4 shadow-card">
        <p className="text-xs font-bold text-ink/50 mb-2">{t('초대코드')}</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xl font-black tracking-[0.3em] text-campus">{group.inviteCode}</span>
          <button
            disabled={!!group.archivedAt}
            onClick={() => { navigator.clipboard?.writeText(group.inviteCode) }}
            className="text-xs font-bold border border-line rounded-lg px-3 py-1.5 hover:border-campus/40 disabled:opacity-30"
          >
            {t('복사')}
          </button>
        </div>
        <p className="text-[11px] text-ink/40 mt-2">
          {group.archivedAt ? t('종료된 그룹에는 새 멤버가 참여할 수 없어요.') : t('이 코드를 친구들에게 공유해서 그룹에 초대하세요.')}
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-4 shadow-card space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-ink/50">{t('결석 1회당 벌금')}</span><span className="font-mono font-bold">{formatMoney(group.fineAmount, group.currency)}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">{t('벌금 계좌')}</span><span className="font-medium text-right">{group.accountInfo}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">{t('인증샷')}</span><span className="font-medium">{group.requirePhotoToCheckIn ? t('필수') : t('선택')}</span></div>
        <div className="flex justify-between"><span className="text-ink/50">{t('입금 확인 담당(총무)')}</span><span className="font-medium">{group.members.find(m => m.id === group.treasurerId)?.name}</span></div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">{t('멤버 ({{count}})', { count: activeMembers.length })}</h2>
        <div className="bg-white border border-line rounded-xl divide-y divide-line">
          {activeMembers.map(m => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{m.name}{m.id === meId && <span className="text-ink/30 font-normal">{t(' (나)')}</span>}</span>
                {m.id === group.ownerId && <span className="text-[10px] font-bold text-gold bg-gold/10 rounded-full px-2 py-0.5">{t('방장')}</span>}
                {m.id === group.treasurerId && <span className="text-[10px] font-bold text-campus bg-campus/10 rounded-full px-2 py-0.5">{t('총무')}</span>}
              </div>
              <button onClick={() => setViewingMember(m)} className="text-xs font-bold text-ink/40 hover:text-campus">{t(m.id === meId ? '내 기록 보기 →' : '출석 보기 →')}</button>
            </div>
          ))}
        </div>
      </div>

      {formerMembers.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-ink/35 mb-3 tracking-wide">{t('나간 멤버')}</h2>
          <div className="bg-white/60 border border-line rounded-xl divide-y divide-line">
            {formerMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink/40">{m.name}</span>
                <button onClick={() => setViewingMember(m)} className="text-xs font-bold text-ink/30 hover:text-campus">{t('기록 보기 →')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-card">
          <p className="text-xs font-bold text-ink/70 mb-2">{t('💰 총무(입금 확인 담당) 지정')}</p>
          <p className="text-[11px] text-ink/50 mb-3 leading-relaxed">
            {t('방장만 바꿀 수 있어요. 지정된 사람만 장부에서 입금 확인을 눌러 정산 처리를 할 수 있어요.')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeMembers.map(m => (
              <button
                key={m.id}
                onClick={() => setTreasurer(group.id, m.id).catch(err => alert(err instanceof Error ? err.message : t('변경하지 못했어요')))}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${group.treasurerId === m.id ? 'bg-campus text-paper border-campus' : 'border-line text-ink/50 hover:border-campus/40'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOwner && activeMembers.length > 1 && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-card">
          <p className="text-xs font-bold text-ink/70 mb-2">{t('👑 그룹장 위임')}</p>
          <p className="text-[11px] text-ink/50 mb-3 leading-relaxed">
            {t('그룹을 나가려면 먼저 다른 멤버에게 그룹장을 넘겨야 해요. 위임 후에는 되돌리려면 새 그룹장의 동의가 필요해요.')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeMembers.filter(m => m.id !== meId).map(m => (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => {
                  if (confirm(t('{{name}}님에게 그룹장을 넘길까요?', { name: m.name }))) {
                    run(() => transferOwnership(group.id, m.id))
                  }
                }}
                className="text-xs font-bold rounded-full px-3 py-1.5 border border-line text-ink/50 hover:border-gold hover:text-ink disabled:opacity-40"
              >
                {t('{{name}}에게 위임', { name: m.name })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-xl p-4 shadow-card">
        <p className="text-xs font-bold text-ink/70 mb-2">{t('그룹 관리')}</p>
        {error && <p className="text-xs text-stamp bg-stamp/5 rounded-lg px-3 py-2 mb-3 break-words">{error}</p>}

        {isOwner ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-line p-3 mb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-ink/70">{t('출석 인증샷 필수')}</p>
                  <p className="text-[11px] text-ink/40 mt-1 leading-relaxed">
                    {t('바꾼 시점 이후의 출석부터 적용되며, 기존 기록은 그대로 유지돼요.')}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={group.requirePhotoToCheckIn}
                  aria-label={t('출석 인증샷 필수')}
                  disabled={busy || !!group.archivedAt}
                  onClick={() => run(() => setGroupPhotoRequirement(group.id, !group.requirePhotoToCheckIn))}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                    group.requirePhotoToCheckIn ? 'bg-campus' : 'bg-line'
                  }`}
                >
                  <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    group.requirePhotoToCheckIn ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
              <p className={`text-[11px] font-bold mt-2 ${group.requirePhotoToCheckIn ? 'text-campus' : 'text-ink/40'}`}>
                {group.requirePhotoToCheckIn ? t('현재 필수') : t('현재 선택')}
              </p>
            </div>
            <form
              className="rounded-lg border border-line p-3 mb-3"
              onSubmit={(event) => {
                event.preventDefault()
                const nextName = groupName.trim()
                if (!nextName || nextName === group.name) return
                run(() => renameGroup(group.id, nextName))
              }}
            >
              <label htmlFor="group-name" className="block text-xs font-bold text-ink/70 mb-2">
                {t('그룹 이름 변경')}
              </label>
              <div className="flex gap-2">
                <input
                  id="group-name"
                  value={groupName}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => setGroupName(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-campus disabled:opacity-50"
                  aria-label={t('새 그룹 이름')}
                />
                <button
                  type="submit"
                  disabled={busy || !groupName.trim() || groupName.trim() === group.name}
                  className="shrink-0 rounded-lg bg-campus px-3 py-2 text-xs font-bold text-paper disabled:opacity-30"
                >
                  {busy ? t('저장중...') : t('이름 저장')}
                </button>
              </div>
              <p className="text-[11px] text-ink/40 mt-2">{t('변경한 이름은 모든 멤버에게 바로 표시돼요.')}</p>
            </form>
            {group.archivedAt ? (
              <button
                disabled={busy}
                onClick={() => run(() => restoreGroup(group.id))}
                className="w-full rounded-lg py-2.5 text-sm font-bold border border-campus/30 text-campus hover:bg-campus/5 disabled:opacity-40"
              >
                {t('그룹 다시 열기')}
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(t('그룹을 종료할까요? 출석과 시간표 등록은 멈추지만 기존 기록은 그대로 남아요.'))) {
                    run(() => archiveGroup(group.id))
                  }
                }}
                className="w-full rounded-lg py-2.5 text-sm font-bold border border-line text-ink/60 hover:border-gold disabled:opacity-40"
              >
                {t('그룹 종료하기')}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                const typed = prompt(`${t('그룹과 모든 기록을 영구 삭제하려면 그룹 이름을 입력해주세요.')}\n\n${group.name}`)
                if (typed === null) return
                if (typed.trim() !== group.name) {
                  setError(t('그룹 이름이 일치하지 않아 삭제하지 않았어요.'))
                  return
                }
                run(() => deleteGroup(group.id, typed.trim()), true)
              }}
              className="w-full rounded-lg py-2.5 text-sm font-bold border border-stamp/30 text-stamp hover:bg-stamp/5 disabled:opacity-40"
            >
              {t('그룹과 모든 기록 영구 삭제')}
            </button>
            <p className="text-[11px] text-ink/35 leading-relaxed">{t('영구 삭제는 출석, 벌금, 해명 기록까지 지우며 되돌릴 수 없어요.')}</p>
          </div>
        ) : (
          <div>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(t('이 그룹에서 나갈까요? 과거 기록은 그룹 장부에 남고, 같은 초대코드로 다시 참여할 수 있어요.'))) {
                  run(() => leaveGroup(group.id), true)
                }
              }}
              className="w-full rounded-lg py-2.5 text-sm font-bold border border-stamp/30 text-stamp hover:bg-stamp/5 disabled:opacity-40"
            >
              {t('그룹 나가기')}
            </button>
            <p className="text-[11px] text-ink/35 mt-2 leading-relaxed">{t('나가면 이 그룹을 더 이상 볼 수 없지만 기존 출석과 벌금 기록은 보존돼요.')}</p>
          </div>
        )}
      </div>

      {viewingMember && (
        <MemberHistory group={group} member={viewingMember} meId={meId} onClose={() => setViewingMember(null)} />
      )}
    </div>
  )
}
