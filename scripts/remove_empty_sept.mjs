import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'))

async function removeEmptySept() {
  await supabase.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })
  const { error } = await supabase.from('hr_records').delete().eq('id', 'attendanceMonthSummaries::2026-09')
  console.log('Removed empty 2026-09 snapshot, error:', error)
}
removeEmptySept().catch(console.error)
