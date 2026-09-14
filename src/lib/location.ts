export type LocationInfo = {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
}

export function getAccuracyLabel(accuracy: number): string {
  if (accuracy <= 50) return '정확'
  if (accuracy <= 200) return '보통'
  return '낮음'
}

export function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return '위치 권한이 차단되어 있습니다. 브라우저 설정에서 위치 권한을 허용해주세요.'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return '현재 위치를 확인할 수 없습니다. GPS와 네트워크 연결 상태를 확인해주세요.'
  }
  if (error.code === error.TIMEOUT) {
    return '위치 확인 시간이 초과되었습니다. 실외나 창가에서 다시 시도해주세요.'
  }
  return '현재 위치를 가져오지 못했습니다.'
}
