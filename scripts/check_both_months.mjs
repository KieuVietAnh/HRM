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
  const { data } = await supabase.from('hr_records').select('id, data').in('id', [
    'attendanceMonthSummaries::2026-08',
    'attendanceMonthSummaries::2026-09'
  ])
  data.forEach(d => {
    console.log('ID:', d.id)
    console.log('GeneratedAt:', d.data?.generatedAt)
    console.log('SourceLogCount:', d.data?.sourceLogCount)
    console.log('EmployeeCount:', d.data?.employeeCount)
    console.log('Rows sample:', d.data?.rows?.slice(0, 2))
  })
}
run().catch(console.error)
