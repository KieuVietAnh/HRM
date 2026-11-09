import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'))

async function check() {
  const { data: hrData, error: hrError } = await supabase.from('hr_records').select('id, collection').limit(5)
  console.log('hr_records access:', hrError ? hrError.message : `OK, count: ${hrData.length}`)

  // Try signing in
  const accounts = [
    { email: 'admin@company.local', pass: '123456' },
    { email: 'admin@speego.vn', pass: '123456' },
    { email: 'admin@lumi.vn', pass: '123456' }
  ]
  for (const acc of accounts) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.pass })
    if (error) {
      console.log(`Login failed for ${acc.email}:`, error.message)
    } else {
      console.log(`Login SUCCESS for ${acc.email}! User id:`, data.user.id)
      const { data: uData, error: uErr } = await supabase.from('users').select('*')
      if (uErr) {
        console.log('Users query error:', uErr.message)
      } else {
        console.log(`Users query OK! Total users: ${uData.length}`)
        console.log('Sample users:', uData.slice(0, 10).map(u => ({ id: u.id, employee_id: u.employee_id, employeeId: u.employeeId, name: u.ho_va_ten || u.name, branch: u.chi_nhanh })))
      }
      return uData
    }
  }
}
check().catch(console.error)
