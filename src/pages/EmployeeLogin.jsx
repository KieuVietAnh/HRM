import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultLandingPath } from '../utils/staffAccess'
import './EmployeeLogin.css'

function EmployeeLogin() {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const profile = await login(account.trim(), password)
      const destination = getDefaultLandingPath(profile)
      if (!profile || destination === '/login') {
        await logout()
        setError('Tài khoản chưa được cấp quyền sử dụng hệ thống.')
        return
      }
      const requestedPath = location.state?.from?.pathname
      navigate(requestedPath === '/bang-cong-preview' ? requestedPath : destination, { replace: true })
    } catch (loginError) {
      console.error('Employee login error:', loginError)
      setError('Tên tài khoản hoặc mật khẩu không chính xác')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="employee-login">
      <section className="employee-login__card">
        <img src="/speego-logo.png" alt="SpeeGo Logistics" />
        <h1>Đăng nhập nhân viên</h1>
        <p>Đăng nhập để xem Bảng công của bạn</p>
        {error && <div className="employee-login__error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label><span>Tên tài khoản</span><input type="text" value={account} onChange={event => setAccount(event.target.value)} placeholder="Tên đăng nhập" autoComplete="username" required /></label>
          <label><span>Mật khẩu</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu" autoComplete="current-password" required /></label>
          <button type="submit" disabled={loading}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
        <Link to="/login">Đăng nhập quản trị</Link>
      </section>
    </main>
  )
}

export default EmployeeLogin
