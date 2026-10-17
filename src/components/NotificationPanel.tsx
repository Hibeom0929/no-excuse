import React from 'react'
import NotificationSettings from './NotificationSettings'
import { useLanguage } from '../lib/i18n'
import { setPushWorkerState } from '../lib/push'
import NotificationDisclosure from './NotificationDisclosure'

function NotificationFallback({ retry }: { retry: () => void }) {
  const { t } = useLanguage()
  return <NotificationDisclosure title={t('출석 알림')} status={t('확인 필요')} attention>
      <p role="alert" className="text-xs text-ink/60">{t('출석 알림을 표시하지 못했어요. 출석 기능은 계속 사용할 수 있어요.')}</p>
      <button type="button" onClick={retry} className="text-xs underline mt-2 min-h-11">{t('다시 시도')}</button>
  </NotificationDisclosure>
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
