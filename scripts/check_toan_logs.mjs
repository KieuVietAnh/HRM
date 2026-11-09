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
  const { data } = await supabase.from('hr_records')
    .select('id, data')
    .eq('collection', 'attendanceLogs')
    .eq('data->>employeeId', '43966849-b9a2-4609-96b7-273f7076aebf')
  
  console.log(`Cù Văn Toàn has ${data.length} logs:`)
  data.slice(0, 5).forEach(d => {
    console.log(`Date: ${d.data.date}, Code: ${d.data.employeeCode}, SourceCode: ${d.data.sourceEmployeeCode}, SourceName: ${d.data.sourceEmployeeName}, Name: ${d.data.employeeName}, CongPlus: ${d.data.congPlus}`)
  })
}
run().catch(console.error)
