import Papa from 'papaparse'
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

function toCoordinate(value: string | undefined): number | null {
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toDayHours(
  start: string | undefined,
  end: string | undefined,
): DayHours | undefined {
  if (!start || !end) return undefined
  return { start, end }
}

function parseCsvRows(csvText: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  }).data
}

// 무더위쉼터: 경도 LO, 위도 LA, 명칭 RSTR_NM, 운영시간은 평일/주말·공휴일 2종류
function parseSummerShelters(): Shelter[] {
  const shelters: Shelter[] = []
  for (const row of parseCsvRows(summerSheltersCsv)) {
    const latitude = toCoordinate(row.LA)
    const longitude = toCoordinate(row.LO)
    const name = row.RSTR_NM?.trim()
    const facilityNo = row.RSTR_FCLTY_NO?.trim()
    if (latitude == null || longitude == null || !name || !facilityNo) continue

    const weekday = toDayHours(
      row.WKDAY_OPER_BEGIN_TIME,
      row.WKDAY_OPER_END_TIME,
    )
    const weekend = toDayHours(
      row.WKEND_HDAY_OPER_BEGIN_TIME,
      row.WKEND_HDAY_OPER_END_TIME,
    )
    const operatingHours: OperatingHours | undefined =
      weekday || weekend
        ? { weekday, saturday: weekend, sunday: weekend, holiday: weekend }
        : undefined

    shelters.push({
      id: `summer-${facilityNo}`,
      name,
      latitude,
      longitude,
      type: 'summer',
      operatingHours,
    })
  }
  return shelters
}

// 한파쉼터: 경도 LOT, 위도 LAT, 명칭 REARE_NM, 운영시간은 평일/토/일/공휴일 4종류
function parseWinterShelters(): Shelter[] {
  const shelters: Shelter[] = []
  for (const row of parseCsvRows(winterSheltersCsv)) {
    const latitude = toCoordinate(row.LAT)
    const longitude = toCoordinate(row.LOT)
    const name = row.REARE_NM?.trim()
    const facilityNo = row.REARE_FCLT_NO?.trim()
    if (latitude == null || longitude == null || !name || !facilityNo) continue

    const weekday = toDayHours(row.WKDY_OPER_BGNG_HR, row.WKDY_OPER_END_HR)
    const saturday = toDayHours(row.STDY_OPER_BGNG_HR, row.STDY_OPER_END_HR)
    const sunday = toDayHours(row.SNDY_OPER_BGNG_HR, row.SNDY_OPER_END_HR)
    const holiday = toDayHours(row.LHLDY_OPER_BGNG_HR, row.LHLDY_OPER_END_HR)
    const operatingHours: OperatingHours | undefined =
      weekday || saturday || sunday || holiday
        ? { weekday, saturday, sunday, holiday }
        : undefined

    shelters.push({
      id: `winter-${facilityNo}`,
      name,
      latitude,
      longitude,
      type: 'winter',
      operatingHours,
    })
  }
  return shelters
}

export function getShelters(): Shelter[] {
  return [...parseSummerShelters(), ...parseWinterShelters()]
}

export function findShelterById(id: string): Shelter | undefined {
  return getShelters().find((shelter) => shelter.id === id)
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
