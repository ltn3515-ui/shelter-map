import { useEffect, useState } from 'react'
import KakaoMap from './components/KakaoMap'
import WeatherBanner from './components/WeatherBanner'

const LARGE_TEXT_STORAGE_KEY = 'shelter-map:large-text'

function getInitialLargeText(): boolean {
  try {
    return localStorage.getItem(LARGE_TEXT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function App() {
  const [largeText, setLargeText] = useState(getInitialLargeText)

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText)
    try {
      localStorage.setItem(LARGE_TEXT_STORAGE_KEY, String(largeText))
    } catch {
      // localStorage 접근이 불가능한 환경에서는 토글 상태만 유지한다.
    }
  }, [largeText])

  return (
    <div className="relative h-screen w-screen">
      <WeatherBanner />
      <button
        type="button"
        onClick={() => setLargeText((prev) => !prev)}
        aria-pressed={largeText}
        aria-label="큰 글자 모드 전환"
        title="큰 글자 모드 전환"
        className="absolute top-3 right-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-sm font-bold shadow"
      >
        <span className="text-base">가</span> <span className="text-xs">나</span>
      </button>
      <KakaoMap />
    </div>
  )
}

export default App
