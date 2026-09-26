import React from 'react'

interface State { hasError: boolean; message?: string }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown) {
    console.error('앱 오류:', error)
  }

  render() {
    if (this.state.hasError) {
      const english = document.documentElement.lang === 'en'
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-2xl mb-2">⚠️</p>
            <h1 className="font-bold text-ink mb-1">{english ? 'Something went wrong' : '문제가 생겼어요'}</h1>
            <p className="text-sm text-ink/50 mb-4">
              {english ? 'An error occurred while displaying this screen. Refreshing usually fixes it.' : '화면을 표시하는 중 오류가 발생했어요. 새로고침하면 대부분 해결돼요.'}
            </p>
            {this.state.message && (
              <p className="text-[11px] font-mono text-ink/30 mb-4 break-all">{this.state.message}</p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-campus text-paper font-bold text-sm rounded-lg px-5 py-2.5 hover:bg-campusLight"
            >
              {english ? 'Refresh' : '새로고침'}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
