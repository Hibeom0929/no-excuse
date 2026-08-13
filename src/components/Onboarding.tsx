import React, { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Onboarding() {
  const { updateName } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="max-w-sm mx-auto px-5 py-16 md:py-24">
      <h1 className="text-2xl font-black text-ink mb-2">거의 다 됐어요!</h1>
      <p className="text-sm text-ink/60 mb-6">그룹 친구들에게 표시될 이름을 알려주세요.</p>
      <form
        className="space-y-3"
        onSubmit={async e => {
          e.preventDefault()
          if (!name.trim()) return
          setLoading(true); setError(null)
          const { error } = await updateName(name.trim())
          setLoading(false)
          if (error) setError(error)
        }}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="예) 김민준"
          className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30"
        />
        {error && <p className="text-xs text-stamp">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-campus text-paper font-bold text-sm rounded-lg py-3 hover:bg-campusLight disabled:opacity-50"
        >
          {loading ? '저장중...' : '시작하기'}
        </button>
      </form>
    </div>
  )
}
