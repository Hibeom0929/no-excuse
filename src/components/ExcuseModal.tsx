import React, { useState } from 'react'
import { useStore } from '../lib/store'
import { AttendanceRecord } from '../types'

export default function ExcuseModal({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  const { fileExcuse } = useStore()
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end md:items-center justify-center z-50 px-0 md:px-4"
      onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:max-w-sm shadow-card"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-ink mb-1">결석 해명하기</h3>
        <p className="text-xs text-ink/50 mb-4">사유를 적으면 팀원들의 투표로 벌금 면제 여부가 결정돼요. 과반수가 인정하면 벌금이 면제돼요.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="예) 갑자기 몸살이 나서 병원에 다녀왔어요. 진료 확인서 있어요."
          rows={4}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-campus/30"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm font-bold text-ink/50 hover:bg-paper">
            취소
          </button>
          <button
            onClick={async () => {
              if (!reason.trim()) return
              try {
                await fileExcuse(record, reason.trim())
                onClose()
              } catch (err) {
                alert(err instanceof Error ? err.message : '해명 제출에 실패했어요')
              }
            }}
            className="flex-[2] rounded-lg py-2.5 text-sm font-bold bg-gold text-ink hover:brightness-95"
          >
            해명 제출하고 투표 요청
          </button>
        </div>
      </div>
    </div>
  )
}
