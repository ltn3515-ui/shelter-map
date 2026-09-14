import { useEffect, useState } from 'react'

export default function OfflineNotice() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white shadow-xl">
      오프라인 상태입니다. 저장된 화면은 볼 수 있지만 지도·날씨·제보는 인터넷 연결이 필요합니다.
    </div>
  )
}
