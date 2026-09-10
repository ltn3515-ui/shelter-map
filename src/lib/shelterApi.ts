// 쉼터 데이터는 브라우저에서 safetydata.go.kr을 직접 호출하지 않는다.
// - CORS: safetydata.go.kr이 브라우저 출처(origin)를 허용하지 않아 직접 호출이 차단된다.
// - 서비스키 보호: 서비스키를 클라이언트 번들에 넣지 않기 위해 서버(Vercel Serverless
//   Function, api/shelters/winter.ts·summer.ts)에서만 사용한다.
// 프론트엔드는 같은 오리진의 /api/shelters/winter, /api/shelters/summer 를 호출하고,
// 그 함수가 실제 safetydata.go.kr 응답을 그대로 중계해 준다.

const WINTER_API_URL = '/api/shelters/winter'
const SUMMER_API_URL = '/api/shelters/summer'

// 페이지당 건수를 크게 잡아 호출 횟수를 최소화한다 (일일 호출량 500건 제한 보호).
// 서버가 이보다 작은 값으로 제한하더라도 totalCount 기준으로 정상 종료되므로 동작에는 문제없다.
const PAGE_SIZE = 1000
// 응답 형식이 예상과 달라 totalCount를 못 읽는 경우를 대비한 무한 루프 방지용 상한.
const MAX_PAGES = 50
// 정부 API 응답이 느리거나 멈춰도 무한정 기다리지 않고 CSV 폴백으로 넘어가도록 제한한다.
const REQUEST_TIMEOUT_MS = 8000

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
  // 프록시 함수 자체가 실패했을 때(예: 서버에 키 미설정) 내려주는 에러 메시지.
  error?: string
}

function extractRows(json: SafetyDataResponse): ApiRow[] {
  return json.body ?? json.data ?? []
}

async function fetchAllRows(proxyUrl: string, apiLabel: string): Promise<ApiRow[]> {
  const rows: ApiRow[] = []

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const params = new URLSearchParams({
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
    })

    let response: Response
    try {
      response = await fetch(`${proxyUrl}?${params.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError'
      throw new Error(
        timedOut
          ? `${apiLabel} API 응답이 ${REQUEST_TIMEOUT_MS / 1000}초 내에 오지 않았습니다.`
          : `${apiLabel} API 요청 중 네트워크 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    const bodyText = await response.text()

    let json: SafetyDataResponse
    try {
      json = JSON.parse(bodyText)
    } catch {
      throw new Error(`${apiLabel} API 응답을 해석할 수 없습니다: ${bodyText.slice(0, 200)}`)
    }

    if (!response.ok) {
      throw new Error(
        `${apiLabel} API 요청에 실패했습니다. (HTTP ${response.status}) ${json.error ?? bodyText.slice(0, 200)}`,
      )
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
  return fetchAllRows(WINTER_API_URL, '한파쉼터')
}

export function fetchSummerShelterRows(): Promise<ApiRow[]> {
  return fetchAllRows(SUMMER_API_URL, '무더위쉼터')
}
