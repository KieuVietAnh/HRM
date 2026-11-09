import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildAttendanceSummary } from '../src/utils/attendanceSummary.js'
import { buildAttendanceWorkbook } from '../src/utils/attendanceExcel.js'
import { mapUserToApp } from '../src/utils/helpers.js'

const parseEnv = (text) => Object.fromEntries(
  text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
    })
)

const [, , month = '2026-07', outputArg = 'BANG_CONG_THANG_7_2026_TEST.xlsx'] = process.argv
const envPath = path.resolve('../.env (1)')
const env = parseEnv(await fs.readFile(envPath, 'utf8'))
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Thiếu VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY trong file môi trường.')

const supabase = createClient(url, key)
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

const rows = buildAttendanceSummary({
  attendanceLogs,
  employees,
  month,
  attendanceAdjustments,
  manualWorkdays
})
const templateData = await fs.readFile(path.resolve('public/templates/attendance-report-template.xlsx'))
const workbook = await buildAttendanceWorkbook(templateData, rows, month)
const output = path.resolve(outputArg)
await workbook.xlsx.writeFile(output)
console.log(JSON.stringify({ output, employeeCount: rows.length, attendanceLogCount: attendanceLogs.length }))
