
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Thiếu cấu hình Supabase. Tạo file .env ở root với VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (xem supabase/env.example), rồi restart npm run dev.'
  )
}

const ACCOUNT_SESSION_KEY = 'hrmspeego.accountSession'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers)
      try {
        const raw = localStorage.getItem(ACCOUNT_SESSION_KEY)
        const employeeId = raw ? JSON.parse(raw)?.id : ''
        if (employeeId) headers.set('x-employee-id', employeeId)
      } catch {
        // Ignore a broken local session; the request still goes out.
      }
      return fetch(input, { ...init, headers })
    }
  }
})
