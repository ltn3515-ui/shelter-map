import { useEffect, useState } from 'react'
import {
  classifyWeatherAlert,
  computeFeelsLikeC,
  fetchCurrentWeather,
  isKmaConfigured,
  WEATHER_ALERT_LABEL,
} from '../lib/weather'

type BannerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; temperatureC: number; feelsLikeC: number; alertLabel: string | null }

function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('현재 지역 날씨를 보려면 위치 권한을 허용해주세요.'))
          return
        }
        if (error.code === error.TIMEOUT) {
          reject(new Error('현재 위치 확인 시간이 초과되었습니다.'))
          return
        }
        reject(new Error('현재 위치를 확인할 수 없어 날씨를 표시하지 않습니다.'))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    )
  })
}

export default function WeatherBanner() {
  const [state, setState] = useState<BannerState>({ status: 'loading' })

  useEffect(() => {
    if (!isKmaConfigured) {
      setState({
        status: 'error',
        message: '기상청 API 키가 설정되어 있지 않습니다 (.env의 VITE_KMA_API_KEY).',
      })
      return
    }

    let cancelled = false

    getLocation()
      .then(({ lat, lng }) => fetchCurrentWeather(lat, lng))
      .then((observation) => {
        if (cancelled) return
        const feelsLikeC = computeFeelsLikeC(observation)
        const alert = classifyWeatherAlert(feelsLikeC)
        setState({
          status: 'ready',
          temperatureC: observation.temperatureC,
          feelsLikeC,
          alertLabel: alert ? WEATHER_ALERT_LABEL[alert] : null,
        })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="absolute top-3 left-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-sm shadow">
      {state.status === 'loading' && <span className="text-gray-500">날씨 정보를 불러오는 중...</span>}
      {state.status === 'error' && <span className="text-gray-400">{state.message}</span>}
      {state.status === 'ready' && (
        <span>
          <span className="font-bold">현재 {Math.round(state.temperatureC)}°C</span>
          <span className="text-gray-500"> · 체감 {Math.round(state.feelsLikeC)}°C</span>
          {state.alertLabel && (
            <span className="ml-1 font-bold text-red-600"> · {state.alertLabel}</span>
          )}
        </span>
      )}
    </div>
  )
}
