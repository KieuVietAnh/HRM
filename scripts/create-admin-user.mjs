/**
 * Tạo / reset tài khoản quản trị admin@company.local (mật khẩu 123456).
 *
 * Cần:
 *   SUPABASE_URL (hoặc VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Chạy:
 *   node --env-file=.env scripts/create-admin-user.mjs
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  if (!fs.existsSync(path)) return {}
  const out = {}
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

const fileEnv = { ...loadEnv('.env'), ...loadEnv('.env.local') }
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = (
  process.env.HR_ADMIN_EMAIL ||
  fileEnv.HR_ADMIN_EMAIL ||
  'admin@company.local'
).trim().toLowerCase()
const adminPassword =
  process.env.HR_ADMIN_PASSWORD || fileEnv.HR_ADMIN_PASSWORD || '123456'

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  /YOUR_|PLACEHOLDER|xxxx/i.test(`${supabaseUrl}${serviceRoleKey}`)
) {
  console.error(
    'Thiếu SUPABASE_URL / VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const listAuthUsers = async () => {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    })
    if (error) throw error
    users.push(...(data.users || []))
    if (!data.users || data.users.length < 1000) break
  }
  return users
}

const authUsers = await listAuthUsers()
let authUser = authUsers.find(
  user => String(user.email || '').toLowerCase() === adminEmail
)

if (authUser) {
  const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
    password: adminPassword,
    email_confirm: true
  })
  if (error) throw error
  authUser = data.user
  console.log(`Updated Auth password for ${adminEmail}`)
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { role: 'admin' }
  })
  if (error) throw error
  authUser = data.user
  console.log(`Created Auth user ${adminEmail}`)
}

const { data: existingProfiles, error: profileLookupError } = await supabase
  .from('users')
  .select('id, email, role, auth_user_id')
  .or(`email.eq.${adminEmail},role.eq.admin`)

if (profileLookupError) throw profileLookupError

let profile =
  (existingProfiles || []).find(
    row => String(row.email || '').toLowerCase() === adminEmail
  ) ||
  (existingProfiles || []).find(row => row.role === 'admin') ||
  null

if (!profile) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      employee_id: 'NV0001',
      username: 'admin',
      email: adminEmail,
      name: 'Quản trị viên',
      role: 'admin',
      employment_status: 'Chính thức',
      department: 'Nhân sự',
      position: 'Admin',
      auth_user_id: authUser.id,
      password: adminPassword
    })
    .select('id, email, role, auth_user_id')
    .single()
  if (error) throw error
  profile = data
  console.log(`Created users profile ${profile.id}`)
} else {
  const { data, error } = await supabase
    .from('users')
    .update({
      email: adminEmail,
      role: 'admin',
      auth_user_id: authUser.id,
      password: adminPassword,
      username: profile.username || 'admin'
    })
    .eq('id', profile.id)
    .select('id, email, role, auth_user_id')
    .single()
  if (error) throw error
  profile = data
  console.log(`Linked users profile ${profile.id}`)
}

console.log(
  JSON.stringify(
    {
      email: adminEmail,
      password: adminPassword,
      authUserId: authUser.id,
      profileId: profile.id,
      role: profile.role
    },
    null,
    2
  )
)
