import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import NotificationPanel from '../src/components/NotificationPanel'
import LanguageToggle from '../src/components/LanguageToggle'
import { LanguageProvider } from '../src/lib/i18n'
import '../src/index.css'

function Preview() {
  const [checkedIn, setCheckedIn] = useState(false)
  return <>
    <header className="max-w-xl mx-auto px-5 py-6 flex items-center justify-between"><h1 className="text-2xl font-bold">No Excuse</h1><LanguageToggle /></header>
    <p className="max-w-xl mx-auto px-5 text-xs text-ink/60">로컬 화면 시험 · 실제 알림·계정·기기 권한 변경 없음</p>
    <NotificationPanel />
    <div className="max-w-xl mx-auto p-5 mt-3"><div className="rounded-xl border border-line bg-white p-5"><h2 className="text-lg font-bold">누스 차세대 딘스리스트</h2><p className="text-sm text-ink/60 mt-2">수업 시작 알림 → 해당 그룹의 오늘 출석 화면</p></div></div>
    <details className="max-w-xl mx-auto px-5 text-xs text-ink/60">
      <summary>개발자 동작 시험 · 실제 앱에는 표시되지 않음</summary>
      <button type="button" className="border rounded-lg px-3 py-3 mt-3" onClick={() => setCheckedIn(true)}>출석 도장 시험</button>
      {checkedIn && <p role="status" className="mt-2">로컬 출석 완료 · 실제 출석 기록 변경 없음</p>}
    </details>
  </>
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview /></LanguageProvider>)
