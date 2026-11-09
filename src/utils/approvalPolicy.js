import { normalizeString } from './helpers'

export const APPROVAL_PERIOD_LABELS = {
  week: 'tuần',
  month: 'tháng',
  year: 'năm'
}

export const DEFAULT_APPROVAL_POLICIES = {
  leave: {
    quotaEnabled: false,
    maxRequests: 0,
    quotaPeriod: 'year',
    attendanceSync: 'paid-leave'
  },
  'late-early': {
    quotaEnabled: true,
    maxRequests: 3,
    quotaPeriod: 'month',
    attendanceSync: 'none'
  }
}

const DEFAULT_POLICY = {
  quotaEnabled: false,
  maxRequests: 0,
  quotaPeriod: 'month',
  attendanceSync: 'none'
}

export const getApprovalPeriodRange = (period = 'month', dateInput = new Date()) => {
  const base = dateInput instanceof Date
    ? new Date(dateInput)
    : new Date(`${String(dateInput).slice(0, 10)}T00:00:00`)
  if (isNaN(base.getTime())) return null

  if (period === 'week') {
    const day = base.getDay() || 7
    const start = new Date(base)
    start.setDate(base.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  if (period === 'year') {
    return {
      start: new Date(base.getFullYear(), 0, 1),
      end: new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999)
    }
  }

  return {
    start: new Date(base.getFullYear(), base.getMonth(), 1),
    end: new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999)
  }
}

export const getTemplatePolicy = (template = {}) => {
  const policyKey = template.baseId || template.id || ''
  const automatic = DEFAULT_APPROVAL_POLICIES[policyKey] || DEFAULT_POLICY
  const maxRequests = Number(template.maxRequests ?? automatic.maxRequests)

  return {
    quotaEnabled: template.quotaEnabled ?? automatic.quotaEnabled,
    maxRequests: Number.isFinite(maxRequests) ? Math.max(0, Math.floor(maxRequests)) : 0,
    quotaPeriod: ['week', 'month', 'year'].includes(template.quotaPeriod)
      ? template.quotaPeriod
      : automatic.quotaPeriod,
    attendanceSync: template.attendanceSync || automatic.attendanceSync
  }
}

export const isSameRequester = (request, person) => {
  if (!request || !person) return false
  if (request.requesterId && person.id) {
    return String(request.requesterId) === String(person.id)
  }
  if (
    request.requesterCode &&
    person.employeeCode &&
    String(request.requesterCode) === String(person.employeeCode)
  ) return true
  return Boolean(
    request.requesterName &&
    person.name &&
    normalizeString(request.requesterName) === normalizeString(person.name)
  )
}

export const isSameApprovalTemplate = (request, template) => {
  if (!request || !template) return false
  const acceptedIds = new Set(
    [template.id, template.baseId].filter(Boolean).map(String)
  )
  if (request.templateId && acceptedIds.has(String(request.templateId))) return true
  return Boolean(
    request.templateType &&
    template.title &&
    normalizeString(request.templateType) === normalizeString(template.title)
  )
}

export const calculateTemplateUsage = ({
  requests = [],
  template,
  person,
  at = new Date()
}) => {
  const policy = getTemplatePolicy(template)
  if (!policy.quotaEnabled || policy.maxRequests <= 0) {
    return { ...policy, used: 0, remaining: null, limitReached: false }
  }

  const range = getApprovalPeriodRange(policy.quotaPeriod, at)
  const used = requests.filter((request) => {
    if (!isSameRequester(request, person)) return false
    if (!isSameApprovalTemplate(request, template)) return false
    if (request.status === 'rejected') return false
    const createdAt = new Date(request.createdAt || 0)
    return (
      range &&
      !isNaN(createdAt.getTime()) &&
      createdAt >= range.start &&
      createdAt <= range.end
    )
  }).length
  const remaining = Math.max(0, policy.maxRequests - used)

  return {
    ...policy,
    used,
    remaining,
    limitReached: remaining <= 0
  }
}

export const isPaidLeaveRequest = (request = {}) =>
  (request.templateId === 'leave' || request.attendanceSync === 'paid-leave') &&
  (request.leaveType || 'paid') === 'paid'

export const listRequestLeaveDates = (request = {}, maxDays = 366) => {
  const startText = String(request.leaveStartDate || request.leaveDate || '').slice(0, 10)
  const endText = String(request.leaveEndDate || startText).slice(0, 10)
  const start = new Date(`${startText}T00:00:00`)
  const end = new Date(`${endText}T00:00:00`)
  if (
    !startText ||
    !endText ||
    isNaN(start.getTime()) ||
    isNaN(end.getTime()) ||
    end < start
  ) return []

  const dates = []
  const current = new Date(start)
  while (current <= end && dates.length < maxDays) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
    current.setDate(current.getDate() + 1)
  }
  return dates
}
