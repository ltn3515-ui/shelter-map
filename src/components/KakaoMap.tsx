import { useEffect, useMemo, useRef, useState } from 'react'
import { loadShelters, type Shelter } from '../data/shelters'
import { getShelterIdFromUrl } from '../lib/share'
import {
  GEOLOCATION_OPTIONS,
  getAccuracyLabel,
  getLocationErrorMessage,
  MAX_USABLE_ACCURACY_METERS,
  type LocationInfo,
} from '../lib/location'
import { haversineDistanceMeters } from '../utils/distance'
import MapSearchPanel, { type Filter } from './MapSearchPanel'
import NearbyShelterList, { type NearbyShelter } from './NearbyShelterList'
import ShelterBottomSheet from './ShelterBottomSheet'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const DEFAULT_MAP_CENTER = { lat: 37.5665, lng: 126.978 }
const NEARBY_RADIUS_METERS = 3000
const MAX_RENDERED_MARKERS = 200
const LOCATION_SEARCH_WINDOW_MS = 15000

const SHELTER_TYPE_COLOR: Record<Shelter['type'], string> = {
  summer: '#ea580c',
  winter: '#2563eb',
}

function buildPinMarkerImageUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.268 21.732 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildCurrentLocationMarkerImageUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#2563eb" fill-opacity="0.18"/><circle cx="17" cy="17" r="9" fill="#2563eb" stroke="#fff" stroke-width="4"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function loadKakaoMapSdk(): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`
    script.async = true
    script.onload = () => window.kakao.maps.load(resolve)
    script.onerror = () => reject(new Error('카카오맵을 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
}

export default function KakaoMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<kakao.maps.Map | null>(null)
  const currentLocationMarkerRef = useRef<kakao.maps.Marker | null>(null)
  const shelterMarkersRef = useRef<kakao.maps.Marker[]>([])
  const watchIdRef = useRef<number | null>(null)
  const locationSearchTimerRef = useRef<number | null>(null)
  const bestPositionRef = useRef<LocationInfo | null>(null)

  const [shelters, setShelters] = useState<Shelter[]>([])
  const [location, setLocation] = useState<LocationInfo | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationHint, setLocationHint] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null)

  useEffect(() => {
    if (!KAKAO_MAP_KEY) {
      setMapError('카카오맵 API 키가 설정되어 있지 않습니다.')
      return
    }

    let cancelled = false
    loadKakaoMapSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
          level: 5,
        })
      })
      .catch((error: Error) => !cancelled && setMapError(error.message))

    loadShelters()
      .then((data) => !cancelled && setShelters(data))
      .catch((error: Error) => console.error('쉼터 데이터를 불러오지 못했습니다.', error))

    return () => {
      cancelled = true
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (locationSearchTimerRef.current != null) {
        window.clearTimeout(locationSearchTimerRef.current)
      }
    }
  }, [])

  const nearbyShelters = useMemo<NearbyShelter[]>(() => {
    if (!location) return []
    const normalizedQuery = query.trim().toLowerCase()
    return shelters
      .filter((shelter) => filter === 'all' || shelter.type === filter)
      .filter((shelter) => {
        if (!normalizedQuery) return true
        return `${shelter.name} ${shelter.address ?? ''}`.toLowerCase().includes(normalizedQuery)
      })
      .map((shelter) => ({
        shelter,
        distanceMeters: haversineDistanceMeters(
          location.lat,
          location.lng,
          shelter.latitude,
          shelter.longitude,
        ),
      }))
      .filter((item) => item.distanceMeters <= NEARBY_RADIUS_METERS || Boolean(normalizedQuery))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
  }, [filter, location, query, shelters])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    shelterMarkersRef.current.forEach((marker) => marker.setMap(null))
    shelterMarkersRef.current = []

    const markerImages: Record<Shelter['type'], kakao.maps.MarkerImage> = {
      summer: new window.kakao.maps.MarkerImage(
        buildPinMarkerImageUrl(SHELTER_TYPE_COLOR.summer),
        new window.kakao.maps.Size(28, 38),
        { offset: new window.kakao.maps.Point(14, 38) },
      ),
      winter: new window.kakao.maps.MarkerImage(
        buildPinMarkerImageUrl(SHELTER_TYPE_COLOR.winter),
        new window.kakao.maps.Size(28, 38),
        { offset: new window.kakao.maps.Point(14, 38) },
      ),
    }

    for (const { shelter } of nearbyShelters.slice(0, MAX_RENDERED_MARKERS)) {
      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(shelter.latitude, shelter.longitude),
        title: shelter.name,
        image: markerImages[shelter.type],
      })
      window.kakao.maps.event.addListener(marker, 'click', () => focusShelter(shelter))
      shelterMarkersRef.current.push(marker)
    }
  }, [nearbyShelters])

  useEffect(() => {
    if (!location || !mapRef.current) return
    const map = mapRef.current
    const position = new window.kakao.maps.LatLng(location.lat, location.lng)
    map.setCenter(position)
    map.setLevel(4)

    if (!currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current = new window.kakao.maps.Marker({
        map,
        position,
        title: '내 위치',
        image: new window.kakao.maps.MarkerImage(
          buildCurrentLocationMarkerImageUrl(),
          new window.kakao.maps.Size(34, 34),
          { offset: new window.kakao.maps.Point(17, 17) },
        ),
        zIndex: 100,
      })
    } else {
      currentLocationMarkerRef.current.setPosition(position)
      currentLocationMarkerRef.current.setMap(map)
    }
  }, [location])

  function stopLocationTracking() {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (locationSearchTimerRef.current != null) {
      window.clearTimeout(locationSearchTimerRef.current)
      locationSearchTimerRef.current = null
    }
  }

  function startLocationTracking() {
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 위치 기능을 지원하지 않습니다.')
      return
    }

    stopLocationTracking()
    bestPositionRef.current = null
    setLocating(true)
    setLocationError(null)
    setLocationHint('정확한 현재 위치를 찾고 있습니다...')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next: LocationInfo = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }

        const best = bestPositionRef.current
        if (!best || next.accuracy < best.accuracy) {
          bestPositionRef.current = next
        }

        if (next.accuracy <= MAX_USABLE_ACCURACY_METERS) {
          setLocation(next)
          setLocating(false)
          setLocationHint(
            next.accuracy <= 200
              ? '정확한 위치를 찾았습니다.'
              : '위치 정확도가 다소 낮습니다. 스마트폰에서는 정확한 위치를 켜면 더 정확해집니다.',
          )
        } else {
          setLocationHint(
            `현재 위치 오차가 약 ±${Math.round(next.accuracy)}m로 너무 큽니다. 더 정확한 위치를 찾는 중입니다...`,
          )
        }
      },
      (error) => {
        setLocating(false)
        setLocationError(getLocationErrorMessage(error))
        setLocationHint(null)
      },
      GEOLOCATION_OPTIONS,
    )

    locationSearchTimerRef.current = window.setTimeout(() => {
      const best = bestPositionRef.current
      if (best && best.accuracy <= MAX_USABLE_ACCURACY_METERS) {
        setLocation(best)
        setLocationHint('가장 정확한 위치를 사용했습니다.')
      } else if (best) {
        setLocation(null)
        setLocationError(
          `위치 오차가 약 ±${Math.round(best.accuracy)}m로 너무 커서 쉼터 검색에 사용하지 않았습니다. PC보다 스마트폰에서 위치 정확도가 훨씬 좋습니다.`,
        )
        setLocationHint(null)
      } else {
        setLocationError('정확한 현재 위치를 받지 못했습니다. 스마트폰의 위치 서비스를 확인해주세요.')
        setLocationHint(null)
      }
      setLocating(false)
    }, LOCATION_SEARCH_WINDOW_MS)
  }

  function focusShelter(shelter: Shelter) {
    const map = mapRef.current
    if (!map) return
    map.setCenter(new window.kakao.maps.LatLng(shelter.latitude, shelter.longitude))
    map.setLevel(3)
    setSelectedShelter(shelter)
  }

  useEffect(() => {
    const sharedId = getShelterIdFromUrl()
    if (!sharedId || shelters.length === 0) return
    const shared = shelters.find((shelter) => shelter.id === sharedId)
    if (shared) focusShelter(shared)
  }, [shelters])

  const selectedDistance = useMemo(() => {
    if (!selectedShelter || !location) return null
    return haversineDistanceMeters(
      location.lat,
      location.lng,
      selectedShelter.latitude,
      selectedShelter.longitude,
    )
  }, [location, selectedShelter])

  if (mapError) {
    return (
      <div className="flex h-full items-center justify-center bg-red-50 p-6 text-center text-sm text-red-600">
        {mapError}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-3 right-3 top-16 z-20 mx-auto max-w-md">
        <MapSearchPanel
          query={query}
          filter={filter}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          resultCount={nearbyShelters.length}
        />
      </div>

      {location && (
        <div className="absolute left-3 top-40 z-20 rounded-xl bg-white/95 px-3 py-2 text-xs shadow">
          <strong>GPS {getAccuracyLabel(location.accuracy)}</strong>
          <span className="ml-2 text-gray-500">오차 약 ±{Math.round(location.accuracy)}m</span>
        </div>
      )}

      {locationHint && (
        <div className="absolute left-3 top-52 z-20 max-w-[320px] rounded-xl bg-blue-50/95 px-3 py-2 text-xs text-blue-800 shadow">
          {locationHint}
        </div>
      )}

      {!selectedShelter && (
        <div className="absolute bottom-20 left-3 right-3 z-20 mx-auto max-w-md">
          <NearbyShelterList items={nearbyShelters.slice(0, 10)} onSelect={focusShelter} />
        </div>
      )}

      <button
        type="button"
        onClick={startLocationTracking}
        disabled={locating}
        className="absolute bottom-4 right-4 z-20 rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-xl disabled:opacity-60"
      >
        📍 {locating ? '정확한 위치 찾는 중' : location ? '내 위치 다시 찾기' : '내 위치 찾기'}
      </button>

      {locationError && (
        <div className="absolute bottom-20 right-3 z-30 max-w-[300px] rounded-xl bg-red-50 p-3 text-xs text-red-700 shadow-xl">
          <p>{locationError}</p>
          <button type="button" onClick={startLocationTracking} className="mt-2 font-bold underline">
            위치 다시 확인
          </button>
        </div>
      )}

      <ShelterBottomSheet
        shelter={selectedShelter}
        distanceMeters={selectedDistance}
        onClose={() => setSelectedShelter(null)}
      />
    </div>
  )
}
