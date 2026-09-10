// 재난안전데이터공유플랫폼(safetydata.go.kr) 쉼터 API를 서버에서 대신 호출하는 공용 로직.
// 브라우저가 safetydata.go.kr을 직접 호출하면 CORS로 막히고, 서비스키도 노출되므로
// Vercel Serverless Function을 통해서만 호출한다. (api/shelters/*.ts에서 사용)

export interface ProxyConfig {
  apiUrl: string
  serviceKeyEnvVar: string
  label: string
}

export interface ProxyResult {
  status: number
  contentType: string
  body: string
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function proxySafetyDataRequest(
  query: Record<string, string | string[] | undefined>,
  config: ProxyConfig,
): Promise<ProxyResult> {
  const serviceKey = process.env[config.serviceKeyEnvVar]
  if (!serviceKey) {
    return {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: `${config.label} 서비스키(${config.serviceKeyEnvVar})가 서버에 설정되어 있지 않습니다.`,
      }),
    }
  }

  const pageNo = firstValue(query.pageNo) ?? '1'
  const numOfRows = firstValue(query.numOfRows) ?? '1000'

  const params = new URLSearchParams({
    serviceKey,
    returnType: 'json',
    pageNo,
    numOfRows,
  })

  const response = await fetch(`${config.apiUrl}?${params.toString()}`)
  const body = await response.text()

  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/json',
    body,
  }
}
