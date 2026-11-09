export const DEFAULT_PENALTY_CATEGORIES = [
  { key: 'late_under_30', label: 'Muộn/sớm tổng <30p', amount: 50000 },
  { key: 'late_over_30', label: 'Muộn/sớm tổng ≥30p', amount: 100000 },
  { key: 'missing_punch', label: 'Quên chấm', amount: 50000 },
  { key: 'no_duty', label: 'Không trực nhật', amount: 50000 },
  { key: 'emergency_leave', label: 'Nghỉ đột xuất', amount: 100000 },
  { key: 'unapproved_absence', label: 'Nghỉ không phép', amount: 200000 },
  { key: 'drunk', label: 'Say xỉn', amount: 200000 },
  { key: 'other', label: 'Khác', amount: 0 }
]

export const PENALTY_CATEGORIES = DEFAULT_PENALTY_CATEGORIES

/** 2 lần đầu <15p miễn phạt; từ lần 3 hoặc có lần ≥15p thì phạt theo tổng phút. */
export const LATE_EARLY_GRACE_COUNT = 2
export const LATE_EARLY_GRACE_MAX_MINUTES = 15
export const LATE_EARLY_FINE_THRESHOLD_MINUTES = 30

const cloneCategory = item => ({
  key: item.key,
  label: item.label,
  amount: item.amount
})

const fallbackKey = (index) => `custom_${index + 1}`

export const normalizePenaltyCategories = (categories) => {
  const source = Array.isArray(categories) ? categories : []
  if (source.length === 0) {
    return DEFAULT_PENALTY_CATEGORIES.map(cloneCategory)
  }

  const usedKeys = new Set()
  return source.map((item, index) => {
    const label = String(item?.label || item?.name || item?.content || '').trim()
    const parsedAmount = Number(item?.amount ?? item?.money ?? 0)
    const matchedDefault = DEFAULT_PENALTY_CATEGORIES.find(entry =>
      entry.key === item?.key ||
      entry.key === item?.id ||
      entry.label === label
    )
    let key = String(item?.key || item?.id || matchedDefault?.key || '').trim() || fallbackKey(index)
    if (usedKeys.has(key)) key = `${key}_${index + 1}`
    usedKeys.add(key)
    return {
      key,
      label: label || matchedDefault?.label || `Hạng mục ${index + 1}`,
      amount: Number.isFinite(parsedAmount) && parsedAmount >= 0 ? Math.round(parsedAmount) : 0
    }
  })
}

export const createPenaltyCategory = (partial = {}) => ({
  key: String(partial.key || `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
  label: String(partial.label || '').trim(),
  amount: Math.max(0, Math.round(Number(partial.amount || 0)) || 0)
})

const findCategory = (categories, key) => {
  const list = normalizePenaltyCategories(categories)
  return list.find(item => item.key === key) || DEFAULT_PENALTY_CATEGORIES.find(item => item.key === key)
}

export const createEmptyPenaltyRow = (monthValue = '', categories = DEFAULT_PENALTY_CATEGORIES) => {
  const first = normalizePenaltyCategories(categories)[0] || DEFAULT_PENALTY_CATEGORIES[0]
  return {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: monthValue ? `${monthValue}-01` : '',
    employeeId: '',
    employeeCode: '',
    employeeName: '',
    category: first.label,
    content: '',
    amount: first.amount,
    note: '',
    source: 'manual'
  }
}

export const normalizePenaltyRows = (rows = []) =>
  (rows || []).map((row, index) => ({
    id: row.id || `p-legacy-${index}-${String(row.date || '')}-${String(row.employeeId || row.employeeName || '')}`,
    date: String(row.date || '').slice(0, 10),
    employeeId: row.employeeId || '',
    employeeCode: row.employeeCode || '',
    employeeName: row.employeeName || '',
    category: row.category || '',
    content: row.content || '',
    amount: Number(row.amount || 0),
    note: row.note || '',
    source: row.source || 'manual'
  }))

export const getPenaltyTotals = (rows = []) => (rows || []).reduce((totals, row) => {
  if (!String(row?.employeeId || row?.employeeCode || row?.employeeName || '').trim()) return totals
  totals.errorCount += 1
  const amount = Number(row?.amount)
  if (Number.isFinite(amount) && amount > 0) totals.amount += amount
  return totals
}, { errorCount: 0, amount: 0 })

const autoRow = ({ employeeId, employeeCode, employeeName, date, suffix, category, content }) => ({
  id: `p-auto-${employeeId}-${date}-${suffix}`,
  date,
  employeeId,
  employeeCode,
  employeeName,
  category: category.label,
  content,
  amount: category.amount,
  note: '',
  source: 'auto'
})

/**
 * Thu thập các lần đi muộn / về sớm trong tháng (mỗi ngày tối đa 1 muộn + 1 sớm).
 */
export const collectLateEarlyOccurrences = (summaryRow = {}) => {
  const days = summaryRow.days instanceof Map
    ? summaryRow.days
    : new Map(Object.entries(summaryRow.days || {}))
  const events = []
  days.forEach((day, date) => {
    if (!day) return
    const lateMinutes = Number(day.lateMinutes || 0)
    const earlyMinutes = Number(day.earlyMinutes || 0)
    if (day.late && lateMinutes > 0) {
      events.push({ date, type: 'late', minutes: lateMinutes })
    }
    if (day.early && earlyMinutes > 0) {
      events.push({ date, type: 'early', minutes: earlyMinutes })
    }
  })
  return events.sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/**
 * Cơ chế phạt muộn/sớm theo tháng:
 * - 2 lần đầu, mỗi lần <15 phút: không phạt, chỉ ghi nhận
 * - Từ lần 3 hoặc có lần ≥15 phút: phạt theo tổng phút cả tháng
 *   (<30p → 50k, ≥30p → 100k)
 */
export const evaluateMonthlyLateEarlyPenalty = (events = [], categories = DEFAULT_PENALTY_CATEGORIES) => {
  const list = normalizePenaltyCategories(categories)
  const under = findCategory(list, 'late_under_30')
  const over = findCategory(list, 'late_over_30')
  const sorted = [...events].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const totalMinutes = sorted.reduce((sum, item) => sum + Number(item.minutes || 0), 0)
  const count = sorted.length
  if (!count) {
    return { applies: false, totalMinutes: 0, count: 0, amount: 0, category: null, content: '' }
  }

  const hasSerious = sorted.some(item => Number(item.minutes || 0) >= LATE_EARLY_GRACE_MAX_MINUTES)
  const graceEligible = sorted.filter(item => Number(item.minutes || 0) < LATE_EARLY_GRACE_MAX_MINUTES)
  const onlyGraceFirstTwo = count <= LATE_EARLY_GRACE_COUNT &&
    graceEligible.length === count &&
    !hasSerious

  if (onlyGraceFirstTwo) {
    return {
      applies: false,
      totalMinutes,
      count,
      amount: 0,
      category: null,
      content: `Ghi nhận ${count} lần muộn/sớm (tổng ${totalMinutes}p) — miễn phạt (2 lần đầu <15p)`
    }
  }

  const category = totalMinutes < LATE_EARLY_FINE_THRESHOLD_MINUTES ? under : over
  const content = `Muộn/sớm ${count} lần, tổng ${totalMinutes} phút → phạt ${Number(category?.amount || 0).toLocaleString('vi-VN')}đ`

  return {
    applies: true,
    totalMinutes,
    count,
    amount: Number(category?.amount || 0),
    category,
    content
  }
}

export const buildPenaltyDetailRows = (summaryRows = [], categories = DEFAULT_PENALTY_CATEGORIES) => {
  const missingPunch = findCategory(categories, 'missing_punch')
  const unapprovedAbsence = findCategory(categories, 'unapproved_absence')
  const details = []

  summaryRows.forEach(row => {
    const employeeName = row.employeeName || row.employeeCode || row.employeeId || ''
    const employeeId = row.employeeId || ''
    const employeeCode = row.employeeCode || ''
    const month = String(row.month || '').slice(0, 7) ||
      (() => {
        const days = row.days instanceof Map ? [...row.days.keys()] : Object.keys(row.days || {})
        return String(days[0] || '').slice(0, 7)
      })()

    const lateEarlyEvents = collectLateEarlyOccurrences(row)
    const lateEarlyPenalty = evaluateMonthlyLateEarlyPenalty(lateEarlyEvents, categories)
    if (lateEarlyPenalty.applies && lateEarlyPenalty.category) {
      details.push(autoRow({
        employeeId,
        employeeCode,
        employeeName,
        date: month ? `${month}-01` : (lateEarlyEvents[0]?.date || ''),
        suffix: 'late-early-month',
        category: lateEarlyPenalty.category,
        content: lateEarlyPenalty.content
      }))
    }

    const days = row.days instanceof Map ? row.days : new Map(Object.entries(row.days || {}))
    days.forEach((day, date) => {
      if (!day) return

      if (day.missingPunch) {
        details.push(autoRow({
          employeeId,
          employeeCode,
          employeeName,
          date,
          suffix: 'missing',
          category: missingPunch,
          content: 'Quên chấm công (thiếu vào/ra)'
        }))
      }

      if (day.unapprovedAbsence) {
        details.push(autoRow({
          employeeId,
          employeeCode,
          employeeName,
          date,
          suffix: 'absence',
          category: unapprovedAbsence,
          content: 'Nghỉ không phép'
        }))
      }
    })
  })

  return details.sort((left, right) => {
    const byDate = String(left.date).localeCompare(String(right.date))
    if (byDate !== 0) return byDate
    return String(left.employeeName).localeCompare(String(right.employeeName), 'vi')
  })
}

/** Giữ dòng phạt nhập tay; thay toàn bộ dòng auto bằng dữ liệu từ bảng công. */
export const mergeAutoPenaltiesWithManual = (existingRows = [], autoRows = []) => {
  const manual = normalizePenaltyRows(existingRows).filter(row => row.source !== 'auto')
  return [...manual, ...normalizePenaltyRows(autoRows)]
}

/**
 * Gắn số tiền phạt (theo cơ chế mới) vào từng dòng bảng công để xuất Excel.
 */
export const applyPenaltyAmountsToSummaryRows = (summaryRows = [], categories = DEFAULT_PENALTY_CATEGORIES) => {
  const list = normalizePenaltyCategories(categories)
  const missingAmount = Number(findCategory(list, 'missing_punch')?.amount || 0)
  const absenceAmount = Number(findCategory(list, 'unapproved_absence')?.amount || 0)

  return (summaryRows || []).map(row => {
    const events = collectLateEarlyOccurrences(row)
    const lateEarly = evaluateMonthlyLateEarlyPenalty(events, list)
    const missingPunchCount = Number(row.missingPunchCount || 0)
    const unapprovedAbsenceCount = Number(row.unapprovedAbsenceCount || 0)
    const missingPunchFine = missingPunchCount * missingAmount
    const unapprovedAbsenceFine = unapprovedAbsenceCount * absenceAmount
    const lateFine = lateEarly.applies ? lateEarly.amount : 0
    const earlyFine = 0
    const lateUnder30Fine = lateEarly.applies && lateEarly.totalMinutes < LATE_EARLY_FINE_THRESHOLD_MINUTES
      ? lateEarly.amount
      : 0
    const lateOver30Fine = lateEarly.applies && lateEarly.totalMinutes >= LATE_EARLY_FINE_THRESHOLD_MINUTES
      ? lateEarly.amount
      : 0
    const totalFine = lateFine + missingPunchFine + unapprovedAbsenceFine

    return {
      ...row,
      lateUnder30Fine,
      lateOver30Fine,
      lateFine,
      earlyFine,
      missingPunchFine,
      unapprovedAbsenceFine,
      totalFine,
      lateEarlyPenaltyNote: lateEarly.content || ''
    }
  })
}
