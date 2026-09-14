# 잠깐 — 전국 폭염·한파 쉼터 지도

현재 위치와 기상 상태를 기준으로 가까운 무더위쉼터·한파쉼터를 빠르게 찾을 수 있도록 만든 모바일 우선 안전 지도입니다.

## 주요 기능

- GPS 고정밀 위치 확인 및 이동 추적
- 현재 위치 파란 마커와 정확도(오차 m) 표시
- 반경 3km 주변 쉼터 탐색
- 쉼터명/주소 검색, 무더위·한파 필터
- 거리순 가까운 쉼터 리스트
- 모바일 상세 바텀시트
- 운영시간 기반 운영 상태 표시
- 카카오맵 길찾기 / 공유 링크
- 현재 체감온도 기반 폭염·한파 쉼터 자동 추천
- Supabase 기반 혼잡도 및 정보 오류 제보
- 큰 글자 모드
- PWA 설치 및 오프라인 상태 안내

## 기술 스택

- React 19 + TypeScript + Vite
- Tailwind CSS
- Kakao Maps JavaScript SDK
- 기상청 단기예보 API
- 재난안전데이터공유플랫폼 쉼터 API
- Supabase
- vite-plugin-pwa
- Vercel

## 환경변수

`.env` 또는 Vercel Environment Variables에 다음 값을 설정합니다.

```env
VITE_KAKAO_MAP_KEY=카카오_JavaScript_키
VITE_KMA_API_KEY=기상청_서비스키
VITE_SUPABASE_URL=Supabase_Project_URL
VITE_SUPABASE_ANON_KEY=Supabase_Anon_Key
SAFETY_DATA_API_KEY=재난안전데이터_서비스키
```

실제 서버 함수에서 사용하는 쉼터 API 키 이름은 `api/` 구현과 `.env.example`을 함께 확인하세요.

## Supabase 설정

`supabase/migrations/001_shelter_reports.sql`을 Supabase SQL Editor에서 실행하면 `shelter_reports`, `crowd_reports` 테이블과 RLS 정책이 생성됩니다.

## 개발 실행

```bash
npm install
npm run dev
```

빌드 확인:

```bash
npm run build
npm run lint
```

## 단계별 개발 브랜치

- `stage-1-gps` — GPS/현재 위치 강화
- `stage-2-nearby-search` — 주변 쉼터 검색 및 거리순 리스트
- `stage-3-shelter-detail` — 상세 바텀시트
- `stage-4-weather-report` — 날씨 자동추천 및 Supabase 제보
- `stage-5-pwa-release` — PWA/설치/릴리스 준비

최종 테스트는 `stage-5-pwa-release` 브랜치의 Vercel Preview에서 진행하는 것을 권장합니다.

## 스마트폰 최종 테스트 체크

- 위치 권한 허용/거부/재시도
- 실제 위치 이동 시 파란 마커 갱신
- GPS 정확도 및 주변 3km 쉼터 확인
- 무더위/한파 자동 필터
- 검색, 거리순 리스트, 상세 바텀시트
- 길찾기와 공유
- 혼잡도/정보 오류 제보
- 홈 화면 설치(PWA)
- Wi-Fi ↔ LTE/5G 전환 및 오프라인 안내

> 쉼터 공공데이터와 실제 운영 상황이 다를 수 있으므로 방문 전 운영 여부를 추가 확인해야 합니다.
