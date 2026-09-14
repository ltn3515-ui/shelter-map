import { supabase } from '../lib/supabase'
import type { Shelter } from './shelters'

export const SHELTER_REPORT_TYPES = ['운영 종료', '운영시간 오류', '주소 오류', '시설 이용 불가', '기타'] as const
export type ShelterReportType = (typeof SHELTER_REPORT_TYPES)[number]

export async function reportShelterIssue(
  shelter: Shelter,
  reportType: ShelterReportType,
  message?: string,
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase가 설정되지 않았습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 확인하세요.')
  }

  const { error } = await supabase.from('shelter_reports').insert({
    shelter_id: shelter.id,
    shelter_name: shelter.name,
    shelter_type: shelter.type,
    report_type: reportType,
    message: message?.trim() || null,
    latitude: shelter.latitude,
    longitude: shelter.longitude,
  })

  if (error) throw error
}
