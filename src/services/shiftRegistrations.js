import { supabase } from './supabase'

const TABLE = 'employee_shift_registrations'
const COLUMNS = 'id, employee_id, employee_name, work_date, shift_id, shift_name, start_time, end_time, status'

const throwShiftError = error => {
  if (!error) return
  if (error.code === 'PGRST205' || error.code === '42P01') {
    throw new Error('Chức năng đăng ký ca chưa được thiết lập. Hãy chạy file supabase/migrations/20261102100000_employee_shift_registrations.sql trong SQL Editor.')
  }
  if (error.code === '42501') throw new Error(error.message || 'Không có quyền thực hiện thao tác này.')
  throw error
}

export const loadShiftRegistrations = async ({ companyId, employeeId, from, to }) => {
  if (!companyId) throw new Error('Thiếu mã công ty.')
  let query = supabase.from(TABLE)
    .select(COLUMNS)
    .eq('company_id', companyId)
    .gte('work_date', from)
    .lte('work_date', to)
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
    .order('work_date', { ascending: true })
    .order('employee_name', { ascending: true })
    .limit(5000)
  throwShiftError(error)
  return data || []
}

export const saveShiftRegistrations = async ({ companyId, employeeId, upserts, removals }) => {
  if (!companyId || !employeeId) throw new Error('Thiếu thông tin tài khoản nhân sự.')
  if (removals.length > 0) {
    const { error } = await supabase.from(TABLE)
      .delete()
      .in('id', removals)
      .eq('employee_id', employeeId)
      .neq('status', 'approved')
    throwShiftError(error)
  }
  if (upserts.length > 0) {
    const rows = upserts.map(row => ({ ...row, company_id: companyId, employee_id: employeeId }))
    const { error } = await supabase.from(TABLE)
      .upsert(rows, { onConflict: 'company_id,employee_id,work_date,shift_id' })
    throwShiftError(error)
  }
}

export const decideShiftRegistrations = async ({ companyId, ids, status }) => {
  const targetIds = [...new Set((ids || []).filter(Boolean))]
  if (targetIds.length === 0) throw new Error('Chưa chọn ca để xử lý.')
  if (!['approved', 'rejected'].includes(status)) throw new Error('Trạng thái không hợp lệ.')
  const { data, error } = await supabase.from(TABLE)
    .update({ status })
    .in('id', targetIds)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .select(COLUMNS)
  throwShiftError(error)
  return data || []
}

export const assignEmployeeShifts = async ({ employeeId, workDate, shiftIds }) => {
  if (!employeeId || !workDate || !shiftIds?.length) {
    throw new Error('Hãy chọn nhân viên, ngày và ít nhất một ca.')
  }
  const { data, error } = await supabase.rpc('admin_assign_employee_shifts', {
    p_employee_id: employeeId,
    p_work_date: workDate,
    p_shift_ids: shiftIds
  })
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    throw new Error('Chưa bật chức năng admin gán ca. Hãy chạy migration 20261104160000_admin_assign_employee_shifts.sql.')
  }
  throwShiftError(error)
  return data || []
}
