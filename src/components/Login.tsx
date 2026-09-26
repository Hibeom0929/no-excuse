import React, { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { sendMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="max-w-sm mx-auto px-5 py-16 md:py-24">
      <p className="text-xs tracking-[0.2em] text-campus/70 font-mono uppercase mb-2">Attendance &amp; Fine Log</p>
      <h1 className="text-3xl font-black text-ink leading-tight mb-2">출첵벌금</h1>
      <p className="text-sm text-ink/60 mb-2 leading-relaxed">이메일로 로그인하면 친구들과 같은 그룹을 실시간으로 공유할 수 있어요.</p>
      <p className="text-xs text-ink/40 mb-8 leading-relaxed">처음 로그인하거나 직접 로그아웃한 경우에만 이메일 인증이 필요해요. 이 기기에서는 로그인 상태가 유지됩니다.</p>

      {sent ? (
        <div className="bg-campus/10 border border-campus/30 rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">📬</p>
          <p className="text-sm font-bold text-ink mb-1">메일함을 확인해주세요</p>
          <p className="text-xs text-ink/50 leading-relaxed">
            <span className="font-mono">{email}</span> 으로 로그인 링크를 보냈어요. 링크를 누르면 자동으로 로그인돼요. (스팸함도 확인해보세요)
          </p>
          <button onClick={() => setSent(false)} className="mt-4 text-xs font-bold text-ink/40 hover:text-ink">
            다른 이메일로 다시 받기
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async e => {
            e.preventDefault()
            if (!email.trim()) return
            setLoading(true); setError(null)
            const { error } = await sendMagicLink(email.trim())
            setLoading(false)
            if (error) setError(error)
            else setSent(true)
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="학교 이메일 또는 자주 쓰는 이메일"
            className="w-full border border-line rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-campus/30"
          />
          {error && <p className="text-xs text-stamp">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-campus text-paper font-bold text-sm rounded-lg py-3 hover:bg-campusLight disabled:opacity-50"
          >
            {loading ? '전송중...' : '로그인 링크 받기'}
          </button>
        </form>
      )}
    </div>
  )
}
