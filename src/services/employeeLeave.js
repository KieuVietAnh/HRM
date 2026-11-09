import { supabase } from './supabase'
import { loadEmployeeDirectory } from './employeeDirectory'
import { mapUserToApp } from '../utils/helpers'
import { normalizeLeaveData } from '../utils/employeeLeave'

const TABLE = 'employee_leave_settings'
const PAGE_SIZE = 1000

const throwIfError = error => {
  if (!error) return
  if (error.code === 'PGRST205' || error.code === '42P01') {
    throw new Error('Bảng phép chưa được thiết lập trên hệ thống. Vui lòng liên hệ quản trị hệ thống.')
  }
  throw error
}

export const loadLeaveEmployees = async companyId => {
  if (!companyId) throw new Error('Thiếu mã công ty.')
  const { rows } = await loadEmployeeDirectory({
    columns: 'id, employee_id, name, join_date, employment_status, role, company_id, department'
  })
  return rows
    .filter(row => row.company_id ? row.company_id === companyId : companyId === 'speego-original')
    .map(row => mapUserToApp(row))
    .sort((a, b) => a.ho_va_ten.localeCompare(b.ho_va_ten, 'vi'))
}

export const loadEmployeeLeaveSettings = async companyId => {
  if (!companyId) throw new Error('Thiếu mã công ty.')
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('employee_id, leave_data')
      .eq('company_id', companyId)
      .order('employee_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    throwIfError(error)
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return Object.fromEntries(rows.map(row => [row.employee_id, normalizeLeaveData(row.leave_data)]))
}

export const saveEmployeeLeaveSettings = async (companyId, employeeId, leaveData) => {
  if (!companyId || !employeeId) throw new Error('Thiếu mã công ty hoặc nhân sự.')
  const normalized = normalizeLeaveData(leaveData)
  const { error } = await supabase.from(TABLE).upsert({
    company_id: companyId,
    employee_id: employeeId,
    leave_data: normalized
  }, { onConflict: 'company_id,employee_id' })
  throwIfError(error)
  return normalized
}
