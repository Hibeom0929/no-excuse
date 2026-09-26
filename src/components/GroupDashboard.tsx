import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import TodayAttendance from './TodayAttendance'
import TimetableEditor from './TimetableEditor'
import Ledger from './Ledger'
import MembersPanel from './MembersPanel'

type Tab = 'today' | 'timetable' | 'ledger' | 'members'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '오늘 출석' },
  { key: 'timetable', label: '시간표' },
  { key: 'ledger', label: '장부' },
  { key: 'members', label: '멤버' },
]

export default function GroupDashboard({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { data } = useStore()
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('today')
  const group = data.groups.find(g => g.id === groupId)
  const meId = profile?.id

  if (!group || !meId) {
    return (
      <div className="max-w-xl mx-auto px-5 py-10 text-center text-sm text-ink/40">
        그룹을 찾을 수 없어요. <button onClick={onBack} className="underline">돌아가기</button>
      </div>
    )
  }

  const visibleTabs = group.archivedAt ? TABS.filter(t => t.key === 'ledger' || t.key === 'members') : TABS
  const visibleTab: Tab = group.archivedAt && (tab === 'today' || tab === 'timetable') ? 'ledger' : tab

  return (
    <div className="max-w-xl mx-auto pb-24">
      <header className="sticky top-0 bg-paper/90 backdrop-blur z-10 px-5 pt-6 pb-3 border-b border-line">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onBack} className="text-xs font-bold text-ink/40 hover:text-ink">← 그룹 목록</button>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black text-ink">{group.name}</h1>
          {group.archivedAt && <span className="text-[10px] font-bold text-ink/40 bg-white border border-line rounded-full px-2 py-0.5">종료됨</span>}
        </div>
        <nav className="flex gap-1 mt-4 -mx-1">
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs font-bold rounded-lg py-2 mx-1 transition-colors ${
                visibleTab === t.key ? 'bg-campus text-paper' : 'text-ink/50 hover:bg-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-5 pt-5">
        {visibleTab === 'today' && <TodayAttendance group={group} meId={meId} />}
        {visibleTab === 'timetable' && <TimetableEditor group={group} meId={meId} />}
        {visibleTab === 'ledger' && <Ledger group={group} meId={meId} />}
        {visibleTab === 'members' && <MembersPanel group={group} meId={meId} onExitGroup={onBack} />}
      </main>
    </div>
  )
}
