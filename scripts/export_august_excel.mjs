import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { buildAttendanceSummary } from '../src/utils/attendanceSummary.js'
import { buildAttendanceWorkbook } from '../src/utils/attendanceExcel.js'
import { mapUserToApp } from '../src/utils/helpers.js'

const envContent = await fs.readFile('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const url = getEnv('VITE_SUPABASE_URL')
const key = getEnv('VITE_SUPABASE_ANON_KEY')

const supabase = createClient(url, key)

async function main() {
  console.log('Logging in as admin...')
  await supabase.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })

  const month = '2026-08'
  const [{ data: users, error: usersError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('hr_records').select('id, collection, data').in('collection', [
      'attendanceLogs',
      'attendanceAdjustments',
      'manualWorkdays'
    ])
  ])
  if (usersError) throw usersError
  if (recordsError) throw recordsError

  const collection = (name) => Object.fromEntries(
    (records || [])
      .filter(row => row.collection === name)
      .map(row => [row.id.replace(new RegExp(`^${name}::`), ''), row.data || {}])
  )
  const employees = (users || []).map(user => ({
    ...mapUserToApp(user),
    id: user.id,
    name: user.name || ''
  }))

  const attendanceLogs = Object.entries(collection('attendanceLogs')).map(([id, value]) => ({
    ...value,
    id
  }))
  const adjustmentRecords = collection('attendanceAdjustments')
  const attendanceAdjustments = adjustmentRecords[month] || {}
  const manualRecords = collection('manualWorkdays')
  const manualWorkdays = {
    ...(manualRecords[month] || {})
  }
  Object.entries(manualRecords).forEach(([id, value]) => {
    const prefix = `${month}__`
    if (id.startsWith(prefix)) manualWorkdays[id.slice(prefix.length)] = value
  })

  console.log(`Building summary for ${month}...`)
  const rows = buildAttendanceSummary({
    attendanceLogs,
    employees,
    month,
    attendanceAdjustments,
    manualWorkdays
  })
  console.log(`Generated ${rows.length} summary rows`)

  const template = await fs.readFile('public/templates/attendance-report-template.xlsx')
  const workbook = await buildAttendanceWorkbook(template, rows, month)
  const outputPath = 'BANG_CONG_THANG_8_2026_TEST.xlsx'
  await workbook.xlsx.writeFile(outputPath)
  console.log(`Successfully wrote ${outputPath}!`)
}

main().catch(console.error)
