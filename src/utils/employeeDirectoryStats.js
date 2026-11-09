import { getEmployeeEmploymentStatus, parseFlexibleDate } from './helpers.js'

const dateParts = value => {
  const normalized = parseFlexibleDate(value)
  const match = String(normalized || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

const startOfDay = value => new Date(value.getFullYear(), value.getMonth(), value.getDate())
const daysBetween = (from, to) => Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
  Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000)

const daysUntilExpiry = (employee, today) => {
  const parts = dateParts(employee.ngay_het_han || employee.contractEndDate || employee.ngay_het_han_hop_dong)
  return parts ? daysBetween(today, new Date(parts.year, parts.month - 1, parts.day)) : null
}

const isAnniversarySoon = (employee, today) => {
  const parts = dateParts(employee.ngay_vao_lam || employee.join_date)
  if (!parts) return false
  const joined = new Date(parts.year, parts.month - 1, parts.day)
  if (joined > today) return false
  let anniversary = new Date(today.getFullYear(), parts.month - 1, parts.day)
  if (anniversary < today || parts.year === today.getFullYear()) {
    anniversary = new Date(today.getFullYear() + 1, parts.month - 1, parts.day)
  }
  return daysBetween(today, anniversary) <= 30
}

export const aggregateEmployeeActivity = snapshots => {
  const byEmployee = {}
  for (const snapshot of snapshots || []) {
    for (const row of snapshot?.rows || []) {
      const keys = [
        row.employeeId && `id:${String(row.employeeId).trim()}`,
        row.employeeCode && `code:${String(row.employeeCode).trim()}`
      ].filter(Boolean)
      for (const key of keys) {
        const current = byEmployee[key] || { lateCount: 0, paidLeaveWorkdays: 0 }
        current.lateCount += Math.max(0, Number(row.lateCount) || 0)
        current.paidLeaveWorkdays += Math.max(0, Number(row.paidLeaveWorkdays) || 0)
        byEmployee[key] = current
      }
    }
  }
  return byEmployee
}

export const matchesEmployeeStat = (employee, stat, activityByEmployee = {}, now = new Date()) => {
  if (!employee || getEmployeeEmploymentStatus(employee) === 'Nghỉ việc') return false
  const today = startOfDay(now)
  const activity = activityByEmployee[`id:${employee.id}`] ||
    activityByEmployee[`code:${employee.employeeId || employee.employee_id}`] || {}
  switch (stat) {
    case 'all': return true
    case 'probation': return getEmployeeEmploymentStatus(employee) === 'Thử việc'
    case 'official': return getEmployeeEmploymentStatus(employee) === 'Chính thức'
    case 'expiring': {
      const days = daysUntilExpiry(employee, today)
      return days !== null && days >= 0 && days <= 60
    }
    case 'missingDocuments': return !String(employee.cccd || '').trim() ||
      !dateParts(employee.ngay_sinh || employee.dob)
    case 'frequentLate': return Number(activity.lateCount || 0) > 3
    case 'frequentLeave': return Number(activity.paidLeaveWorkdays || 0) > 8
    case 'birthday': return dateParts(employee.ngay_sinh || employee.dob)?.month === today.getMonth() + 1
    case 'anniversary': return isAnniversarySoon(employee, today)
    default: return false
  }
}

export const getEmployeeStatRows = (employees, stat, activityByEmployee, now) =>
  (employees || []).filter(employee => matchesEmployeeStat(employee, stat, activityByEmployee, now))
