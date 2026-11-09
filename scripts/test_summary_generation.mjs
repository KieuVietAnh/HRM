import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { buildAttendanceSummary, serializeAttendanceSummaryRows } from '../src/utils/attendanceSummary.js'
import { mapUserToApp } from '../src/utils/helpers.js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'))

async function testSummary() {
  await supabase.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })
  
  // 1. Fetch employees
  const { data: rawUsers } = await supabase.from('users').select('*')
  const employees = rawUsers.map(u => ({ ...mapUserToApp(u), id: u.id }))

  // 2. Fetch logs for 2026-08
  const { data: rawLogs } = await supabase.from('hr_records')
    .select('id, data')
    .eq('collection', 'attendanceLogs')
    .gte('data->>date', '2026-08-01')
    .lte('data->>date', '2026-08-31')

  const logs = rawLogs.map(r => ({ ...r.data, id: r.id.replace('attendanceLogs::', '') }))
  console.log(`Loaded ${logs.length} logs for 2026-08`)

  // 3. Run buildAttendanceSummary
  const summaryRows = buildAttendanceSummary({
    attendanceLogs: logs,
    employees,
    month: '2026-08'
  })

  console.log(`Generated summary for ${summaryRows.length} employees:`)
  let withWorkdays = 0
  summaryRows.forEach((r, i) => {
    if (r.workdays > 0) withWorkdays++
    console.log(`${String(i + 1).padStart(2, ' ')}. [${r.employeeCode || 'NO_CODE'}] ${r.employeeName.padEnd(25, ' ')} | Công: ${String(r.workdays).padStart(5, ' ')} | Muộn: ${r.lateCount} (${r.lateMinutes}p) | Giờ: ${r.totalHours.toFixed(1)}`)
  })
  console.log(`\nEmployees with workdays > 0: ${withWorkdays} / ${summaryRows.length}`)
}

testSummary().catch(console.error)
