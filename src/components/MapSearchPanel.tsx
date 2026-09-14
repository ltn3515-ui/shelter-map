import type { Shelter } from '../data/shelters'

type Filter = 'all' | 'summer' | 'winter'

type Props = {
  query: string
  filter: Filter
  onQueryChange: (value: string) => void
  onFilterChange: (value: Filter) => void
  resultCount: number
}

export default function MapSearchPanel({ query, filter, onQueryChange, onFilterChange, resultCount }: Props) {
  return (
    <div className="rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2">
        <span aria-hidden>🔎</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="쉼터명 또는 주소 검색"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          aria-label="쉼터 검색"
        />
        {query && (
          <button type="button" onClick={() => onQueryChange('')} className="text-xs text-gray-500">지우기</button>
        )}
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
export type { Shelter }
