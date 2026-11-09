import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { mapUserToApp } from '../src/utils/helpers.js'

const envContent = fs.readFileSync('.env.local', 'utf8')
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`))
  return m ? m[1] : null
}
const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'))

async function run() {
  await supabase.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })
  const { data } = await supabase.from('users').select('*').order('created_at')
  const mapped = data.map(u => ({ ...mapUserToApp(u), id: u.id }))
  console.log(`Total employees in DB: ${mapped.length}`)
  mapped.forEach((u, i) => {
    console.log(`${String(i + 1).padStart(2, ' ')}. [${u.employeeId || 'NO_CODE'}] ${u.ho_va_ten.padEnd(25, ' ')} | Bộ phận: ${(u.bo_phan || '').padEnd(15, ' ')} | Chi nhánh: ${u.chi_nhanh || ''}`)
  })
}
run().catch(console.error)
