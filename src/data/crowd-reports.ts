import { supabase } from '../lib/supabase'
import type { Shelter } from './shelters'

export const CROWD_STATUS_OPTIONS = ['여유', '보통', '혼잡'] as const
export type CrowdStatus = (typeof CROWD_STATUS_OPTIONS)[number]

export async function reportCrowdStatus(
  shelter: Shelter,
  status: CrowdStatus,
): Promise<void> {
  if (!supabase) {
    throw new Error(
      'Supabase가 설정되지 않았습니다. .env의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 확인하세요.',
    )
  }

  const { error } = await supabase.from('crowd_reports').insert({
    shelter_name: shelter.name,
    shelter_type: shelter.type,
    status,
  })

  if (error) throw error
}
