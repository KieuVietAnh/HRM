const inferDepartmentFromPosition = position => {
  const value = String(position || '').trim().toLocaleLowerCase('vi')
  if (!value) return ''
  if (/nhân sự|\bhr\b|admin/.test(value)) return 'Nhân sự'
  if (/kế toán|account/.test(value)) return 'Kế toán'
  if (/social media|marketing|\bmkt\b|seo|content|designer|media/.test(value)) return 'MKT'
  if (/sale|kinh doanh/.test(value)) return 'Sale'
  if (/vận hành|kho|thu mua|xuất nhập khẩu|logistics/.test(value)) return 'Vận hành'
  return ''
}

export const resolveAttendanceDepartment = row =>
  String(row?.department || '').trim() ||
  inferDepartmentFromPosition(row?.position) ||
  'Chưa phân bộ phận'

export const departmentForAttendanceSummary = (log = {}, employee = {}) => {
  const monthlyDepartment = String(log.monthlyDepartment || '').trim()
  const sourceDepartment = String(log.sourceDepartment || '').trim()
  // Bảng công tháng có bộ phận cụ thể theo từng dòng. File chấm công chi tiết
  // chỉ ghi nhóm chung (ví dụ "Văn phòng"), nên với file đó ưu tiên hồ sơ HR.
  if (monthlyDepartment) return monthlyDepartment
  if (log.importFormat === 'attendance-monthly-matrix' && sourceDepartment) {
    return sourceDepartment
  }
  return String(
    employee.bo_phan || employee.department ||
    log.department || log.phongBan || sourceDepartment || ''
  ).trim()
}
