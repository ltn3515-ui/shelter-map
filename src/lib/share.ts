export const SHELTER_ID_PARAM = 'shelter'

export function buildShareUrl(shelterId: string): string {
  const url = new URL(`${window.location.origin}${window.location.pathname}`)
  url.searchParams.set(SHELTER_ID_PARAM, shelterId)
  return url.toString()
}

export function getShelterIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(SHELTER_ID_PARAM)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 클립보드 권한이 없는 환경에서는 아래 폴백으로 넘어간다.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  } catch {
    return false
  }
}
