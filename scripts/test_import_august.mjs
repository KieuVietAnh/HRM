import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { matchAttendanceEmployee, buildSourceEmployeeKey } from '../src/utils/attendanceMatching.js'
import { mapUserToApp } from '../src/utils/helpers.js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}

const url = getEnv('VITE_SUPABASE_URL')
const key = getEnv('VITE_SUPABASE_ANON_KEY')

const supabase = createClient(url, key)

async function test() {
  console.log('Logging in as admin...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@company.local',
    password: '123456'
  })
  if (authErr) {
    console.error('Login error:', authErr)
    return
  }
  console.log('Logged in!')

  const { data: rawUsers, error } = await supabase.from('users').select('*')
  if (error) {
    console.error('Error fetching users:', error)
    return
  }
  const employees = rawUsers.map(u => ({ ...mapUserToApp(u), id: u.id }))
  console.log(`Loaded ${employees.length} employees from DB`)
  console.log('Sample mapped employees:', employees.slice(0, 5).map(e => ({ id: e.id, employeeId: e.employeeId, ho_va_ten: e.ho_va_ten, branch: e.chi_nhanh })))

  const fileBuffer = fs.readFileSync('../TONG_CONG_THANG_8.xlsx')
  const wb = XLSX.read(fileBuffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })

  let headerRowIdx = -1
  let headers = []
  for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
    const row = jsonData[i] || []
    const lower = row.map(c => String(c || '').toLowerCase().trim())
    const rowStr = lower.join(' ')
    if (
      (rowStr.includes('mã nv') && rowStr.includes('ngày')) ||
      (rowStr.includes('ma nv') && rowStr.includes('ngay')) ||
      (rowStr.includes('họ tên') || rowStr.includes('tên nv')) ||
      (rowStr.includes('mã') && rowStr.includes('ngày')) ||
      lower.some(h => /l[aầ]n\s*\d+/i.test(h))
    ) {
      headerRowIdx = i
      headers = lower
      break
    }
  }

  const idxOf = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)))
  const codeIdx = idxOf('mã n', 'ma n', 'mã nv', 'ma nv', 'employee')
  const nameIdx = idxOf('tên nhân', 'ten nhan', 'họ tên', 'ho ten', 'tên nv')

  const excelEmployees = new Map()
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i]
    if (!row || row.length === 0) continue
    const empCode = codeIdx >= 0 ? String(row[codeIdx] || '').trim() : ''
    const empName = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : ''
    if (!empCode && !empName) continue
    const key = `${empCode}__${empName}`
    if (!excelEmployees.has(key)) {
      excelEmployees.set(key, { empCode, empName, count: 0 })
    }
    excelEmployees.get(key).count++
  }

  console.log(`\nDistinct employees in Excel: ${excelEmployees.size}`)
  console.log('--- MATCHING RESULTS ---')

  let matchedCount = 0
  let unmatchedCount = 0

  for (const [key, item] of excelEmployees.entries()) {
    const match = matchAttendanceEmployee(item.empCode, item.empName, employees, 'HCM')
    const targetEmp = match.employee
    if (targetEmp) {
      matchedCount++
      console.log(`✅ [MATCHED] Excel: [${item.empCode}] "${item.empName}" => DB: [${targetEmp.employeeId}] "${targetEmp.ho_va_ten}" (score: ${match.confidence}, method: ${match.method})`)
    } else {
      unmatchedCount++
      console.log(`❌ [UNMATCHED] Excel: [${item.empCode}] "${item.empName}" => Suggest: [${match.suggestedEmployee?.employeeId || 'N/A'}] "${match.suggestedEmployee?.ho_va_ten || 'None'}" (status: ${match.status}, conf: ${match.confidence}, gap: ${match.gap})`)
    }
  }

  console.log(`\n========================================`)
  console.log(`Total: ${excelEmployees.size} | Matched: ${matchedCount} | Unmatched: ${unmatchedCount}`)
  console.log(`========================================`)
}

test().catch(console.error)
