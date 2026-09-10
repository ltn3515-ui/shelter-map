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
// 실제 데이터(전국 단위)는 페이지 수가 매우 많을 수 있다. 개별 요청은 빠르더라도
// 페이지가 수십 개면 전체 소요 시간이 길어지므로, 이 시간을 넘기면 그때까지 모은
// 데이터만으로 진행한다 (전체를 못 받아도 일부라도 빨리 보여주는 것이 낫다).
const TOTAL_BUDGET_MS = 15000

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

async function fetchPage(
  proxyUrl: string,
  apiLabel: string,
  pageNo: number,
): Promise<{ pageRows: ApiRow[]; totalCount: number | undefined }> {
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

  return { pageRows: extractRows(json), totalCount: json.header?.totalCount }
}

async function fetchAllRows(proxyUrl: string, apiLabel: string): Promise<ApiRow[]> {
  const rows: ApiRow[] = []
  const startedAt = Date.now()

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    if (pageNo > 1 && Date.now() - startedAt > TOTAL_BUDGET_MS) {
      console.warn(
        `${apiLabel} API 페이지네이션이 ${TOTAL_BUDGET_MS / 1000}초를 넘어가 ${rows.length}건까지만 사용합니다.`,
      )
      break
    }

    let pageRows: ApiRow[]
    let totalCount: number | undefined
    try {
      ;({ pageRows, totalCount } = await fetchPage(proxyUrl, apiLabel, pageNo))
    } catch (err) {
      // 이미 여러 페이지를 성공적으로 받아둔 상태라면, 한 페이지가 실패했다고 해서
      // 그동안 모은 데이터까지 전부 버리지 않고 지금까지의 결과로 계속 진행한다.
      if (rows.length > 0) {
        console.warn(
          `${apiLabel} API 페이지 ${pageNo} 요청이 실패하여 지금까지 모은 ${rows.length}건으로 진행합니다.`,
          err,
        )
        break
      }
      throw err
    }

    rows.push(...pageRows)

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
