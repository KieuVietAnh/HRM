export const PAYROLL_COMPONENTS = [
  ['mainPay', 'Lương công chính'], ['overtimePay', 'Lương tăng ca'],
  ['allowance', 'Phụ cấp'], ['bonus', 'Thưởng / KPI'], ['otherIncome', 'Thu nhập khác']
]

export const PAYROLL_EDIT_COLUMNS = [...PAYROLL_COMPONENTS, ['insurance', 'BHXH'], ['advance', 'Đã ứng'], ['note', 'Ghi chú']]

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

export function pastePayrollCells(text, startRow, startColumn, rows) {
  const input = text.replace(/\r\n?/g, '\n')
  const lines = [[]]
  let value = '', quoted = false, closedQuote = false
  for (let i = 0; i < input.length; i++) {
    const character = input[i]
    if (quoted) {
      if (character !== '"') value += character
      else if (input[i + 1] === '"') { value += '"'; i++ }
      else { quoted = false; closedQuote = true }
    } else if (character === '\t' || character === '\n') {
      lines.at(-1).push(value); value = ''; closedQuote = false
      if (character === '\n') lines.push([])
    } else if (closedQuote) throw new Error('Vùng dán có dấu ngoặc kép không hợp lệ.')
    else if (character === '"' && !value) quoted = true
    else value += character
  }
  if (quoted) throw new Error('Vùng dán thiếu dấu ngoặc kép kết thúc.')
  lines.at(-1).push(value)
  if (input.endsWith('\n') && lines.at(-1).length === 1 && !lines.at(-1)[0]) lines.pop()
  if (startRow < 0 || startColumn < 0 || startRow >= rows.length || startColumn >= PAYROLL_EDIT_COLUMNS.length ||
      startRow + lines.length > rows.length || lines.some(line => startColumn + line.length > PAYROLL_EDIT_COLUMNS.length)) {
    throw new Error('Vùng dán vượt quá các cột nhập hoặc số dòng đang hiển thị. Bắt đầu từ ô lương, BHXH, đã ứng hoặc ghi chú.')
  }
  const patches = {}
  lines.forEach((line, offset) => {
    const patch = {}
    line.forEach((value, index) => {
      const [field, label] = PAYROLL_EDIT_COLUMNS[startColumn + index]
      try {
        if (field === 'note') {
          if (value.length > 1000) throw new Error('Ghi chú tối đa 1.000 ký tự.')
          patch[field] = value
        } else {
          const amount = parsePayrollMoney(value)
          patch[field] = amount === null && !['mainPay', 'overtimePay'].includes(field) ? 0 : amount
        }
      } catch (error) { throw new Error(`Dòng ${startRow + offset + 1}, ${label}: ${error.message}`) }
    })
    patches[rows[startRow + offset].employeeId] = patch
  })
  return patches
}

export function payrollSummaryTotals(rows) {
  return rows.reduce((total, row) => {
    const values = payrollAmounts(row)
    for (const key of ['insurance', 'advance']) total[key] += values[key]
    for (const [key] of PAYROLL_COMPONENTS) total.components[key] += values[key] ?? 0
    if (values.gross === null) total.incomplete++
    else { total.gross += values.gross; total.net += values.net }
    for (const amount of [total.gross, total.net, total.insurance, total.advance, ...Object.values(total.components)]) {
      if (!Number.isSafeInteger(amount)) throw new Error('Tổng tiền vượt giới hạn cho phép.')
    }
    return total
  }, { gross: 0, net: 0, insurance: 0, advance: 0, incomplete: 0, components: Object.fromEntries(PAYROLL_COMPONENTS.map(([key]) => [key, 0])) })
}
