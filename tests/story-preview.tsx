import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AttendanceStories from '../src/components/AttendanceStories'
import { CheckInStamp } from '../src/components/StampButton'
import LanguageToggle from '../src/components/LanguageToggle'
import { LanguageProvider } from '../src/lib/i18n'
import { setPhotoExpiry, setPhotoFailure } from './story-preview-client'
import '../src/index.css'

const group = { id: 'qa', name: '로컬 시험', members: [{ id: 'me', name: '나' }, { id: 'friend', name: '샘플 팀원' }] }
const initialRecords = ['mine', 'friend-1', 'friend-2'].map((id, i) => ({
  id, groupId: 'qa', memberId: i ? 'friend' : 'me', timetableEntryId: id, date: '2026-10-16', status: 'present' as const,
}))
function Preview() {
  const [records, setRecords] = useState(initialRecords)
  return <div className="max-w-xl mx-auto p-5 space-y-5">
    <div className="flex items-center justify-between"><h1 className="text-xl font-bold">No Excuse</h1><LanguageToggle /></div>
    <p className="text-xs text-ink/50">로컬 동작 시험 · 실제 사진·출석 데이터 변경 없음</p>
    <details className="text-xs text-ink/60">
      <summary className="cursor-pointer">개발자 테스트 도구 · 실제 앱에는 표시되지 않음</summary>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <button className="border rounded-lg px-3 py-2" onClick={() => { setPhotoExpiry(false); setPhotoFailure(false); setRecords([...initialRecords]) }}>사진 있음</button>
      <button className="border rounded-lg px-3 py-2" onClick={() => { setPhotoExpiry(true); setRecords([...records]) }}>사진 모두 만료</button>
      <button className="border rounded-lg px-3 py-2" onClick={() => { setPhotoFailure(true); setRecords([...records]) }}>조회 실패</button>
      <button className="border rounded-lg px-3 py-2" onClick={() => setRecords([])}>출석 취소</button>
      </div>
    </details>
    <AttendanceStories group={group as any} meId="me" records={records} />
    <div className="bg-white rounded-xl border border-line p-4 space-y-3"><p className="font-bold">사진 첨부 전 보관 안내</p><CheckInStamp requirePhoto={false} onConfirm={() => {}} /></div>
    <div className="bg-white rounded-xl border border-line p-4"><p className="font-bold">CS3264 LEC</p><p className="text-sm text-campus mt-2">출석 완료 · 사진과 별도로 보존되는 기록</p></div>
  </div>
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview /></LanguageProvider>)
