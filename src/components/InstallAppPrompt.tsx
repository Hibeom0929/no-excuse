import React, { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_AT_KEY = 'no-excuse-install-prompt-dismissed-at'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000

function isInstalled() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isMobileDevice() {
  return isIos() || /Android/i.test(navigator.userAgent)
    || window.matchMedia('(max-width: 767px)').matches
}

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [showInstallSteps, setShowInstallSteps] = useState(false)
  const ios = typeof navigator !== 'undefined' && isIos()

  useEffect(() => {
    if (isInstalled() || !isMobileDevice()) return

    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) ?? 0)
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const handleInstalled = () => {
      setInstallEvent(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    // iOS Safari와 설치 이벤트를 제공하지 않는 모바일 브라우저에도 직접 안내한다.
    setVisible(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!installEvent) {
      setShowInstallSteps(true)
      return
    }

    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      setInstallEvent(null)
      setVisible(false)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  return (
    <aside
      aria-label="앱 설치 안내"
      className="fixed inset-x-4 z-50 mx-auto max-w-md rounded-2xl border border-campus/20 bg-white p-4 shadow-2xl"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="absolute right-3 top-2 text-xl leading-none text-ink/30 hover:text-ink"
      >
        ×
      </button>

      <div className="flex items-center gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl shadow-card" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-ink">출첵벌금을 앱처럼 열어보세요</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink/50">홈 화면 아이콘으로 바로 접속하고 전체 화면으로 사용할 수 있어요.</p>
        </div>
      </div>

      {showInstallSteps ? (
        <div className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-xs leading-relaxed text-ink/70">
          {ios ? (
            <>Safari 아래쪽의 <strong>공유 버튼(□↑)</strong>을 누른 뒤<br /><strong>‘홈 화면에 추가’ → ‘추가’</strong>를 선택하세요.</>
          ) : (
            <>브라우저 오른쪽 위의 <strong>메뉴(⋮)</strong>를 누른 뒤<br /><strong>‘앱 설치’ 또는 ‘홈 화면에 추가’</strong>를 선택하세요.</>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full rounded-xl bg-campus py-2.5 text-sm font-bold text-paper hover:bg-campusLight"
        >
          {ios ? 'iPhone 설치 방법 보기' : installEvent ? '홈 화면에 앱 추가' : '설치 방법 보기'}
        </button>
      )}
    </aside>
  )
}
