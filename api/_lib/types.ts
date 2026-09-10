// Vercel Node 런타임의 요청/응답 객체 중 이 프록시에서 실제로 쓰는 부분만 최소로 정의한다.
// (@vercel/node 전체 패키지는 취약한 전이 의존성을 끌어와 타입만 위해 설치하지 않는다.)

export interface ProxyRequest {
  query: Record<string, string | string[] | undefined>
}

export interface ProxyResponse {
  status(code: number): ProxyResponse
  setHeader(name: string, value: string): ProxyResponse
  send(body: string): void
  json(body: unknown): void
}
