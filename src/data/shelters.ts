import Papa from 'papaparse'
import { fetchSummerShelterRows, fetchWinterShelterRows } from '../lib/shelterApi'
import { readShelterCache, writeShelterCache } from '../lib/shelterCache'
import summerSheltersCsv from './행정안전부_무더위쉼터.csv?raw'
import winterSheltersCsv from './한파쉼터.csv?raw'

export type ShelterType = 'summer' | 'winter'

// HHmm 24-hour time strings, e.g. "0900", "1800", "2400"
export interface DayHours {
  start: string
  end: string
}

export interface OperatingHours {
  weekday?: DayHours
  saturday?: DayHours
  sunday?: DayHours
  holiday?: DayHours
}

export interface Shelter {
  id: string
  name: string
  latitude: number
  longitude: number
  type: ShelterType
  operatingHours?: OperatingHours
}

export type OpenStatus = 'open' | 'closed' | 'unknown'

// CSV(문자열)와 오픈API(문자열 또는 숫자) 응답 모두를 같은 매핑 로직으로 처리하기 위한 공용 행 타입.
type ShelterRow = Record<string, string | number | undefined>

function toText(value: string | number | undefined): string | undefined {
  if (value == null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

function toCoordinate(value: string | number | undefined): number | null {
  const text = toText(value)
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

function toDayHours(
  start: string | number | undefined,
  end: string | number | undefined,
): DayHours | undefined {
  const startText = toText(start)
  const endText = toText(end)
  if (!startText || !endText) return undefined
  return { start: startText, end: endText }
}

function parseCsvRows(csvText: string): ShelterRow[] {
  return Papa.parse<ShelterRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  }).data
}

// 무더위쉼터: 경도 LO, 위도 LA, 명칭 RSTR_NM, 운영시간은 평일/주말·공휴일 2종류
function mapSummerRow(row: ShelterRow): Shelter | null {
  const latitude = toCoordinate(row.LA)
  const longitude = toCoordinate(row.LO)
  const name = toText(row.RSTR_NM)
  const facilityNo = toText(row.RSTR_FCLTY_NO)
  if (latitude == null || longitude == null || !name || !facilityNo) return null

  const weekday = toDayHours(row.WKDAY_OPER_BEGIN_TIME, row.WKDAY_OPER_END_TIME)
  const weekend = toDayHours(
    row.WKEND_HDAY_OPER_BEGIN_TIME,
    row.WKEND_HDAY_OPER_END_TIME,
  )
  const operatingHours: OperatingHours | undefined =
    weekday || weekend
      ? { weekday, saturday: weekend, sunday: weekend, holiday: weekend }
      : undefined

  return {
    id: `summer-${facilityNo}`,
    name,
    latitude,
    longitude,
    type: 'summer',
    operatingHours,
  }
}

// 한파쉼터: 경도 LOT, 위도 LAT, 명칭 REARE_NM, 운영시간은 평일/토/일/공휴일 4종류
function mapWinterRow(row: ShelterRow): Shelter | null {
  const latitude = toCoordinate(row.LAT)
  const longitude = toCoordinate(row.LOT)
  const name = toText(row.REARE_NM)
  const facilityNo = toText(row.REARE_FCLT_NO)
  if (latitude == null || longitude == null || !name || !facilityNo) return null

  const weekday = toDayHours(row.WKDY_OPER_BGNG_HR, row.WKDY_OPER_END_HR)
  const saturday = toDayHours(row.STDY_OPER_BGNG_HR, row.STDY_OPER_END_HR)
  const sunday = toDayHours(row.SNDY_OPER_BGNG_HR, row.SNDY_OPER_END_HR)
  const holiday = toDayHours(row.LHLDY_OPER_BGNG_HR, row.LHLDY_OPER_END_HR)
  const operatingHours: OperatingHours | undefined =
    weekday || saturday || sunday || holiday
      ? { weekday, saturday, sunday, holiday }
      : undefined

  return {
    id: `winter-${facilityNo}`,
    name,
    latitude,
    longitude,
    type: 'winter',
    operatingHours,
  }
}

function isShelter(value: Shelter | null): value is Shelter {
  return value !== null
}

// 개발용 샘플 CSV(각 100건)로부터 쉼터 목록을 만든다. 실제 API 호출이 불가능할 때의 폴백으로 쓰인다.
function getSheltersFromCsv(): Shelter[] {
  const summer = parseCsvRows(summerSheltersCsv).map(mapSummerRow).filter(isShelter)
  const winter = parseCsvRows(winterSheltersCsv).map(mapWinterRow).filter(isShelter)
  return [...summer, ...winter]
}

// 재난안전데이터공유플랫폼 오픈API에서 전체 쉼터 목록을 가져온다.
async function fetchSheltersFromApi(): Promise<Shelter[]> {
  const [summerRows, winterRows] = await Promise.all([
    fetchSummerShelterRows(),
    fetchWinterShelterRows(),
  ])

  const summer = summerRows.map(mapSummerRow).filter(isShelter)
  const winter = winterRows.map(mapWinterRow).filter(isShelter)
  const shelters = [...summer, ...winter]

  if (shelters.length === 0) {
    throw new Error('API 응답에서 유효한 쉼터 데이터를 찾을 수 없습니다.')
  }

  return shelters
}

let inFlightLoad: Promise<Shelter[]> | null = null

async function loadSheltersUncached(): Promise<Shelter[]> {
  const cached = readShelterCache()
  if (cached) return cached

  try {
    const shelters = await fetchSheltersFromApi()
    writeShelterCache(shelters)
    return shelters
  } catch (err) {
    console.warn('쉼터 API 호출에 실패하여 샘플 CSV 데이터로 대체합니다.', err)
    return getSheltersFromCsv()
  }
}

// 앱 시작 시 호출되는 진입점.
// 1) 로컬 캐시가 있으면 그대로 사용 (호출량 절약)
// 2) 없으면 실제 오픈API를 호출해 전체 페이지를 순회·병합하고 캐시에 저장
// 3) API 호출이 실패하면(네트워크 오류, 키 미설정, CORS 등) 샘플 CSV로 폴백
// 동시에 여러 번 호출되어도(예: React StrictMode의 개발 모드 이중 마운트) 실제 요청은
// 한 번만 나가도록 진행 중인 호출을 공유한다.
export function loadShelters(): Promise<Shelter[]> {
  if (!inFlightLoad) {
    inFlightLoad = loadSheltersUncached().finally(() => {
      inFlightLoad = null
    })
  }
  return inFlightLoad
}

function hhmmToMinutes(value: string): number {
  const hours = Number(value.slice(0, 2))
  const minutes = Number(value.slice(2, 4))
  return hours * 60 + minutes
}

// 공휴일 여부는 별도 데이터 없이는 판단할 수 없어 평일/토요일/일요일만 구분한다.
export function getShelterOpenStatus(
  operatingHours: OperatingHours | undefined,
  now: Date = new Date(),
): OpenStatus {
  if (!operatingHours) return 'unknown'

  const day = now.getDay() // 0: Sun, 6: Sat
  const dayHours =
    day === 0
      ? operatingHours.sunday
      : day === 6
        ? operatingHours.saturday
        : operatingHours.weekday
  if (!dayHours) return 'unknown'

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const start = hhmmToMinutes(dayHours.start)
  const end = hhmmToMinutes(dayHours.end)

  if (start === end) return 'unknown'
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end ? 'open' : 'closed'
  }
  // 종료 시각이 자정을 넘어가는 경우 (예: 23:00 ~ 01:00)
  return nowMinutes >= start || nowMinutes < end ? 'open' : 'closed'
}
