import { useEffect, useState } from 'react'

type Filter = 'all' | 'summer' | 'winter'

type Props = {
  query: string
  filter: Filter
  onQueryChange: (value: string) => void
  onFilterChange: (value: Filter) => void
  resultCount: number
}

export default function MapSearchPanel({ query, filter, onQueryChange, onFilterChange, resultCount }: Props) {
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      const recommendation = (event as CustomEvent<'summer' | 'winter' | null>).detail
      if (recommendation === 'summer') {
        onFilterChange('summer')
        setWeatherMessage('폭염 위험으로 무더위쉼터를 우선 표시합니다.')
      } else if (recommendation === 'winter') {
        onFilterChange('winter')
        setWeatherMessage('한파 위험으로 한파쉼터를 우선 표시합니다.')
      } else {
        setWeatherMessage(null)
      }
    }

    window.addEventListener('shelter:weather-recommendation', handler)
    return () => window.removeEventListener('shelter:weather-recommendation', handler)
  }, [onFilterChange])

  return (
    <div className="rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
      {weatherMessage && (
        <div className="mb-2 rounded-lg bg-orange-50 px-3 py-2 text-[11px] font-bold text-orange-700">{weatherMessage}</div>
      )}
      <div className="flex items-center gap-2">
        <span aria-hidden>🔎</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="쉼터명 또는 주소 검색"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          aria-label="쉼터 검색"
        />
        {query && <button type="button" onClick={() => onQueryChange('')} className="text-xs text-gray-500">지우기</button>}
      </div>
      <div className="mt-3 flex items-center gap-1">
        {(['all', 'summer', 'winter'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onFilterChange(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {value === 'all' ? '전체' : value === 'summer' ? '무더위' : '한파'}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-400">{resultCount}곳</span>
      </div>
    </div>
  )
}

export type { Filter }
