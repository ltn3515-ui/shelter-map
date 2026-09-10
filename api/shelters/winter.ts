import type { ProxyRequest, ProxyResponse } from '../_lib/types'
import { proxySafetyDataRequest } from '../_lib/safetyDataProxy'

const WINTER_API_URL = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-10804'

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  try {
    const { status, contentType, body } = await proxySafetyDataRequest(req.query, {
      apiUrl: WINTER_API_URL,
      serviceKeyEnvVar: 'WINTER_SHELTER_API_KEY',
      label: '한파쉼터',
    })
    res.status(status).setHeader('Content-Type', contentType).send(body)
  } catch (err) {
    res.status(502).json({
      error: `한파쉼터 프록시 호출 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
