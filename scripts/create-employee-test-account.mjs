import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const loadEnv = path => {
  if (!fs.existsSync(path)) return {}
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^["']|["']$/g, '').trim()]))
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...process.env }
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = env.VITE_SUPABASE_ANON_KEY
if (!url || !serviceKey || !anonKey) {
  throw new Error('Cần SUPABASE_SECRET_KEY (hoặc SUPABASE_SERVICE_ROLE_KEY), VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong môi trường hoặc .env.local')
}

const email = String(env.HR_TEST_EMPLOYEE_EMAIL || 'test-cham-cong-online@employees.speego.local').trim().toLowerCase()
const password = String(env.HR_TEST_EMPLOYEE_PASSWORD || randomBytes(18).toString('base64url'))
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const employee = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

let authUser = null
for (let page = 1; !authUser; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  authUser = (data.users || []).find(user => String(user.email || '').toLowerCase() === email) || null
  if ((data.users || []).length < 1000) break
}

const { data: existingProfile, error: lookupError } = await admin.from('users')
  .select('id, name, role, auth_user_id')
  .eq('email', email)
  .maybeSingle()
if (lookupError) throw lookupError
if (existingProfile && (existingProfile.role !== 'user' || existingProfile.name !== 'Nhân viên Test Chấm Công Online')) {
  throw new Error(`Email ${email} đã thuộc hồ sơ khác; không thay đổi tài khoản đó.`)
}
if (existingProfile?.auth_user_id && authUser && existingProfile.auth_user_id !== authUser.id) {
  throw new Error('Hồ sơ đang liên kết tài khoản Auth khác; không thay đổi.')
}

let createdAuth = false
if (authUser) {
  const { error } = await admin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true })
  if (error) throw error
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { purpose: 'hrmspeego-employee-test' }
  })
  if (error) throw error
  authUser = data.user
  createdAuth = true
}

try {
  if (existingProfile) {
    const { error } = await admin.from('users').update({ auth_user_id: authUser.id })
      .eq('id', existingProfile.id)
    if (error) throw error
  } else {
    const { error } = await admin.from('users').insert({
      employee_id: 'TEST-ONLINE-ATTENDANCE',
      username: 'test-online-attendance',
      email,
      name: 'Nhân viên Test Chấm Công Online',
      role: 'user',
      employment_status: 'Chính thức',
      department: 'Kiểm thử',
      position: 'Nhân viên thử nghiệm',
      shift: 'Ca Hành chính',
      auth_user_id: authUser.id
    })
    if (error) throw error
  }
} catch (error) {
  if (createdAuth) await admin.auth.admin.deleteUser(authUser.id)
  throw error
}

const login = await employee.auth.signInWithPassword({ email, password })
if (login.error) throw new Error(`Đã tạo tài khoản nhưng đăng nhập thất bại: ${login.error.message}`)
const { data: profile, error: profileError } = await employee.from('users')
  .select('id, name, role')
  .eq('auth_user_id', login.data.user.id)
  .single()
if (profileError || profile?.role !== 'user') {
  throw new Error(`Đăng nhập được nhưng không tải được hồ sơ nhân viên: ${profileError?.message || 'sai vai trò'}`)
}
const today = await employee.rpc('get_online_attendance_today')
if (today.error) throw new Error(`Đăng nhập được nhưng trang chấm công lỗi: ${today.error.message}`)

let onlineAttendancePunch = 'not-run'
if (env.HR_TEST_PUNCH_SMOKE === '1') {
  if (today.data?.record) throw new Error('Tài khoản test đã có chấm công hôm nay; không ghi đè bản ghi.')
  const date = String(today.data?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('API không trả ngày chấm công hợp lệ.')
  const recordId = `attendanceLogs::online_${profile.id}_${date.replace(/-/g, '')}`
  try {
    const checkIn = await employee.rpc('employee_online_check_in')
    if (checkIn.error) throw checkIn.error
    const checkOut = await employee.rpc('employee_online_check_out')
    if (checkOut.error) throw checkOut.error
    const verified = await employee.rpc('get_online_attendance_today')
    if (verified.error || !verified.data?.record?.checkIn || !verified.data?.record?.checkOut) {
      throw new Error(verified.error?.message || 'Không đọc lại được cặp Check-in/Check-out.')
    }
    onlineAttendancePunch = 'ok'
  } finally {
    const { error: cleanupError } = await admin.from('hr_records').delete().eq('id', recordId)
    if (cleanupError) throw new Error(`Không dọn được bản ghi chấm công thử: ${cleanupError.message}`)
  }
}
await employee.auth.signOut()

console.log(JSON.stringify({ email, password, profileName: profile.name, onlineAttendanceRead: 'ok', onlineAttendancePunch }, null, 2))
