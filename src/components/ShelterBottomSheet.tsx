import { useState } from 'react'
import { CROWD_STATUS_OPTIONS, reportCrowdStatus, type CrowdStatus } from '../data/crowd-reports'
import { reportShelterIssue, SHELTER_REPORT_TYPES, type ShelterReportType } from '../data/shelter-reports'
import { getShelterOpenStatus, type Shelter } from '../data/shelters'
import { buildShareUrl, copyToClipboard } from '../lib/share'
import { formatDistanceMeters } from '../utils/distance'

type Props = {
  shelter: Shelter | null
  distanceMeters: number | null
  onClose: () => void
}

function formatHours(shelter: Shelter): string {
  const h = shelter.operatingHours?.weekday
  if (!h) return '운영시간 확인 필요'
  const fmt = (v: string) => `${v.slice(0, 2)}:${v.slice(2, 4)}`
  return `${fmt(h.start)} ~ ${h.end === '2400' ? '24:00' : fmt(h.end)}`
}

export default function ShelterBottomSheet({ shelter, distanceMeters, onClose }: Props) {
  const [feedback, setFeedback] = useState('')
  if (!shelter) return null

  const status = getShelterOpenStatus(shelter.operatingHours)
  const directions = `https://map.kakao.com/link/to/${encodeURIComponent(shelter.name)},${shelter.latitude},${shelter.longitude}`

  async function submitCrowd(crowd: CrowdStatus) {
    try {
      setFeedback('제보 중...')
      await reportCrowdStatus(shelter!, crowd)
      setFeedback(`혼잡도 “${crowd}” 제보가 접수되었습니다.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '제보 중 오류가 발생했습니다.')
    }
  }

  async function submitIssue(reportType: ShelterReportType) {
    try {
      setFeedback('신고 중...')
      await reportShelterIssue(shelter!, reportType)
      setFeedback(`“${reportType}” 신고가 접수되었습니다.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '신고 중 오류가 발생했습니다.')
    }
  }

  return (
    <section className="absolute bottom-0 left-0 right-0 z-30 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl" aria-label="쉼터 상세정보">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full px-3 py-2 text-sm text-gray-500">닫기</button>
      <div className="pr-14">
        <p className="text-xs font-bold text-blue-600">{shelter.type === 'summer' ? '무더위쉼터' : '한파쉼터'}</p>
        <h2 className="mt-1 text-xl font-black">{shelter.name}</h2>
        <p className={`mt-2 text-sm font-bold ${status === 'open' ? 'text-green-600' : status === 'closed' ? 'text-red-600' : 'text-amber-600'}`}>
          {status === 'open' ? '● 현재 운영 중' : status === 'closed' ? '● 현재 운영 종료' : '⚠ 운영시간 확인 필요'}
        </p>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        {distanceMeters != null && <p>📍 현재 위치에서 {formatDistanceMeters(distanceMeters)}</p>}
        <p>🕒 {formatHours(shelter)}</p>
        {shelter.address && <p>🏠 {shelter.address}</p>}
        {shelter.capacity && <p>👥 이용가능 {shelter.capacity}명</p>}
        {shelter.updatedAt && <p className="text-xs text-gray-400">공공데이터 수정일 {shelter.updatedAt}</p>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <a href={directions} target="_blank" rel="noreferrer" className="rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-bold text-white">길찾기</a>
        <button type="button" onClick={async () => { const ok = await copyToClipboard(buildShareUrl(shelter.id)); window.alert(ok ? '링크를 복사했습니다.' : '링크 복사에 실패했습니다.') }} className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">공유</button>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-700">현재 혼잡도 제보</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CROWD_STATUS_OPTIONS.map((option) => (
            <button key={option} type="button" onClick={() => submitCrowd(option)} className="rounded-lg bg-gray-100 px-2 py-2 text-xs font-semibold">{option}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-gray-700">정보가 틀렸나요?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SHELTER_REPORT_TYPES.map((reportType) => (
            <button key={reportType} type="button" onClick={() => submitIssue(reportType)} className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600">{reportType}</button>
          ))}
        </div>
      </div>

      {feedback && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{feedback}</p>}
      <p className="mt-3 text-center text-[11px] text-gray-400">공공데이터와 실제 운영 상황이 다를 수 있으니 방문 전 확인하세요.</p>
    </section>
  )
}
