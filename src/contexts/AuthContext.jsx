import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { mapUserToApp } from '../utils/helpers'

const AuthContext = createContext(null)
const LOCAL_SESSION_KEY = 'hrmspeego.accountSession'
const INVALID_LOGIN = 'Tên tài khoản hoặc mật khẩu không chính xác.'

const readLocalSession = () => {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

const writeLocalSession = profile => {
  if (!profile?.id) {
    localStorage.removeItem(LOCAL_SESSION_KEY)
    return
  }
  const { password, ...safe } = profile
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(safe))
}

const loadProfile = async (authUser) => {
  if (!authUser?.id) return null
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single()
  if (error) throw error
  return { ...mapUserToApp(data), id: data.id, authUserId: authUser.id, email: data.email || authUser.email || '' }
}

const profileFromAccount = row => {
  if (!row?.id) return null
  return {
    ...mapUserToApp(row),
    id: row.id,
    email: row.email || ''
  }
}

const refreshAccountProfile = async storedProfile => {
  if (!storedProfile?.id) return storedProfile
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', storedProfile.id)
    .maybeSingle()
  if (error) throw error
  const profile = profileFromAccount(data)
  return profile || storedProfile
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const syncSession = async (session) => {
      try {
        if (session?.user) {
          const profile = await loadProfile(session.user)
          if (!active) return
          writeLocalSession(null)
          setUser(profile)
          return
        }
        const storedProfile = readLocalSession()
        if (storedProfile && active) {
          try {
            const currentProfile = await refreshAccountProfile(storedProfile)
            if (!active) return
            writeLocalSession(currentProfile)
            setUser(currentProfile)
          } catch (error) {
            console.warn('KhÃ´ng lÃ m má»›i Ä‘Æ°á»£c há»“ sÆ¡ tÃ i khoáº£n, dÃ¹ng dá»¯ liá»‡u Ä‘Ã£ lÆ°u:', error)
            if (active) setUser(storedProfile)
          }
        } else if (active) {
          setUser(storedProfile)
        }
      } catch (error) {
        console.error('Không tải được hồ sơ đăng nhập:', error)
        if (error?.code === 'PGRST116') {
          await supabase.auth.signOut().catch(() => {})
        }
        if (active) setUser(readLocalSession())
      } finally {
        if (active) setLoading(false)
      }
    }
    supabase.auth.getSession().then(({ data }) => syncSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => syncSession(session), 0)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loginWithSupabaseAuth = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const profile = await loadProfile(data.user)
    writeLocalSession(null)
    setUser(profile)
    return profile
  }

  const login = async (account, password) => {
    const cleanAccount = String(account || '').trim()
    const cleanPassword = String(password || '').trim()
    if (!cleanAccount || !cleanPassword) {
      throw new Error(INVALID_LOGIN)
    }

    const { data, error } = await supabase.rpc('login_with_account', {
      p_account: cleanAccount,
      p_password: cleanPassword
    })

    if (error) {
      const message = String(error.message || '')
      if (/login_with_account|schema cache|could not find the function/i.test(message)) {
        throw new Error('Chưa bật hàm đăng nhập trên database. Hãy chạy file supabase/migrations/20261001160000_login_with_account.sql trong SQL Editor.')
      }
      if (cleanAccount.includes('@')) return loginWithSupabaseAuth(cleanAccount, cleanPassword)
      throw new Error(INVALID_LOGIN)
    }

    if (data?.password_matched) {
      const email = String(data.email || '').trim()
      const hasLinkedAuthAccount = Boolean(data.auth_user_id)
      if (email && hasLinkedAuthAccount) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password: cleanPassword
        })
        if (!authError) {
          const { data: authData } = await supabase.auth.getUser()
          try {
            const profile = await loadProfile(authData.user)
            writeLocalSession(null)
            setUser(profile)
            return profile
          } catch (profileError) {
            console.error('Không tải được hồ sơ Auth, dùng hồ sơ tài khoản:', profileError)
          }
        }
      }
      await supabase.auth.signOut().catch(() => {})
      const profile = profileFromAccount(data)
      if (!profile) throw new Error(INVALID_LOGIN)
      writeLocalSession(profile)
      setUser(profile)
      return profile
    }

    const email = String(data?.email || (cleanAccount.includes('@') ? cleanAccount : '')).trim()
    if (!email) throw new Error(INVALID_LOGIN)
    try {
      return await loginWithSupabaseAuth(email, cleanPassword)
    } catch {
      throw new Error(INVALID_LOGIN)
    }
  }

  const logout = async () => {
    writeLocalSession(null)
    await supabase.auth.signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
