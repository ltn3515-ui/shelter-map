// Vercel Serverless Function: 브라우저 대신 safetydata.go.kr 무더위쉼터 API를 호출해
// CORS를 우회하고, 서비스키를 서버 쪽에만 둔다. (VITE_ 접두사 없는 SUMMER_SHELTER_API_KEY)
//
// 다른 파일을 import하지 않고 이 파일 하나로 완결시킨다 — Vercel 함수 번들링 시
// 상대 경로 공용 모듈을 잘못 추적하는 문제를 원천적으로 피하기 위함이다.

interface ProxyRequest {
  query: Record<string, string | string[] | undefined>
}

interface ProxyResponse {
  status(code: number): ProxyResponse
  setHeader(name: string, value: string): void
  send(body: string): void
  json(body: unknown): void
}

const SUMMER_API_URL = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-10942'
// Vercel 함수 자체 실행 제한 시간을 넘기지 않도록, 업스트림 응답을 무한정 기다리지 않는다.
const UPSTREAM_TIMEOUT_MS = 8000

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  try {
    const serviceKey = process.env.SUMMER_SHELTER_API_KEY
    if (!serviceKey) {
      res.status(500)
      res.json({ error: '무더위쉼터 서비스키(SUMMER_SHELTER_API_KEY)가 서버에 설정되어 있지 않습니다.' })
      return
    }

    const pageNo = firstValue(req.query.pageNo) ?? '1'
    const numOfRows = firstValue(req.query.numOfRows) ?? '1000'

    const params = new URLSearchParams({
      serviceKey,
      returnType: 'json',
      pageNo,
      numOfRows,
    })

    const upstream = await fetch(`${SUMMER_API_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    const body = await upstream.text()

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    res.send(body)
  } catch (err) {
    res.status(502)
    res.json({
      error: `무더위쉼터 프록시 호출 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
