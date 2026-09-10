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

// Seoul City Hall
const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 }

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

function buildInfoWindowContent(
  shelter: Shelter,
  userLocation: { lat: number; lng: number } | null,
): HTMLElement {
  const label = shelter.type === 'summer' ? '무더위쉼터' : '한파쉼터'
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
    // TODO: Supabase 연동 시 실제 신고 데이터를 저장하도록 교체
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

  useEffect(() => {
    if (!KAKAO_MAP_KEY) {
      setError('VITE_KAKAO_MAP_KEY가 .env 파일에 설정되어 있지 않습니다.')
      return
    }

    let cancelled = false
    const userLocationRef = { current: null as { lat: number; lng: number } | null }
    const sharedShelterId = getShelterIdFromUrl()

    Promise.all([loadKakaoMapSdk(), loadShelters()])
      .then(([, shelters]) => {
        if (cancelled || !containerRef.current) return

        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(
            SEOUL_CITY_HALL.lat,
            SEOUL_CITY_HALL.lng,
          ),
          level: 3,
        })

        if (navigator.geolocation && !sharedShelterId) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (cancelled) return
              const { latitude, longitude } = position.coords
              userLocationRef.current = { lat: latitude, lng: longitude }
              map.setCenter(new window.kakao.maps.LatLng(latitude, longitude))
            },
            (geoError) => {
              console.warn('위치 정보를 가져오지 못했습니다.', geoError.message)
            },
            { enableHighAccuracy: true, timeout: 10000 },
          )
        }

        const infoWindow = new window.kakao.maps.InfoWindow()
        const markers: kakao.maps.Marker[] = []

        for (const shelter of shelters) {
          const marker = new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(
              shelter.latitude,
              shelter.longitude,
            ),
            title: shelter.name,
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

        new window.kakao.maps.MarkerClusterer({
          map,
          markers,
          gridSize: 60,
          averageCenter: true,
          minLevel: 6,
        })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-red-50 text-red-600">
        {error}
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
