import Papa from 'papaparse'
import { fetchSummerShelterRows, fetchWinterShelterRows } from '../lib/shelterApi'
import { readShelterCache, writeShelterCache } from '../lib/shelterCache'
import summerSheltersCsv from './행정안전부_무더위쉼터.csv?raw'
import winterSheltersCsv from './한파쉼터.csv?raw'

export type ShelterType = 'summer' | 'winter'

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
  address?: string
  capacity?: number
  updatedAt?: string
}

export type OpenStatus = 'open' | 'closed' | 'unknown'
type ShelterRow = Record<string, string | number | undefined>

function toText(value: string | number | undefined): string | undefined {
  if (value == null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

function toNumber(value: string | number | undefined): number | undefined {
  const text = toText(value)
  if (!text) return undefined
  const valueNumber = Number(text)
  return Number.isFinite(valueNumber) ? valueNumber : undefined
}

function toCoordinate(value: string | number | undefined): number | null {
  const num = toNumber(value)
  return num == null ? null : num
}

function toDayHours(start: string | number | undefined, end: string | number | undefined): DayHours | undefined {
  const startText = toText(start)
  const endText = toText(end)
  if (!startText || !endText) return undefined
  return { start: startText, end: endText }
}

function parseCsvRows(csvText: string): ShelterRow[] {
  return Papa.parse<ShelterRow>(csvText, { header: true, skipEmptyLines: true }).data
}

function mapSummerRow(row: ShelterRow): Shelter | null {
  const latitude = toCoordinate(row.LA)
  const longitude = toCoordinate(row.LO)
  const name = toText(row.RSTR_NM)
  const facilityNo = toText(row.RSTR_FCLTY_NO)
  if (latitude == null || longitude == null || !name || !facilityNo) return null

  const weekday = toDayHours(row.WKDAY_OPER_BEGIN_TIME, row.WKDAY_OPER_END_TIME)
  const weekend = toDayHours(row.WKEND_HDAY_OPER_BEGIN_TIME, row.WKEND_HDAY_OPER_END_TIME)
  const operatingHours: OperatingHours | undefined = weekday || weekend
    ? { weekday, saturday: weekend, sunday: weekend, holiday: weekend }
    : undefined

  return {
    id: `summer-${facilityNo}`,
    name,
    latitude,
    longitude,
    type: 'summer',
    operatingHours,
    address: toText(row.RN_DTL_ADRES) ?? toText(row.DTL_ADRES),
    capacity: toNumber(row.USE_PSBL_NMPR),
    updatedAt: toText(row.MODF_TIME),
  }
}

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
  const operatingHours: OperatingHours | undefined = weekday || saturday || sunday || holiday
    ? { weekday, saturday, sunday, holiday }
    : undefined

  return {
    id: `winter-${facilityNo}`,
    name,
    latitude,
    longitude,
    type: 'winter',
    operatingHours,
    address: toText(row.RONA_DADDR) ?? toText(row.DADDR),
    capacity: toNumber(row.UTZTN_PSBLTY_TNOP),
    updatedAt: toText(row.MDFCN_HR),
  }
}

function isShelter(value: Shelter | null): value is Shelter {
  return value !== null
}

function getSheltersFromCsv(): Shelter[] {
  const summer = parseCsvRows(summerSheltersCsv).map(mapSummerRow).filter(isShelter)
  const winter = parseCsvRows(winterSheltersCsv).map(mapWinterRow).filter(isShelter)
  return [...summer, ...winter]
}

async function fetchSheltersFromApi(): Promise<Shelter[]> {
  const [summerRows, winterRows] = await Promise.all([fetchSummerShelterRows(), fetchWinterShelterRows()])
  const shelters = [
    ...summerRows.map(mapSummerRow).filter(isShelter),
    ...winterRows.map(mapWinterRow).filter(isShelter),
  ]
  if (shelters.length === 0) throw new Error('API 응답에서 유효한 쉼터 데이터를 찾을 수 없습니다.')
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

export function loadShelters(): Promise<Shelter[]> {
  if (!inFlightLoad) {
    inFlightLoad = loadSheltersUncached().finally(() => { inFlightLoad = null })
  }
  return inFlightLoad
}

function hhmmToMinutes(value: string): number {
  const hours = Number(value.slice(0, 2))
  const minutes = Number(value.slice(2, 4))
  return hours * 60 + minutes
}

export function getShelterOpenStatus(operatingHours: OperatingHours | undefined, now: Date = new Date()): OpenStatus {
  if (!operatingHours) return 'unknown'
  const day = now.getDay()
  const dayHours = day === 0 ? operatingHours.sunday : day === 6 ? operatingHours.saturday : operatingHours.weekday
  if (!dayHours) return 'unknown'

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const start = hhmmToMinutes(dayHours.start)
  const end = hhmmToMinutes(dayHours.end)
  if (start === end) return 'unknown'
  if (start < end) return nowMinutes >= start && nowMinutes < end ? 'open' : 'closed'
  return nowMinutes >= start || nowMinutes < end ? 'open' : 'closed'
}
