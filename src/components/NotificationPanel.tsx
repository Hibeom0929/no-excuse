import React from 'react'
import NotificationSettings from './NotificationSettings'
import { useLanguage } from '../lib/i18n'
import { setPushWorkerState } from '../lib/push'

function NotificationFallback({ retry }: { retry: () => void }) {
  const { t } = useLanguage()
  return <section className="max-w-xl mx-auto px-5 mt-4" aria-label={t('출석 알림')}>
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p role="alert" className="text-xs text-ink/60">{t('출석 알림을 표시하지 못했어요. 출석 기능은 계속 사용할 수 있어요.')}</p>
      <button type="button" onClick={retry} className="text-xs underline mt-2 min-h-11">{t('다시 시도')}</button>
    </div>
  </section>
}

export class NotificationBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() {
    // Do not log browser subscription details, account IDs or server responses.
    console.warn('Attendance notification panel failed')
    void setPushWorkerState(null, false).catch(() => {})
  }
  render() {
    return this.state.failed
      ? <NotificationFallback retry={() => this.setState({ failed: false })} />
      : this.props.children
  }
}

export default function NotificationPanel() {
  return <NotificationBoundary><NotificationSettings /></NotificationBoundary>
}
