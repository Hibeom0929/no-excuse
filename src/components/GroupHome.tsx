import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { formatMoney, CURRENCIES } from '../lib/currency'
import { CurrencyCode } from '../types'

export default function GroupHome({ onSelect }: { onSelect: (groupId: string) => void }) {
  const { data, loading, createGroup, joinGroup } = useStore()
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeGroups = data.groups.filter(g => !g.archivedAt)
  const archivedGroups = data.groups.filter(g => !!g.archivedAt)

  return (
    <div className="max-w-xl mx-auto px-5 py-10 md:py-16">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] text-campus/70 font-mono uppercase mb-2">Attendance &amp; Fine Log</p>
        <h1 className="text-3xl md:text-4xl font-black text-ink leading-tight">
          출첵벌금<br />
          <span className="text-campus">이번 학기는 진짜로 개근.</span>
        </h1>
        <p className="mt-3 text-sm text-ink/60 leading-relaxed">
          시간표를 올리고, 수업마다 스스로 출석 도장을 찍어요.
          <br />못 찍으면 벌금, 억울하면 해명하고 투표로 정하면 돼요.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-ink/30 mb-8">불러오는 중...</p>
      ) : activeGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-ink/50 mb-3 tracking-wide">내 그룹</h2>
          <div className="space-y-2">
            {activeGroups.map(g => (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                className="w-full text-left bg-white border border-line rounded-xl px-4 py-3.5 shadow-card hover:border-campus/40 transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-bold text-ink">{g.name}</div>
                  <div className="text-xs text-ink/50 mt-0.5">
                    멤버 {g.members.filter(m => !m.leftAt).length}명 · 결석 {formatMoney(g.fineAmount, g.currency)}
                  </div>
                </div>
                <span className="text-campus/40 group-hover:text-campus transition-colors">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && archivedGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-ink/40 mb-3 tracking-wide">종료된 그룹</h2>
          <div className="space-y-2">
            {archivedGroups.map(g => (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                className="w-full text-left bg-white/60 border border-line rounded-xl px-4 py-3.5 hover:border-campus/30 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-ink/60">{g.name}</div>
                  <div className="text-xs text-ink/35 mt-0.5">종료됨 · 기록 열람 가능</div>
                </div>
                <span className="text-ink/20">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'none' && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('create')}
            className="bg-campus text-paper rounded-xl px-4 py-4 font-bold text-sm shadow-card hover:bg-campusLight transition-colors"
          >
            + 새 그룹 만들기
          </button>
          <button
            onClick={() => setMode('join')}
            className="bg-white border border-line text-ink rounded-xl px-4 py-4 font-bold text-sm hover:border-campus/40 transition-colors"
          >
            초대코드로 참여
          </button>
        </div>
      )}

      {error && <p className="text-xs text-stamp mt-3">{error}</p>}

      {mode === 'create' && (
        <CreateGroupForm
          busy={busy}
          onCancel={() => setMode('none')}
          onCreate={async (name, fine, currency, account, requirePhoto) => {
            setBusy(true); setError(null)
            try {
              const groupId = await createGroup(name, fine, currency, account, requirePhoto)
              onSelect(groupId)
            } catch (e) {
              setError(e instanceof Error ? e.message : '그룹을 만들지 못했어요')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {mode === 'join' && (
        <JoinGroupForm
          busy={busy}
          onCancel={() => setMode('none')}
          onJoin={async code => {
            setBusy(true); setError(null)
            try {
              const groupId = await joinGroup(code)
              if (groupId) onSelect(groupId)
              else setError('초대코드를 확인해주세요.')
            } catch (e) {
              setError(e instanceof Error ? e.message : '참여하지 못했어요')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}

function CreateGroupForm({
  busy, onCancel, onCreate,
}: {
  busy: boolean
  onCancel: () => void
  onCreate: (name: string, fine: number, currency: CurrencyCode, account: string, requirePhoto: boolean) => void
}) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('KRW')
  const [fine, setFine] = useState(3000)
  const [account, setAccount] = useState('')
  const [requirePhoto, setRequirePhoto] = useState(false)

  return (
    <form
      className="bg-white border border-line rounded-xl p-5 shadow-card space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (!name.trim() || !account.trim()) return
        onCreate(name.trim(), fine, currency, account.trim(), requirePhoto)
      }}
    >
      <div>
        <label className="block text-xs font-bold text-ink/60 mb-1">그룹 이름</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예) 경영학과 25학번 출첵방"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
      </div>
      <div>
        <label className="block text-xs font-bold text-ink/60 mb-1">벌금 화폐</label>
        <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-campus/30">
          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink/60 mb-1">결석 1회당 벌금</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink/50 font-mono">{CURRENCIES.find(c => c.code === currency)?.symbol}</span>
          <input type="number" min={0} step={1} value={fine}
            onChange={e => setFine(Number(e.target.value))}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-campus/30" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink/60 mb-1">벌금 모으는 계좌</label>
        <input value={account} onChange={e => setAccount(e.target.value)} placeholder="예) 카카오뱅크 3333-01-1234567 (총무 김민준)"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30" />
        <p className="text-[11px] text-ink/40 mt-1">* 실제 자동이체는 지원하지 않아요. 벌금은 장부에 자동 기록되고, 이 계좌로 입금 후 정산 처리하는 방식이에요.</p>
      </div>
      <label className="flex items-start gap-2.5 bg-paper rounded-lg px-3 py-2.5 cursor-pointer">
        <input type="checkbox" checked={requirePhoto} onChange={e => setRequirePhoto(e.target.checked)}
          className="mt-0.5 accent-campus" />
        <span className="text-xs text-ink/60 leading-relaxed">
          <span className="font-bold text-ink/80">인증샷 필수로 하기</span><br />
          켜면 사진을 첨부해야만 출석 체크를 할 수 있어요. (자습실에서 몰래 도장만 찍는 것 방지)
        </span>
      </label>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper">취소</button>
        <button type="submit" disabled={busy} className="flex-[2] rounded-lg py-2.5 text-sm font-bold bg-campus text-paper hover:bg-campusLight disabled:opacity-50">
          {busy ? '만드는 중...' : '그룹 만들기'}
        </button>
      </div>
    </form>
  )
}

function JoinGroupForm({ busy, onCancel, onJoin }: { busy: boolean; onCancel: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('')
  return (
    <form
      className="bg-white border border-line rounded-xl p-5 shadow-card space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (!code.trim()) return
        onJoin(code)
      }}
    >
      <div>
        <label className="block text-xs font-bold text-ink/60 mb-1">초대코드</label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="예) X7K2Q9"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-campus/30" />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper">취소</button>
        <button type="submit" disabled={busy} className="flex-[2] rounded-lg py-2.5 text-sm font-bold bg-campus text-paper hover:bg-campusLight disabled:opacity-50">
          {busy ? '참여하는 중...' : '참여하기'}
        </button>
      </div>
    </form>
  )
}
