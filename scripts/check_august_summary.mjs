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
  if (!data) {
    console.log('No summary for 2026-08')
    return
  }
  const rows = data.data?.rows || []
  console.log(`Summary 2026-08 has ${rows.length} rows:`)
  rows.forEach((r, i) => {
    console.log(`${String(i+1).padStart(2, ' ')}. Mã: [${r.employeeCode || 'N/A'}] | Tên: ${r.employeeName.padEnd(25, ' ')} | Công: ${r.workdays} | Muộn<30: ${r.lateUnder30Count} | Phạt: ${r.lateUnder30Fine || 0}`)
  })
}
run().catch(console.error)
