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
  const { data } = await supabase.from('hr_records').select('id, data').eq('collection', 'attendanceLogs')
  
  const empIdCounts = new Map()
  data.forEach(item => {
    const d = item.data || {}
    const empId = d.employeeId || 'NO_EMP_ID'
    const name = d.employeeName || d.machineName || d.tenTheoMayChamCong || 'NO_NAME'
    const code = d.employeeCode || d.sourceEmployeeCode || 'NO_CODE'
    const key = `${empId} | ${code} | ${name}`
    empIdCounts.set(key, (empIdCounts.get(key) || 0) + 1)
  })

  console.log(`Summary of 957 logs by employee:`)
  for (const [key, count] of empIdCounts.entries()) {
    console.log(`${key} => ${count} logs`)
  }
}
run().catch(console.error)
