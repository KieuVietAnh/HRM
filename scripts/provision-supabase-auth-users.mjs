import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.HR_ADMIN_EMAIL || 'admin@company.local'
const adminPassword = process.env.HR_ADMIN_PASSWORD || '123456'

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const listAuthUsers = async () => {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...(data.users || []))
    if (!data.users || data.users.length < 1000) break
  }
  return users
}

const { data: profiles, error: profilesError } = await supabase
  .from('users')
  .select('id, employee_id, email, password, role, auth_user_id')
  .order('created_at')
if (profilesError) throw profilesError

let adminProfile = profiles.find(profile => profile.role === 'admin')
if (!adminProfile) {
  const { data, error } = await supabase.from('users').insert({
    employee_id: 'ADMIN',
    username: 'admin',
    email: adminEmail,
    name: 'Quản trị viên',
    role: 'admin',
    employment_status: 'Chính thức',
    department: 'Nhân sự',
    position: 'Admin'
  }).select('id, employee_id, email, password, role, auth_user_id').single()
  if (error) throw error
  adminProfile = data
  profiles.push(data)
}

const authUsers = await listAuthUsers()
const authByEmail = new Map(
  authUsers.filter(user => user.email).map(user => [user.email.toLowerCase(), user])
)
let created = 0
let linked = 0

for (const profile of profiles) {
  if (profile.auth_user_id) continue

  const generatedEmail = `${String(profile.employee_id || profile.id).toLowerCase()}@employees.speego.local`
  const email = String(profile.email || generatedEmail).trim().toLowerCase()
  const password = profile.role === 'admin'
    ? adminPassword
    : String(profile.password || '123456')
  let authUser = authByEmail.get(email)

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { hr_profile_id: profile.id }
    })
    if (error) throw new Error(`${email}: ${error.message}`)
    authUser = data.user
    authByEmail.set(email, authUser)
    created += 1
  }

  const patch = { auth_user_id: authUser.id }
  if (!profile.email) patch.email = email
  const { error: updateError } = await supabase
    .from('users')
    .update(patch)
    .eq('id', profile.id)
  if (updateError) throw new Error(`${email}: ${updateError.message}`)
  linked += 1
}

console.log(JSON.stringify({ created, linked, totalProfiles: profiles.length, adminEmail }))
