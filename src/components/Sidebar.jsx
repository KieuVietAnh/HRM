import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isAccountingUser, isCoreStaffUser } from '../utils/staffAccess'

function Sidebar({ open = false, onNavigate = () => {} }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const displayName = user?.ho_va_ten || user?.email || 'Người dùng'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'N'

  const primaryStaffItems = [
    { path: '/approvals', icon: 'fas fa-stamp', label: 'Đề xuất' },
    ...(['admin', 'hr', 'manager'].includes(String(user?.role || '').toLowerCase()) ? [{ path: '/yeu-cau-dieu-chinh-cong', icon: 'fas fa-clock-rotate-left', label: 'Duyệt điều chỉnh công' }] : []),
    { path: '/employees', icon: 'fas fa-users', label: 'Hồ sơ nhân sự' },
    { path: '/giay-to-cong-ty', icon: 'fas fa-folder-open', label: 'Giấy tờ công ty' },
    ...(user?.role === 'admin' ? [] : [{ path: '/cham-cong-online', icon: 'fas fa-camera', label: 'Chấm công online' }]),
    { path: '/lich-su-cham-cong', icon: 'fas fa-clock-rotate-left', label: 'Lịch sử chấm công' },
    { path: '/bang-phat', icon: 'fas fa-file-invoice-dollar', label: 'Bảng phạt' },
    { path: '/bang-cong-preview', icon: 'fas fa-calendar-check', label: 'Bảng Công' },
    ...(user?.role === 'admin' ? [] : [{ path: '/bang-cong', icon: 'fas fa-user-clock', label: 'Bảng công cá nhân' }]),
    ...(user?.role === 'admin' || user?.role === 'hr' ? [{ path: '/bang-phep', icon: 'fas fa-calendar-alt', label: 'Bảng phép' }] : []),
    { path: '/ngay-nghi-phep', icon: 'fas fa-calendar-minus', label: 'Ngày nghỉ phép' },
    { path: '/dang-ky-ca', icon: 'fas fa-calendar-week', label: 'Đăng ký ca' },
    { path: '/holiday-settings', icon: 'fas fa-cog', label: 'Cài đặt' }
  ]

  const secondaryStaffItems = [
    { path: '/dashboard', icon: 'fas fa-home', label: 'Tổng quan' },
    { path: '/recruitment', icon: 'fas fa-user-plus', label: 'Tuyển dụng' },
    { path: '/salary', icon: 'fas fa-money-bill-wave', label: 'Lương & Phúc lợi' },
    { path: '/competency', icon: 'fas fa-chart-line', label: 'Khung năng lực' },
    { path: '/kpi', icon: 'fas fa-bullseye', label: 'KPI' },
    { path: '/tasks', icon: 'fas fa-tasks', label: 'Công việc' }
  ]

  const employeeItems = [
    { path: '/approvals', icon: 'fas fa-stamp', label: 'Đề xuất' },
    { path: '/bang-cong', icon: 'fas fa-user-clock', label: 'Bảng công cá nhân' },
    { path: '/ngay-nghi-phep', icon: 'fas fa-calendar-minus', label: 'Ngày nghỉ phép' },
    { path: '/dang-ky-ca', icon: 'fas fa-calendar-week', label: 'Đăng ký ca' },
    { path: '/cham-cong-online', icon: 'fas fa-camera', label: 'Chấm công online' },
    { path: '/lich-su-cham-cong', icon: 'fas fa-clock-rotate-left', label: 'Lịch sử chấm công' }
  ]

  const accountingItems = [
    { path: '/bang-cong-preview', icon: 'fas fa-calendar-check', label: 'Bảng Công' },
    { path: '/bang-cong', icon: 'fas fa-user-clock', label: 'Bảng công cá nhân' },
    { path: '/ngay-nghi-phep', icon: 'fas fa-calendar-minus', label: 'Ngày nghỉ phép' },
    { path: '/holiday-settings', icon: 'fas fa-calendar-day', label: 'Cài đặt chấm công' },
    { path: '/cham-cong-online', icon: 'fas fa-camera', label: 'Chấm công online' },
    { path: '/lich-su-cham-cong', icon: 'fas fa-clock-rotate-left', label: 'Lịch sử chấm công' }
  ]

  const accountingOnly = isAccountingUser(user) && !isCoreStaffUser(user)

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  const handleLogout = async () => {
    await logout()
    navigate(user?.role === 'user' ? '/employee-login' : '/login', { replace: true })
  }

  const handleNavClick = () => {
    onNavigate()
  }

  const renderItems = (items) =>
    items.map((item) => (
      <Link
        key={item.path}
        to={item.path}
        className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
        onClick={handleNavClick}
      >
        <i className={item.icon}></i>
        <span>{item.label}</span>
      </Link>
    ))

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <div className="brand">
        <img src="/speego-logo.png" alt="SpeeGo Logistics" />
        <span>SpeeGo HR</span>
      </div>

      <div className="sidebar-nav">
        {accountingOnly ? (
          renderItems(accountingItems)
        ) : user?.role === 'user' ? (
          renderItems(employeeItems)
        ) : (
          <>
            <div className="nav-group nav-group--primary">
              {renderItems(primaryStaffItems)}
            </div>
            <div className="nav-group-divider" aria-hidden="true" />
            <div className="nav-group nav-group--secondary">
              {renderItems(secondaryStaffItems)}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-account">
        <div className="sidebar-account__avatar" aria-hidden="true">{initial}</div>
        <span className="sidebar-account__name" title={displayName}>{displayName}</span>
        <button
          type="button"
          className="sidebar-account__logout"
          onClick={handleLogout}
          title="Đăng xuất"
        >
          <i className="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
