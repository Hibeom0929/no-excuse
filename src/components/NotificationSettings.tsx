import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/i18n'
import { devicePushSubscription, disableDevicePush, enableDevicePush, pushRegistration, pushRpc, pushSupport, setPushWorkerState } from '../lib/push'
import NotificationDisclosure from './NotificationDisclosure'

export default function NotificationSettings() {
  const { profile } = useAuth()
  const { language, t } = useLanguage()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const revision = useRef(0)
  const busyRef = useRef(false)
  const support = pushSupport()
  const memberId = profile?.id ?? null

  const refresh = useCallback(async () => {
    if (busyRef.current) return
    if (support !== 'supported' || !memberId) { setBusy(false); return }
    const current = ++revision.current
    setBusy(true)
    try {
      // Start disabled until this account's server-owned preference is known.
      await setPushWorkerState(memberId, false, () => current === revision.current)
      if (current !== revision.current) return
      const { data: config, error: configError } = await pushRpc('get_push_public_config')
      if (configError) throw new Error('알림 서버를 확인하지 못했어요. 다시 시도해주세요.')
      const registration = await pushRegistration()
      const subscription = await devicePushSubscription(registration)
      let active = false
      if (subscription && Notification.permission === 'granted') {
        const { data, error: statusError } = await pushRpc('get_push_subscription_status', { p_endpoint: subscription.endpoint })
        if (statusError) throw new Error('알림 설정을 불러오지 못했어요.')
        active = data === true
        if (active) {
          const { error: updateError } = await pushRpc('set_push_subscription_language', {
            p_endpoint: subscription.endpoint, p_language: language,
          })
          if (updateError) throw new Error('알림 설정을 저장하지 못했어요. 다시 시도해주세요.')
        }
      }
      if (current !== revision.current) return
      await setPushWorkerState(memberId, active, () => current === revision.current)
      if (current !== revision.current) return
      setEnabled(active); setPublicKey(config?.public_key ?? null); setError(null)
    } catch (cause) {
      if (current === revision.current) { setEnabled(false); setError(cause instanceof Error ? cause.message : '알림 설정을 불러오지 못했어요.') }
    } finally { if (current === revision.current) setBusy(false) }
  }, [memberId, support, language])

  useEffect(() => {
    void refresh()
    const resume = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', resume)
    navigator.serviceWorker?.addEventListener('controllerchange', resume)
    return () => {
      revision.current++
      document.removeEventListener('visibilitychange', resume)
      navigator.serviceWorker?.removeEventListener('controllerchange', resume)
    }
  }, [refresh])

  const toggle = async () => {
    if (busyRef.current || busy || !memberId) return
    busyRef.current = true; const operation = ++revision.current; setBusy(true); setError(null)
    try {
      if (enabled) {
        await disableDevicePush(); setEnabled(false)
      } else {
        await enableDevicePush(memberId, publicKey, language, () => operation === revision.current)
        if (operation === revision.current) setEnabled(true)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '알림 설정을 저장하지 못했어요. 다시 시도해주세요.') }
    finally { busyRef.current = false; setBusy(false) }
  }

  const status = error ? t('확인 필요') : support !== 'supported' ? undefined
    : busy ? t('확인 중...') : enabled ? t('켜짐') : t('꺼짐')
  return <NotificationDisclosure title={t('출석 알림')} status={status} attention={!!error}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink/60">{t('수업 시작 시 아직 출석하지 않았다면 한 번 알려드려요.')}</p>
        {support === 'supported' && <button type="button" role="switch" aria-checked={enabled} aria-label={t('이 기기의 출석 알림')}
          disabled={busy || (!enabled && !publicKey)} onClick={() => void toggle()}
          className={`shrink-0 rounded-full min-h-11 px-4 text-xs font-bold disabled:opacity-40 ${enabled ? 'bg-campus text-paper' : 'bg-paper text-ink/60 border border-line'}`}>
          {busy ? t('확인 중...') : enabled ? t('켜짐') : t('꺼짐')}
        </button>}
      </div>
      {support === 'install' ? <p className="text-xs text-campus mt-2">{t('iPhone에서는 홈 화면에 추가한 No Excuse를 열어 알림을 켜주세요.')}</p>
        : support === 'unsupported' ? <p className="text-xs text-ink/60 mt-2">{t('이 브라우저에서는 푸시 알림을 지원하지 않아요.')}</p>
        : <p className="text-[11px] text-ink/50 mt-2">{t('이 기기에서만 적용 · 싱가포르 시간 기준 · 잠금화면에 수업명이 표시될 수 있어요.')}</p>}
      {support === 'supported' && !busy && !publicKey && !error && <p role="status" className="text-xs text-ink/60 mt-2">{t('알림 서버를 준비 중이에요. 잠시 후 다시 시도해주세요.')}</p>}
      {error && <p role="alert" className="text-xs text-stamp mt-2">{t(error)}</p>}
      {support === 'supported' && (error || !publicKey) && !busy && <button type="button" onClick={() => void refresh()} className="text-xs underline mt-2 min-h-11">{t('다시 시도')}</button>}
  </NotificationDisclosure>
}
