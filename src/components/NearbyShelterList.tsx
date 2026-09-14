import { getShelterOpenStatus, type Shelter } from '../data/shelters'
import { formatDistanceMeters } from '../utils/distance'

export type NearbyShelter = { shelter: Shelter; distanceMeters: number }

type Props = {
  items: NearbyShelter[]
  onSelect: (shelter: Shelter) => void
}

export default function NearbyShelterList({ items, onSelect }: Props) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between px-2 py-1">
        <strong className="text-sm">내 주변 쉼터</strong>
        <span className="text-xs text-gray-500">가까운 순 {items.length}곳</span>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-gray-500">위치를 확인하면 가까운 쉼터를 보여드려요.</p>
      ) : (
        items.map(({ shelter, distanceMeters }) => {
          const status = getShelterOpenStatus(shelter.operatingHours)
          return (
            <button key={shelter.id} type="button" onClick={() => onSelect(shelter)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-gray-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{shelter.name}</span>
                <span className="block truncate text-xs text-gray-500">{shelter.type === 'summer' ? '무더위쉼터' : '한파쉼터'} · {status === 'open' ? '운영 중' : status === 'closed' ? '운영 종료' : '운영시간 확인 필요'}</span>
              </span>
              <span className="ml-3 shrink-0 text-xs font-bold text-blue-600">{formatDistanceMeters(distanceMeters)}</span>
            </button>
          )
        })
      )}
    </div>
  )
}
