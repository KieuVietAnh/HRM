import { supabase } from './supabase'
import { isValidLeaveDate, LEAVE_REASON_FROM_APPROVAL, normalizeLeaveReason } from '../utils/leaveDays'

const TABLE = 'employee_leave_days'
const PAGE_SIZE = 1000

const throwLeaveError = error => {
  if (!error) return
  if (error.code === '23505') throw new Error('Ngày nghỉ này đã được ghi nhận cho bạn.')
  if (error.code === 'PGRST205' || error.code === '42P01') {
    throw new Error('Chức năng ngày nghỉ phép chưa được thiết lập trên hệ thống.')
  }
  throw error
}

export const loadLeaveDays = async ({ companyId, employeeId }) => {
  if (!companyId) throw new Error('Thiếu mã công ty.')
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(TABLE)
      .select('id, employee_id, employee_name, leave_date, reason, status')
      .eq('company_id', companyId)
    if (employeeId) query = query.eq('employee_id', employeeId)
    const { data, error } = await query
      .order('leave_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    throwLeaveError(error)
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export const approveMatchingLeaveDays = async ({ employeeId, dates }) => {
  const leaveDates = [...new Set((dates || []).map(date => String(date).slice(0, 10)).filter(Boolean))]
  if (!employeeId || leaveDates.length === 0) return []
  const { data, error } = await supabase.from(TABLE)
    .update({ status: 'approved', reason: LEAVE_REASON_FROM_APPROVAL })
    .eq('employee_id', employeeId)
    .eq('status', 'pending')
    .in('leave_date', leaveDates)
    .select('id, employee_id, employee_name, leave_date, reason, status')
  throwLeaveError(error)
  return data || []
}

export const approveLeaveDay = async ({ companyId, leaveDayId }) => {
  if (!companyId || !leaveDayId) throw new Error('Thiếu thông tin ngày nghỉ phép.')
  const { data, error } = await supabase.from(TABLE)
    .update({ status: 'approved' })
    .eq('id', leaveDayId)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .select('id, employee_id, employee_name, leave_date, reason, status')
    .single()
  throwLeaveError(error)
  return data
}

const deleteLeaveDaysDirect = async leaveIds => {
  const removed = []
  for (let index = 0; index < leaveIds.length; index += 100) {
    const chunk = leaveIds.slice(index, index + 100)
    const { data, error } = await supabase.from(TABLE)
      .delete()
      .in('id', chunk)
      .select('id')
    throwLeaveError(error)
    removed.push(...(data || []).map(row => row.id))
  }
  return removed
}

export const deleteLeaveDays = async ({ ids }) => {
  const leaveIds = [...new Set((ids || []).filter(Boolean))]
  if (leaveIds.length === 0) throw new Error('Chưa chọn ngày nghỉ phép để xóa.')

  const rpc = await supabase.rpc('delete_employee_leave_days', { p_ids: leaveIds })
  const missingFunction = /delete_employee_leave_days|schema cache|could not find the function/i.test(rpc.error?.message || '')
  let removed = []
  if (!rpc.error) {
    removed = Array.isArray(rpc.data) ? rpc.data : []
  } else if (!missingFunction) {
    throwLeaveError(rpc.error)
  } else {
    removed = await deleteLeaveDaysDirect(leaveIds)
  }

  if (removed.length < leaveIds.length) {
    throw new Error('Chưa xóa hết ngày nghỉ phép đã chọn. Hãy chạy file supabase/migrations/20261004120000_delete_leave_days_all.sql trong SQL Editor.')
  }
  return removed
}

export const addLeaveDay = async ({ companyId, employeeId, leaveDate, reason }) => {
  if (!companyId || !employeeId) throw new Error('Thiếu thông tin tài khoản nhân sự.')
  if (!isValidLeaveDate(leaveDate)) throw new Error('Vui lòng chọn ngày nghỉ hợp lệ.')
  const normalizedReason = normalizeLeaveReason(reason)
  const { data, error } = await supabase.from(TABLE)
    .insert({ company_id: companyId, employee_id: employeeId, leave_date: leaveDate, reason: normalizedReason })
    .select('id, employee_id, employee_name, leave_date, reason, status')
    .single()
  throwLeaveError(error)
  return data
}
