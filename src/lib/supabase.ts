import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

if (!url || !publishableKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase 환경변수가 없어요. 프로젝트 루트에 .env.local 파일을 만들고 ' +
    'VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY 값을 채워주세요. (.env.example 참고)'
  )
}

export const supabase = createClient(url ?? '', publishableKey ?? '')
