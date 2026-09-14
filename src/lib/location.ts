export type LocationInfo = {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

// 쉼터 검색은 위치 정확도가 중요하므로 캐시 위치를 쓰지 않고 최신 고정밀 위치를 요청한다.
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
}

// 이 값보다 큰 오차는 다른 도시/구 단위로 튈 수 있어 쉼터 검색 기준으로 사용하지 않는다.
export const MAX_USABLE_ACCURACY_METERS = 500

export function getAccuracyLabel(accuracy: number): string {
  if (accuracy <= 50) return '정확'
  if (accuracy <= 200) return '보통'
  if (accuracy <= MAX_USABLE_ACCURACY_METERS) return '낮음'
  return '사용 불가'
}

export function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return '위치 권한이 차단되어 있습니다. 브라우저 설정에서 위치 권한을 허용해주세요.'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return '현재 위치를 확인할 수 없습니다. GPS와 네트워크 연결 상태를 확인해주세요.'
  }
  if (error.code === error.TIMEOUT) {
    return '정확한 위치 확인 시간이 초과되었습니다. 스마트폰의 정확한 위치를 켜고 실외나 창가에서 다시 시도해주세요.'
  }
  return '현재 위치를 가져오지 못했습니다.'
}
