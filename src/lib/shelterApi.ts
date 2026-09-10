// 재난안전데이터공유플랫폼(safetydata.go.kr) 쉼터 조회 API 연동
// - 한파쉼터: https://www.safetydata.go.kr/V2/api/DSSP-IF-10804
// - 무더위쉼터: https://www.safetydata.go.kr/V2/api/DSSP-IF-10942
//
// NOTE: 실제 서비스키로 호출을 검증하기 전까지는 아래 항목이 추정치입니다.
// 응답을 받아본 뒤 다르면 이 파일만 수정하면 됩니다.
// - 페이징 파라미터명: pageNo / numOfRows (data.go.kr류 공공API의 일반적인 표기를 따름)
// - JSON 응답 형식 파라미터명: returnType=json
// - 응답 바디 구조: { header: { resultCode, resultMsg, totalCount, ... }, body: [...] }
//   (body가 다른 키로 오면 parseResponseRows의 후보 목록에 추가할 것)

const WINTER_API_URL = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-10804'
const SUMMER_API_URL = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-10942'

const WINTER_API_KEY = import.meta.env.VITE_WINTER_SHELTER_API_KEY
const SUMMER_API_KEY = import.meta.env.VITE_SUMMER_SHELTER_API_KEY

export const isShelterApiConfigured = Boolean(WINTER_API_KEY && SUMMER_API_KEY)

// 페이지당 건수를 크게 잡아 호출 횟수를 최소화한다 (일일 호출량 500건 제한 보호).
// 서버가 이보다 작은 값으로 제한하더라도 totalCount 기준으로 정상 종료되므로 동작에는 문제없다.
const PAGE_SIZE = 1000
// 응답 형식이 예상과 달라 totalCount를 못 읽는 경우를 대비한 무한 루프 방지용 상한.
const MAX_PAGES = 50

export type ApiRow = Record<string, string | number | undefined>

interface SafetyDataResponseHeader {
  resultCode?: string
  resultMsg?: string
  totalCount?: number
  currentCount?: number
  pageNo?: number
}

interface SafetyDataResponse {
  header?: SafetyDataResponseHeader
  body?: ApiRow[]
  // 일부 safetydata.go.kr API는 body 대신 data 키를 쓰는 경우가 있어 함께 대응한다.
  data?: ApiRow[]
}

function extractRows(json: SafetyDataResponse): ApiRow[] {
  return json.body ?? json.data ?? []
}

async function fetchAllRows(
  apiUrl: string,
  serviceKey: string | undefined,
  apiLabel: string,
): Promise<ApiRow[]> {
  if (!serviceKey) {
    throw new Error(`${apiLabel} API 키가 설정되어 있지 않습니다.`)
  }

  const rows: ApiRow[] = []

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const params = new URLSearchParams({
      serviceKey,
      returnType: 'json',
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
    })

    const response = await fetch(`${apiUrl}?${params.toString()}`)
    const bodyText = await response.text()

    if (!response.ok) {
      throw new Error(
        `${apiLabel} API 요청에 실패했습니다. (HTTP ${response.status}) ${bodyText.slice(0, 200)}`,
      )
    }

    let json: SafetyDataResponse
    try {
      json = JSON.parse(bodyText)
    } catch {
      throw new Error(`${apiLabel} API 응답을 해석할 수 없습니다: ${bodyText.slice(0, 200)}`)
    }

    const resultCode = json.header?.resultCode
    if (resultCode != null && resultCode !== '00') {
      throw new Error(`${apiLabel} API 오류: ${json.header?.resultMsg ?? resultCode}`)
    }

    const pageRows = extractRows(json)
    rows.push(...pageRows)

    const totalCount = json.header?.totalCount
    const isLastPage =
      pageRows.length === 0 ||
      pageRows.length < PAGE_SIZE ||
      (totalCount != null && rows.length >= totalCount)

    if (isLastPage) break
  }

  return rows
}

export function fetchWinterShelterRows(): Promise<ApiRow[]> {
  return fetchAllRows(WINTER_API_URL, WINTER_API_KEY, '한파쉼터')
}

export function fetchSummerShelterRows(): Promise<ApiRow[]> {
  return fetchAllRows(SUMMER_API_URL, SUMMER_API_KEY, '무더위쉼터')
}
