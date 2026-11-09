export const parseSalaryAmount = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const text = String(value).trim().replace(/\s*(?:₫|đ|vnd)$/i, '').trim()
  if (!/^(?:\d+|\d{1,3}(?:[.,\s]\d{3})+)$/.test(text)) return null
  const amount = Number(text.replace(/[.,\s]/g, ''))
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

export const calculatePayrollSalary = (row, history, employee, month, standardWorkdays) => {
  if (standardWorkdays < 0.5 || standardWorkdays > 31 || !Number.isFinite(standardWorkdays)) {
    return { amount: null, error: 'Công chuẩn phải từ 0,5 đến 31.', segments: [] }
  }
  const rates = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  const days = row.days instanceof Map ? row.days : new Map(Object.entries(row.days || {}))
  const officialDate = employee.ngay_lam_chinh_thuc ?? row.officialDate ?? ''
  const isProbation = String(employee.tinh_trang || row.employmentStatus || '').toLowerCase().includes('thử việc')
  const segments = new Map()
  let total = 0
  let totalWorkdays = 0
  let legacy = false
  if (!days.size && Number(row.workdays) > 0) {
    return { amount: null, error: 'Thiếu công theo ngày để tính lương.', segments: [] }
  }
  for (const [date, day] of days) {
    if (!date.startsWith(`${month}-`)) continue
    const workdays = Number(day.workdaysExact ?? day.workdays ?? 0)
    if (!Number.isFinite(workdays) || workdays < 0) {
      return { amount: null, error: `Công không hợp lệ ngày ${date}.`, segments: [] }
    }
    if (workdays === 0) continue
    totalWorkdays += workdays
    const rate = rates.findLast(entry => entry.effectiveDate <= date)
    const amount = parseSalaryAmount(rate?.amount)
    const percent = Number(rate?.probationPercent)
    if (amount === null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { amount: null, error: `Chưa có mức lương hợp lệ cho ngày ${date}.`, segments: [] }
    }
    const probation = officialDate ? date < officialDate : isProbation
    const appliedPercent = probation ? percent : 100
    const key = `${rate.effectiveDate}:${appliedPercent}`
    const segment = segments.get(key) || {
      effectiveDate: rate.effectiveDate, amount, percent: appliedPercent, workdays: 0
    }
    segment.workdays += workdays
    segments.set(key, segment)
    total += amount * appliedPercent / 100 * workdays / standardWorkdays
    legacy ||= rate.legacy === true
  }
  const amount = Math.round(total)
  if (row.workdays !== undefined && Math.abs(totalWorkdays - Number(row.workdays)) > 0.02) {
    return { amount: null, error: 'Tổng công không khớp chi tiết theo ngày. Cần tổng hợp lại bảng công.', segments: [] }
  }
  if (!Number.isSafeInteger(amount)) return { amount: null, error: 'Tổng lương vượt giới hạn tính toán.', segments: [] }
  return { amount, legacy, segments: [...segments.values()], error: '' }
}

export const calculatePayrollKpi = (result, salary) => {
  if (!result || salary === null) return { amount: null, percent: null }
  const value = result.totalKPI ?? result.kpiTong
  if (value === null || value === undefined || value === '') return { amount: null, percent: null }
  const percent = Number(value)
  if (!Number.isFinite(percent)) return { amount: null, percent: null }
  const amount = Math.round(salary * percent / 100)
  return Number.isSafeInteger(amount)
    ? { amount, percent }
    : { amount: null, percent, error: 'Lương KPI vượt giới hạn tính toán.' }
}
