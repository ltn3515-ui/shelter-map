// 기상청 단기예보 초단기실황(getUltraSrtNcst) 연동
// https://www.data.go.kr - "기상청_단기예보 ((구)_동네예보) 조회서비스"

const KMA_API_KEY = import.meta.env.VITE_KMA_API_KEY
const KMA_BASE_URL =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst'

export interface WeatherObservation {
  temperatureC: number
  humidityPercent: number
  windSpeedMs: number
}

export type WeatherAlert =
  | 'heat-warning'
  | 'heat-advisory'
  | 'cold-warning'
  | 'cold-advisory'
  | null

// 기상청 격자(nx, ny) 변환 (람베르트 정각원추도법, 기상청 공개 알고리즘)
export function toKmaGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877
  const GRID = 5.0
  const SLAT1 = (30.0 * Math.PI) / 180.0
  const SLAT2 = (60.0 * Math.PI) / 180.0
  const OLON = (126.0 * Math.PI) / 180.0
  const OLAT = (38.0 * Math.PI) / 180.0
  const XO = 43
  const YO = 136

  const re = RE / GRID
  const sn =
    Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) /
    Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5))
  const sf = (Math.tan(Math.PI * 0.25 + SLAT1 * 0.5) ** sn * Math.cos(SLAT1)) / sn
  const ro = (re * sf) / Math.tan(Math.PI * 0.25 + OLAT * 0.5) ** sn

  const ra =
    (re * sf) / Math.tan(Math.PI * 0.25 + (lat * Math.PI) / 180.0 * 0.5) ** sn
  let theta = (lon * Math.PI) / 180.0 - OLON
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5)
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)

  return { nx: x, ny: y }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

// data.go.kr은 Encoding/Decoding 두 형태의 인증키를 함께 제공해 혼동을 유발한다.
// 이미 URL 인코딩된 키(Encoding)를 그대로 받아도 이중 인코딩되지 않도록 먼저 디코딩해둔다.
function normalizeServiceKey(key: string): string {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

// 초단기실황은 매시 40분에 생성되어 10분 뒤 제공되므로, 45분 이전에는 이전 시각 자료를 사용한다.
function getBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const d = new Date(now)
  if (d.getMinutes() < 45) {
    d.setHours(d.getHours() - 1)
  }
  d.setMinutes(0, 0, 0)

  const baseDate = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const baseTime = `${pad2(d.getHours())}00`
  return { baseDate, baseTime }
}

export const isKmaConfigured = Boolean(KMA_API_KEY)

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
): Promise<WeatherObservation> {
  if (!KMA_API_KEY) {
    throw new Error(
      '기상청 API 키가 설정되어 있지 않습니다. .env의 VITE_KMA_API_KEY를 확인하세요.',
    )
  }

  const { nx, ny } = toKmaGrid(lat, lon)
  const { baseDate, baseTime } = getBaseDateTime(new Date())

  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(KMA_API_KEY),
    pageNo: '1',
    numOfRows: '20',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  })

  const response = await fetch(`${KMA_BASE_URL}?${params.toString()}`)
  const bodyText = await response.text()

  if (!response.ok) {
    throw new Error(
      `기상청 API 요청에 실패했습니다. (HTTP ${response.status}) ${bodyText.slice(0, 200)}`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(bodyText)
  } catch {
    // 서비스키 미승인/오류 시 JSON을 요청해도 XML 오류 응답이 오는 경우가 있다.
    throw new Error(`기상청 API 응답을 해석할 수 없습니다: ${bodyText.slice(0, 200)}`)
  }

  const items = (json as { response?: { body?: { items?: { item?: unknown } } } })?.response
    ?.body?.items?.item as { category: string; obsrValue: string }[] | undefined

  if (!items || items.length === 0) {
    const resultMsg =
      (json as { response?: { header?: { resultMsg?: string } } })?.response?.header
        ?.resultMsg ?? '알 수 없는 오류'
    throw new Error(`기상청 API 응답 오류: ${resultMsg}`)
  }

  const findValue = (category: string): number | null => {
    const item = items.find((it) => it.category === category)
    return item ? Number(item.obsrValue) : null
  }

  const temperatureC = findValue('T1H')
  const humidityPercent = findValue('REH')
  const windSpeedMs = findValue('WSD')

  if (temperatureC == null || humidityPercent == null || windSpeedMs == null) {
    throw new Error('기상청 응답에서 필요한 관측값을 찾을 수 없습니다.')
  }

  return { temperatureC, humidityPercent, windSpeedMs }
}

// 여름철 체감온도(습구온도 기반, 기상청/국립기상과학원 공개 산출식). 27도 미만에서는 적용하지 않는다.
function computeWetBulbC(tempC: number, humidityPercent: number): number {
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(humidityPercent + 8.313659)) +
    Math.atan(tempC + humidityPercent) -
    Math.atan(humidityPercent - 1.676331) +
    0.00391838 * humidityPercent ** 1.5 * Math.atan(0.023101 * humidityPercent) -
    4.686035
  )
}

function computeSummerFeelsLikeC(tempC: number, humidityPercent: number): number {
  const tw = computeWetBulbC(tempC, humidityPercent)
  return (
    -0.2442 +
    0.55399 * tw +
    0.45535 * tempC -
    0.0022 * tw ** 2 +
    0.00278 * tw * tempC +
    3.0
  )
}

// 겨울철 체감온도(풍속 냉각지수, 기상청 공개 산출식). 10도 이하 & 풍속 1.3m/s 이상에서만 적용한다.
function computeWinterFeelsLikeC(tempC: number, windSpeedMs: number): number {
  const windKmh = windSpeedMs * 3.6
  return (
    13.12 +
    0.6215 * tempC -
    11.37 * windKmh ** 0.16 +
    0.3965 * tempC * windKmh ** 0.16
  )
}

export function computeFeelsLikeC(observation: WeatherObservation): number {
  const { temperatureC, humidityPercent, windSpeedMs } = observation

  if (temperatureC >= 27) {
    return computeSummerFeelsLikeC(temperatureC, humidityPercent)
  }
  if (temperatureC <= 10 && windSpeedMs >= 1.3) {
    return computeWinterFeelsLikeC(temperatureC, windSpeedMs)
  }
  return temperatureC
}

// 기상청 특보 발표 기준(체감온도)을 근사한 참고용 판정이며, 실제 특보 발표와 다를 수 있다.
export function classifyWeatherAlert(feelsLikeC: number): WeatherAlert {
  if (feelsLikeC >= 35) return 'heat-warning'
  if (feelsLikeC >= 33) return 'heat-advisory'
  if (feelsLikeC <= -15) return 'cold-warning'
  if (feelsLikeC <= -12) return 'cold-advisory'
  return null
}

export const WEATHER_ALERT_LABEL: Record<Exclude<WeatherAlert, null>, string> = {
  'heat-warning': '폭염경보',
  'heat-advisory': '폭염주의보',
  'cold-warning': '한파경보',
  'cold-advisory': '한파주의보',
}
