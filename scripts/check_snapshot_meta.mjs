import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'))

async function run() {
  await supabase.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })
  const { data } = await supabase.from('hr_records').select('id, data').eq('id', 'attendanceMonthSummaries::2026-08').single()
  console.log('generatedAt:', data.data?.generatedAt)
  console.log('sourceLogCount:', data.data?.sourceLogCount)
  console.log('employeeCount:', data.data?.employeeCount)
}
run().catch(console.error)
