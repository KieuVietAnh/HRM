export const CORE_STAFF_ROLES = Object.freeze(['admin', 'hr', 'manager'])
export const ACCOUNTING_ROLES = Object.freeze([
  'accountant',
  'accounting',
  'ke_toan',
  'ketoan',
  'kế toán'
])

const normalizeAccessText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const normalizedAccountingRoles = new Set(ACCOUNTING_ROLES.map(normalizeAccessText))

export const isCoreStaffUser = userOrRole => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
  return CORE_STAFF_ROLES.includes(normalizeAccessText(role))
}

export const isAccountingUser = user => {
  if (!user) return false
  const role = normalizeAccessText(user.role)
  if (normalizedAccountingRoles.has(role)) return true

  const jobContext = normalizeAccessText([
    user.bo_phan,
    user.department,
    user.vi_tri,
    user.position
  ].filter(Boolean).join(' '))
  return /(^|\s)ke toan($|\s)/.test(jobContext) || /(^|\s)account(ant|ing)?($|\s)/.test(jobContext)
}

export const canManageAttendance = user => isCoreStaffUser(user) || isAccountingUser(user)

export const getDefaultLandingPath = user => {
  if (isAccountingUser(user) && !isCoreStaffUser(user)) return '/bang-cong-preview'
  if (normalizeAccessText(user?.role) === 'user') return '/bang-cong'
  if (isCoreStaffUser(user)) return '/employees'
  return '/login'
}
