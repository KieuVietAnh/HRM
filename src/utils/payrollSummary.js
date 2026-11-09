export const PAYROLL_COMPONENTS = [
  ['mainPay', 'Lương công chính'], ['overtimePay', 'Lương tăng ca'],
  ['allowance', 'Phụ cấp'], ['bonus', 'Thưởng / KPI'], ['otherIncome', 'Thu nhập khác']
]

export function parsePayrollMoney(value) {
  const text = String(value ?? '').trim().replace(/\s*(?:₫|đ|vnd)$/i, '').trim()
  if (!text) return null
  if (!/^(?:\d+|\d{1,3}(?:[., ]\d{3})+)$/.test(text)) throw new Error('Nhập tiền VNĐ nguyên, không âm (ví dụ 12.000.000).')
  const amount = Number(text.replace(/[., ]/g, ''))
  if (!Number.isSafeInteger(amount)) throw new Error('Số tiền vượt giới hạn cho phép.')
  return amount
}

export function payrollAmounts(record) {
  const values = {}
  for (const [key, label] of [...PAYROLL_COMPONENTS, ['insurance', 'BHXH'], ['advance', 'Đã ứng']]) {
    try {
      const amount = parsePayrollMoney(record[key])
      values[key] = amount === null && !['mainPay', 'overtimePay'].includes(key) ? 0 : amount
    } catch (error) { throw new Error(`${label}: ${error.message}`) }
  }
  const gross = values.mainPay === null || values.overtimePay === null ? null
    : PAYROLL_COMPONENTS.reduce((sum, [key]) => sum + values[key], 0)
  const net = gross === null ? null : gross - values.insurance - values.advance
  if (![gross, net].every(value => value === null || Number.isSafeInteger(value))) throw new Error('Tổng tiền vượt giới hạn cho phép.')
  return { ...values, gross, net }
}

export function regularPayrollWorkdays(row) {
  const days = row.days instanceof Map ? [...row.days.values()] : Object.values(row.days || {})
  if (!days.length) return Number(row.overtimeHours || 0) > 0 ? null : Number(row.workdays || 0)
  let total = 0
  for (const day of days) {
    const regular = day.regularWorkdaysExact ?? day.regularWorkdays
    if (regular != null) total += Number(regular)
    else if (Number(day.overtimeHours || 0) > 0) return null
    else total += Number(day.workdaysExact ?? day.workdays ?? 0)
  }
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null
}

export function makePayrollRecord(row, employee = {}) {
  return {
    employeeId: String(row.employeeId), code: row.displayEmployeeCode || row.employeeCode || employee.ma_nhan_vien || '',
    name: row.employeeName || employee.ho_va_ten || employee.name || '',
    department: row.displayDepartment || row.department || '',
    mainWorkdays: regularPayrollWorkdays(row), overtimeHours: Number(row.overtimeHours || 0),
    referenceSalary: employee.tong_luong ?? employee.total_salary ?? '',
    mainPay: null, overtimePay: Number(row.overtimeHours || 0) > 0 ? null : 0,
    allowance: 0, bonus: 0, otherIncome: 0, insurance: 0, advance: 0, note: ''
  }
}

export function pastePayrollDeductions(text, startRow, startColumn, rows) {
  const fields = ['insurance', 'advance']
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
  if (startRow + lines.length > rows.length || lines.some(line => startColumn + line.length > fields.length)) {
    throw new Error('Chỉ dán vào hai cột BHXH, Đã ứng và trong số dòng đang hiển thị.')
  }
  const patches = {}
  lines.forEach((line, offset) => {
    const patch = {}
    line.forEach((value, index) => {
      try { patch[fields[startColumn + index]] = parsePayrollMoney(value) ?? 0 }
      catch (error) { throw new Error(`Dòng ${startRow + offset + 1}: ${error.message}`) }
    })
    patches[rows[startRow + offset].employeeId] = patch
  })
  return patches
}

export function payrollSummaryTotals(rows) {
  return rows.reduce((total, row) => {
    const values = payrollAmounts(row)
    for (const key of ['insurance', 'advance']) total[key] += values[key]
    if (values.gross === null) total.incomplete++
    else { total.gross += values.gross; total.net += values.net }
    for (const key of ['gross', 'net', 'insurance', 'advance']) {
      if (!Number.isSafeInteger(total[key])) throw new Error('Tổng tiền vượt giới hạn cho phép.')
    }
    return total
  }, { gross: 0, net: 0, insurance: 0, advance: 0, incomplete: 0 })
}
