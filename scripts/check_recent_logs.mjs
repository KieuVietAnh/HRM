import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => { const m = env.match(new RegExp(`${k}=["']?([^"'\r\n]+)`)); return m ? m[1] : null }
const sb = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'))

async function checkTodayLogs() {
  await sb.auth.signInWithPassword({ email: 'admin@company.local', password: '123456' })
  const { data, error } = await sb.from('hr_records')
    .select('id, data')
    .eq('collection', 'attendanceLogs')
    .order('updated_at', { ascending: false })
    .limit(5)

  console.log('RECENT LOGS:', JSON.stringify(data, null, 2))
}
checkTodayLogs().catch(console.error)
