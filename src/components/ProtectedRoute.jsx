import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultLandingPath, isAccountingUser } from '../utils/staffAccess'
import LoadingSpinner from './LoadingSpinner'

function ProtectedRoute({ allowedRoles, allowAccounting = false, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingSpinner />
  if (!user) {
    return <Navigate to={allowedRoles || allowAccounting ? '/login' : '/employee-login'} state={{ from: location }} replace />
  }
  const roleAllowed = !allowedRoles || allowedRoles.includes(user.role)
  const accountingAllowed = allowAccounting && isAccountingUser(user)
  if (!roleAllowed && !accountingAllowed) {
    return <Navigate to={getDefaultLandingPath(user)} replace />
  }
  return children || <Outlet />
}

export default ProtectedRoute
