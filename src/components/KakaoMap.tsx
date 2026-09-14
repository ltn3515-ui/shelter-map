import { useEffect, useRef, useState } from 'react'
import {
  CROWD_STATUS_OPTIONS,
  reportCrowdStatus,
  type CrowdStatus,
} from '../data/crowd-reports'
import {
  getShelterOpenStatus,
  loadShelters,
  type Shelter,
} from '../data/shelters'
import { buildShareUrl, copyToClipboard, getShelterIdFromUrl } from '../lib/share'
import { formatDistanceMeters, haversineDistanceMeters } from '../utils/distance'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY

// 위치 권한을 받기 전에는 지도 중심만 서울시청으로 두되,
// 실제 쉼터 검색 기준 위치로 사용하지 않는다.
const DEFAULT_MAP_CENTER = { lat: 37.5665, lng: 126.978 }

// "내 위치"를 확인하면 이 반경(m) 안의 쉼터만 우선 표시한다.
const NEARBY_RADIUS_METERS = 3000
const MAX_RENDERED_MARKERS = 500
const MIN_DISTANCE_FOR_SHELTER_REFRESH_METERS = 100

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
}

const OPEN_STATUS_LABEL = {
  open: '현재 운영 중',
  closed: '운영 종료',
  unknown: '운영시간 정보 없음',
} as const

const OPEN_STATUS_COLOR = {
  open: '#16a34a',
  closed: '#dc2626',
  unknown: '#6b7280',
} as const

type ShelterFilter = 'all' | Shelter['type']

type LocationInfo = {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

const SHELTER_TYPE_LABEL: Record<Shelter['type'], string> = {
  summer: '무더위쉼터',
  winter: '한파쉼터',
}

const SHELTER_TYPE_COLOR: Record<Shelter['type'], string> = {
  summer: '#ea580c',
  winter: '#2563eb',
}

const FILTER_OPTIONS: { value: ShelterFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'summer', label: '무더위' },
  { value: 'winter', label: '한파' },
]

function buildPinMarkerImageUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.268 21.732 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildCurrentLocationMarkerImageUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#2563eb" fill-opacity="0.22"/><circle cx="15" cy="15" r="8" fill="#2563eb" stroke="#fff" stroke-width="3"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function getAccuracyLabel(accuracy: number): string {
  if (accuracy <= 50) return '정확'
  if (accuracy <= 200) return '보통'
  return '낮음'
}

function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return '위치 권한이 차단되어 있습니다. 브라우저 설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return '현재 위치를 확인할 수 없습니다. GPS와 네트워크 연결 상태를 확인해주세요.'
  }
  if (error.code === error.TIMEOUT) {
    return '위치 확인 시간이 초과되었습니다. 실외나 창가에서 다시 시도해주세요.'
  }
  return '현재 위치를 가져오지 못했습니다.'
}

function loadKakaoMapSdk(): Promise<void> {
  if (window.kakao?.maps) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=clusterer`
    script.async = true
    script.onload = () => window.kakao.maps.load(resolve)
    script.onerror = () => reject(new Error('Failed to load Kakao Maps SDK'))
    document.head.appendChild(script)
  })
}

function selectSheltersToRender(
  allShelters: Shelter[],
  location: { lat: number; lng: number } | null,
  sharedShelterId: string | null,
  filter: ShelterFilter,
): Shelter[] {
  const typeFiltered =
    filter === 'all' ? allShelters : allShelters.filter((shelter) => shelter.type === filter)

  // GPS 위치가 없으면 임의의 도시를 사용자 위치처럼 사용하지 않는다.
  // 공유 링크로 지정된 쉼터만 예외적으로 표시한다.
  if (!location) {
    if (!sharedShelterId) return []
    const sharedShelter = allShelters.find((shelter) => shelter.id === sharedShelterId)
    return sharedShelter ? [sharedShelter] : []
  }

  const byDistance = typeFiltered
    .map((shelter) => ({
      shelter,
      distanceMeters: haversineDistanceMeters(
        location.lat,
        location.lng,
        shelter.latitude,
        shelter.longitude,
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const withinRadius = byDistance
    .filter((entry) => entry.distanceMeters <= NEARBY_RADIUS_METERS)
    .map((entry) => entry.shelter)

  let selected =
    withinRadius.length > 0
      ? withinRadius
      : byDistance.slice(0, MAX_RENDERED_MARKERS).map((entry) => entry.shelter)

  if (sharedShelterId && !selected.some((shelter) => shelter.id === sharedShelterId)) {
    const sharedShelter = allShelters.find((shelter) => shelter.id === sharedShelterId)
    if (sharedShelter) {
      selected = [...selected, sharedShelter]
    }
  }

  return selected
}

function buildInfoWindowContent(
  shelter: Shelter,
  userLocation: { lat: number; lng: number } | null,
): HTMLElement {
  const label = SHELTER_TYPE_LABEL[shelter.type]
  const status = getShelterOpenStatus(shelter.operatingHours)

  const content = document.createElement('div')
  content.style.cssText =
    'padding:8px 10px;font-size:0.8125rem;line-height:1.6;white-space:nowrap;'

  const title = document.createElement('div')
  title.style.fontWeight = 'bold'
  title.textContent = `[${label}] ${shelter.name}`
  content.appendChild(title)

  if (userLocation) {
    const distanceMeters = haversineDistanceMeters(
      userLocation.lat,
      userLocation.lng,
      shelter.latitude,
      shelter.longitude,
    )
    const distanceEl = document.createElement('div')
    distanceEl.textContent = formatDistanceMeters(distanceMeters)
    content.appendChild(distanceEl)
  }

  const statusEl = document.createElement('div')
  statusEl.style.color = OPEN_STATUS_COLOR[status]
  statusEl.textContent = OPEN_STATUS_LABEL[status]
  content.appendChild(statusEl)

  const disclaimerEl = document.createElement('div')
  disclaimerEl.style.cssText = 'margin-top:2px;font-size:0.625rem;color:#9ca3af;'
  disclaimerEl.textContent = '실제 운영 상황과 다를 수 있습니다.'
  content.appendChild(disclaimerEl)

  const linkRow = document.createElement('div')
  linkRow.style.cssText = 'display:flex;gap:10px;margin-top:6px;'

  const directionsLink = document.createElement('a')
  directionsLink.href = `https://map.kakao.com/link/to/${encodeURIComponent(
    shelter.name,
  )},${shelter.latitude},${shelter.longitude}`
  directionsLink.target = '_blank'
  directionsLink.rel = 'noopener noreferrer'
  directionsLink.textContent = '길찾기'
  directionsLink.style.cssText =
    'color:#2563eb;text-decoration:underline;font-size:0.75rem;'
  linkRow.appendChild(directionsLink)

  const reportLink = document.createElement('a')
  reportLink.href = '#'
  reportLink.textContent = '정보가 틀렸나요?'
  reportLink.style.cssText =
    'color:#6b7280;text-decoration:underline;font-size:0.75rem;'
  reportLink.addEventListener('click', (event) => {
    event.preventDefault()
    window.alert('신고해주셔서 감사합니다.')
  })
  linkRow.appendChild(reportLink)

  const shareLink = document.createElement('a')
  shareLink.href = '#'
  shareLink.textContent = '공유하기'
  shareLink.style.cssText =
    'color:#2563eb;text-decoration:underline;font-size:0.75rem;'
  shareLink.addEventListener('click', (event) => {
    event.preventDefault()
    const shareUrl = buildShareUrl(shelter.id)
    copyToClipboard(shareUrl).then((success) => {
      if (success) {
        window.alert('링크가 복사되었습니다.')
      } else {
        window.prompt('아래 링크를 복사하세요:', shareUrl)
      }
    })
  })
  linkRow.appendChild(shareLink)

  content.appendChild(linkRow)

  const crowdSection = document.createElement('div')
  crowdSection.style.cssText = 'margin-top:8px;'

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;gap:4px;'

  const feedbackEl = document.createElement('div')
  feedbackEl.style.cssText = 'margin-top:4px;font-size:0.6875rem;color:#2563eb;'

  for (const option of CROWD_STATUS_OPTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = option
    button.style.cssText =
      'flex:1;padding:4px 0;font-size:0.75rem;border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;cursor:pointer;'
    button.addEventListener('click', () => {
      button.disabled = true
      feedbackEl.style.color = '#2563eb'
      feedbackEl.textContent = '제보 중...'
      reportCrowdStatus(shelter, option as CrowdStatus)
        .then(() => {
          feedbackEl.style.color = '#2563eb'
          feedbackEl.textContent = `"${option}" 제보가 접수되었습니다. 감사합니다!`
        })
        .catch((err: Error) => {
          feedbackEl.style.color = '#dc2626'
          feedbackEl.textContent = err.message
        })
        .finally(() => {
          button.disabled = false
        })
    })
    buttonRow.appendChild(button)
  }

  crowdSection.appendChild(buttonRow)
  crowdSection.appendChild(feedbackEl)
  content.appendChild(crowdSection)

  return content
}

export default function KakaoMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null)
  const [filter, setFilter] = useState<ShelterFilter>('all')
  const requestLocationRef = useRef<(() => void) | null>(null)
  const setFilterRef = useRef<((filter: ShelterFilter) => void) | null>(null)

  useEffect(() => {
    if (!KAKAO_MAP_KEY) {
      setError('VITE_KAKAO_MAP_KEY가 .env 파일에 설정되어 있지 않습니다.')
      return
    }

    let cancelled = false
    let watchId: number | null = null
    const userLocationRef = { current: null as { lat: number; lng: number } | null }
    const lastShelterRenderLocationRef = {
      current: null as { lat: number; lng: number } | null,
    }
    const sharedShelterId = getShelterIdFromUrl()
    const allSheltersRef = { current: [] as Shelter[] }
    const currentMarkersRef = { current: [] as kakao.maps.Marker[] }
    const filterRef = { current: 'all' as ShelterFilter }
    const currentLocationMarkerRef = { current: null as kakao.maps.Marker | null }

    loadKakaoMapSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return

        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(
            DEFAULT_MAP_CENTER.lat,
            DEFAULT_MAP_CENTER.lng,
          ),
          level: 3,
        })

        const infoWindow = new window.kakao.maps.InfoWindow({ zIndex: 10000 })

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

        const currentLocationMarkerImage = new window.kakao.maps.MarkerImage(
          buildCurrentLocationMarkerImageUrl(),
          new window.kakao.maps.Size(30, 30),
          { offset: new window.kakao.maps.Point(15, 15) },
        )

        function renderMarkers() {
          for (const marker of currentMarkersRef.current) {
            marker.setMap(null)
          }
          currentMarkersRef.current = []

          const shelters = selectSheltersToRender(
            allSheltersRef.current,
            userLocationRef.current,
            sharedShelterId,
            filterRef.current,
          )

          console.info(`지도에 쉼터 ${shelters.length}건을 표시합니다.`)

          const markers: kakao.maps.Marker[] = []

          for (const shelter of shelters) {
            const marker = new window.kakao.maps.Marker({
              map,
              position: new window.kakao.maps.LatLng(
                shelter.latitude,
                shelter.longitude,
              ),
              title: shelter.name,
              image: markerImages[shelter.type],
            })

            window.kakao.maps.event.addListener(marker, 'click', () => {
              infoWindow.setContent(
                buildInfoWindowContent(shelter, userLocationRef.current),
              )
              infoWindow.open(map, marker)
            })

            markers.push(marker)

            if (sharedShelterId && shelter.id === sharedShelterId) {
              map.setCenter(
                new window.kakao.maps.LatLng(shelter.latitude, shelter.longitude),
              )
              infoWindow.setContent(
                buildInfoWindowContent(shelter, userLocationRef.current),
              )
              infoWindow.open(map, marker)
            }
          }

          try {
            new window.kakao.maps.MarkerClusterer({
              map,
              markers,
              gridSize: 60,
              averageCenter: true,
              minLevel: 6,
            })
          } catch (clustererErr) {
            console.warn(
              '마커 클러스터러 초기화에 실패하여 개별 마커로 표시합니다.',
              clustererErr,
            )
          }

          currentMarkersRef.current = markers
        }

        function updateCurrentLocation(position: GeolocationPosition) {
          if (cancelled) return

          const { latitude, longitude, accuracy } = position.coords
          const nextLocation = { lat: latitude, lng: longitude }
          const kakaoPosition = new window.kakao.maps.LatLng(latitude, longitude)
          const isFirstLocation = userLocationRef.current == null

          userLocationRef.current = nextLocation
          setLocationInfo({
            ...nextLocation,
            accuracy,
            timestamp: position.timestamp,
          })
          setLocationError(null)
          setLocating(false)
          setTracking(true)

          if (!currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current = new window.kakao.maps.Marker({
              map,
              position: kakaoPosition,
              title: '내 위치',
              image: currentLocationMarkerImage,
              zIndex: 9999,
            })
          } else {
            currentLocationMarkerRef.current.setPosition(kakaoPosition)
          }

          if (isFirstLocation) {
            map.setCenter(kakaoPosition)
            map.setLevel(5)
          }

          const previousRenderedLocation = lastShelterRenderLocationRef.current
          const movedEnough =
            !previousRenderedLocation ||
            haversineDistanceMeters(
              previousRenderedLocation.lat,
              previousRenderedLocation.lng,
              latitude,
              longitude,
            ) >= MIN_DISTANCE_FOR_SHELTER_REFRESH_METERS

          if (movedEnough) {
            lastShelterRenderLocationRef.current = nextLocation
            renderMarkers()
          }
        }

        function handleLocationError(geoError: GeolocationPositionError) {
          if (cancelled) return
          setLocating(false)
          setLocationError(getLocationErrorMessage(geoError))

          if (geoError.code === geoError.PERMISSION_DENIED && watchId != null) {
            navigator.geolocation.clearWatch(watchId)
            watchId = null
            setTracking(false)
          }

          console.warn('위치 정보를 가져오지 못했습니다.', geoError.message)
        }

        requestLocationRef.current = () => {
          if (!navigator.geolocation) {
            setLocationError('이 브라우저는 위치 정보를 지원하지 않습니다.')
            return
          }

          if (userLocationRef.current) {
            map.setCenter(
              new window.kakao.maps.LatLng(
                userLocationRef.current.lat,
                userLocationRef.current.lng,
              ),
            )
          }

          if (watchId != null) return

          setLocating(true)
          setLocationError(null)

          watchId = navigator.geolocation.watchPosition(
            updateCurrentLocation,
            handleLocationError,
            GEOLOCATION_OPTIONS,
          )
        }

        setFilterRef.current = (nextFilter) => {
          filterRef.current = nextFilter
          renderMarkers()
          setFilter(nextFilter)
        }

        loadShelters()
          .then((shelters) => {
            if (cancelled) return
            console.info(`쉼터 ${shelters.length}건을 불러왔습니다.`)
            allSheltersRef.current = shelters
            renderMarkers()
          })
          .catch((err: Error) => {
            console.error('쉼터 마커를 지도에 표시하는 중 오류가 발생했습니다.', err)
          })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-red-50 text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!locationInfo && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(88vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-4 text-center shadow-xl">
          <div className="text-2xl">📍</div>
          <div className="mt-1 font-bold text-gray-900">내 위치를 먼저 확인해주세요</div>
          <div className="mt-1 text-xs leading-5 text-gray-500">
            위치를 확인하면 반경 3km의 무더위·한파 쉼터를 보여드립니다.
          </div>
        </div>
      )}

      {locationInfo && (
        <div className="absolute left-3 top-16 z-10 rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
          <div className="font-bold text-blue-700">
            🔵 내 위치 · 정확도 {getAccuracyLabel(locationInfo.accuracy)}
          </div>
          <div className="mt-0.5 text-gray-500">
            오차 약 ±{Math.round(locationInfo.accuracy)}m
            {tracking ? ' · 이동 위치 추적 중' : ''}
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-4 z-10 flex gap-1 rounded-full bg-white/90 p-1 shadow-lg">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilterRef.current?.(option.value)}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === option.value ? 'bg-gray-900 text-white' : 'text-gray-600'
            }`}
          >
            {option.value !== 'all' && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SHELTER_TYPE_COLOR[option.value] }}
              />
            )}
            {option.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => requestLocationRef.current?.()}
        disabled={locating}
        className="absolute bottom-6 right-4 z-10 rounded-full bg-white/90 px-4 py-2 text-sm font-medium shadow-lg disabled:opacity-60"
      >
        📍 {locating ? '위치 확인 중...' : locationInfo ? '내 위치로 이동' : '내 위치 찾기'}
      </button>

      {locationError && (
        <div className="absolute bottom-20 right-4 z-20 max-w-[280px] rounded-xl bg-red-50 px-3 py-3 text-xs leading-5 text-red-700 shadow-lg">
          <div>{locationError}</div>
          <button
            type="button"
            onClick={() => requestLocationRef.current?.()}
            className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white"
          >
            위치 다시 확인
          </button>
        </div>
      )}
    </div>
  )
}
