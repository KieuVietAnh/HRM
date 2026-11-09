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
  const { data, error } = await supabase.from('hr_records').select('id, data').eq('collection', 'attendanceLogs')
  if (error) {
    console.error('Error:', error)
    return
  }
  console.log(`Total attendance logs in DB: ${data.length}`)
  if (data.length > 0) {
    console.log('Sample log:', JSON.stringify(data[0], null, 2))
    const months = new Set(data.map(d => String(d.data?.date || '').slice(0, 7)))
    console.log('Months present in attendanceLogs:', Array.from(months))
  }

  // Also check attendanceMonthSummaries
  const { data: summaries, error: sumErr } = await supabase.from('hr_records').select('id, data').eq('collection', 'attendanceMonthSummaries')
  if (sumErr) console.error('Summary error:', sumErr)
  else {
    console.log(`Total attendanceMonthSummaries in DB: ${summaries.length}`)
    summaries.forEach(s => console.log('Summary ID:', s.id))
  }
}
run().catch(console.error)
