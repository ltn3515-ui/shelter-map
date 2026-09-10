import type { Shelter } from '../data/shelters'

const CACHE_KEY = 'shelter-map:shelters-cache:v1'
// 일일 호출량(500건) 보호를 위해 하루에 한 번만 실제 API를 호출하도록 캐시를 유지한다.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CacheEntry {
  cachedAt: number
  shelters: Shelter[]
}

export function readShelterCache(): Shelter[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null
    if (!Array.isArray(entry.shelters) || entry.shelters.length === 0) return null

    return entry.shelters
  } catch {
    return null
  }
}

export function writeShelterCache(shelters: Shelter[]): void {
  try {
    const entry: CacheEntry = { cachedAt: Date.now(), shelters }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // 저장 공간 부족 등으로 캐싱에 실패해도 화면 표시에는 영향이 없다.
  }
}
