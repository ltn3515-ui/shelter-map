import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setInstalled(isStandalone())

    const beforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const appInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  if (installed || dismissed || !installEvent) return null

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    else setDismissed(true)
    setInstallEvent(null)
  }

  return (
    <div className="absolute bottom-4 left-4 z-40 max-w-[280px] rounded-2xl bg-white p-4 shadow-2xl">
      <p className="text-sm font-black">잠깐 앱으로 설치하기</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">홈 화면에 추가하면 더 빠르게 주변 쉼터를 찾을 수 있습니다.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={install} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">설치</button>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">나중에</button>
      </div>
    </div>
  )
}
