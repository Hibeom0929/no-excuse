import React from 'react'

export default function NotificationDisclosure({ title, status, attention = false, children }: {
  title: string; status?: string; attention?: boolean; children: React.ReactNode
}) {
  return <section className="max-w-xl mx-auto px-5 mt-1" aria-label={title}>
    <details className="group">
      <summary className="ml-auto flex w-fit min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-[11px] text-ink/50 hover:bg-white/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-campus [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        <span>{title}</span>
        {status && <span className={attention ? 'text-stamp' : 'text-ink/35'}>· {status}</span>}
        <svg aria-hidden="true" className="transition-transform group-open:rotate-180" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4" /></svg>
      </summary>
      <div className="mt-1 rounded-xl border border-line bg-white px-4 py-3">{children}</div>
    </details>
  </section>
}
