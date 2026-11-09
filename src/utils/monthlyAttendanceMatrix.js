import { normalizeAttendanceHeader } from './attendanceImport.js'

export const SUPPORTED_ATTENDANCE_IMPORT_MODE = 'monthly_matrix_only'
export const MONTHLY_ATTENDANCE_FORMAT = 'monthly-attendance-matrix'

const REQUIRED_HEADERS = Object.freeze({
  name: ['ho ten'],
  department: ['bo phan'],
  shift: ['ca lam'],
  totalWork: ['tong cong', 'tong cong ngay thuong + le']
})

const OPTIONAL_HEADERS = Object.freeze({
  employmentType: ['loai hd', 'loai hop dong'],
  employeeStatus: ['trang thai']
})

const normalizedCell = value => normalizeAttendanceHeader(value)

const findHeaderColumn = (row, aliases) => {
  const normalizedAliases = new Set(aliases.map(normalizedCell))
  return (row || []).findIndex(cell => {
    const normalized = normalizedCell(cell)
    return normalizedAliases.has(normalized)
  })
}

const exactPositiveInteger = value => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null
  }
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const excelSerialDate = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 20000 || value > 80000) return null
  const date = new Date(Math.round((value - 25569) * 86400 * 1000))
  if (Number.isNaN(date.getTime())) return null
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

const calendarDateHeader = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }
  }
  const serial = excelSerialDate(value)
  if (serial) return serial
  const text = String(value ?? '').trim()
  const iso = text.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  const vietnamese = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})$/)
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : vietnamese
      ? { year: Number(vietnamese[3]), month: Number(vietnamese[2]), day: Number(vietnamese[1]) }
      : null
  return parts && validDate(parts.year, parts.month, parts.day) ? parts : null
}

const validDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

const findDateRangeMonth = (rows, headerRowIndex) => {
  const limit = Math.min(rows.length, headerRowIndex + 1)
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const rowText = (rows[rowIndex] || [])
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
      .join(' ')
    const match = rowText.match(
      /(?:^|\s)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\s*(?:-|–|—|đến|to)\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s|$)/i
    )
    if (!match) continue

    const start = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
    const end = { day: Number(match[4]), month: Number(match[5]), year: Number(match[6]) }
    if (
      validDate(start.year, start.month, start.day) &&
      validDate(end.year, end.month, end.day) &&
      start.year === end.year &&
      start.month === end.month &&
      start.day <= end.day
    ) {
      return {
        year: start.year,
        month: start.month,
        startDay: start.day,
        endDay: end.day,
        source: 'date-range',
        rowIndex
      }
    }
    return { error: 'Khoảng ngày trong sheet không hợp lệ hoặc không thuộc cùng một tháng.' }
  }
  return null
}

const findTitleMonth = (rows, headerRowIndex) => {
  const limit = Math.min(rows.length, headerRowIndex + 1)
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const rowText = (rows[rowIndex] || [])
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
      .join(' ')
    const normalized = normalizedCell(rowText)
    const match = normalized.match(
      /(?:bang cong\s*)?(?:thang|t)\s*(1[0-2]|0?[1-9])(?:[/.\-\s]*)(20\d{2})(?:\b|$)/i
    )
    if (match) {
      return { year: Number(match[2]), month: Number(match[1]), source: 'title', rowIndex }
    }
  }
  return null
}

export const detectMonthlyAttendanceMonth = (rows = [], headerRowIndex = rows.length - 1) =>
  findDateRangeMonth(rows, headerRowIndex) || findTitleMonth(rows, headerRowIndex)

const collectDayCandidates = (row, totalWorkColumn, expectedMonth = null) => {
  const candidates = []
  let inferredMonth = null

  for (let columnIndex = totalWorkColumn + 1; columnIndex < (row || []).length; columnIndex += 1) {
    const fullDate = calendarDateHeader(row[columnIndex])
    const integer = exactPositiveInteger(row[columnIndex])
    const day = fullDate ? fullDate.day : (integer && integer <= 32 ? integer : null)
    if (day === null) {
      if (candidates.length) break
      continue
    }
    if (fullDate) {
      const headerMonth = { year: fullDate.year, month: fullDate.month }
      if (expectedMonth && (headerMonth.year !== expectedMonth.year || headerMonth.month !== expectedMonth.month)) {
        if (candidates.length) break
        continue
      }
      if (inferredMonth && (headerMonth.year !== inferredMonth.year || headerMonth.month !== inferredMonth.month)) {
        if (candidates.length) break
        continue
      }
      inferredMonth ||= headerMonth
    }
    candidates.push({ day, idx: columnIndex })
  }

  return { candidates, inferredMonth }
}

const longestConsecutiveDayRun = (candidates = [], preferredStart = null) => {
  if (!candidates.length) return []

  const runs = []
  let current = [candidates[0]]
  for (let index = 1; index < candidates.length; index += 1) {
    const item = candidates[index]
    if (item.day === current[current.length - 1].day + 1) {
      current.push(item)
      continue
    }
    runs.push(current)
    current = [item]
  }
  runs.push(current)

  const scored = runs
    .map(run => ({
      run,
      score: run.length * 100 + (preferredStart && run[0]?.day === preferredStart ? 10 : 0) + (run[0]?.day === 1 ? 1 : 0)
    }))
    .sort((left, right) => right.score - left.score)

  return scored[0]?.run || []
}

const findDaySequence = (row, totalWorkColumn, expectedMonth = null, options = {}) => {
  const preferredStart = Number(options.startDay) > 0 ? Number(options.startDay) : null
  const { candidates, inferredMonth } = collectDayCandidates(row, totalWorkColumn, expectedMonth)
  const columns = longestConsecutiveDayRun(candidates, preferredStart)
  return { columns, inferredMonth }
}

const inferSequenceColumn = (rows, headerRowIndex, beforeColumn) => {
  const labeledColumn = (rows[headerRowIndex] || []).findIndex((value, index) =>
    index < beforeColumn && ['stt', 'so thu tu'].includes(normalizedCell(value))
  )
  if (labeledColumn >= 0) return labeledColumn
  let best = null
  const sampleEnd = Math.min(rows.length, headerRowIndex + 31)
  for (let columnIndex = 0; columnIndex < beforeColumn; columnIndex += 1) {
    let numericCount = 0
    let populatedCount = 0
    for (let rowIndex = headerRowIndex + 1; rowIndex < sampleEnd; rowIndex += 1) {
      const value = rows[rowIndex]?.[columnIndex]
      if (String(value ?? '').trim()) populatedCount += 1
      if (exactPositiveInteger(value) !== null) numericCount += 1
    }
    if (numericCount >= 2 && (!best || numericCount > best.numericCount)) {
      best = { columnIndex, numericCount, populatedCount }
    }
  }
  return best?.columnIndex ?? -1
}

const summaryName = value => {
  const normalized = normalizedCell(value)
  return /^(?:tong(?: cong| sl| so)?$|tong (?:cong|sl|so)\b|cong$|binh quan\b|tuan\s*\d|danh sach\b|di muon\b|khong cham cong\b|nghi dot xuat\b|ky hieu\b|ghi chu\b)/.test(normalized)
}

const findEmployeeRows = (rows, headerRowIndex, columns, dayColumns) => {
  const employeeRowIndexes = []
  const missingNameRows = []
  const sttColumn = inferSequenceColumn(rows, headerRowIndex, columns.name)
  const scanEnd = rows.length
  let started = false

  for (let rowIndex = headerRowIndex + 1; rowIndex < scanEnd; rowIndex += 1) {
    const row = rows[rowIndex] || []
    const name = String(row[columns.name] ?? '').replace(/\s+/g, ' ').trim()
    const stt = sttColumn >= 0 ? exactPositiveInteger(row[sttColumn]) : null
    const hasAttendance = dayColumns.some(({ idx }) => String(row[idx] ?? '').trim() !== '')
    const hasMetadata = [columns.department, columns.shift]
      .some(columnIndex => columnIndex >= 0 && String(row[columnIndex] ?? '').trim())

    if (!name) {
      if (stt !== null) {
        started = true
        missingNameRows.push(rowIndex)
        continue
      }
      if (started) break
      continue
    }

    if (stt === null && summaryName(name)) {
      if (started) break
      continue
    }
    if (sttColumn >= 0 && stt === null && !hasAttendance && !hasMetadata) {
      if (started) break
      continue
    }
    if (!started && !hasAttendance && !hasMetadata && stt === null) continue

    started = true
    employeeRowIndexes.push(rowIndex)
  }

  return { employeeRowIndexes, missingNameRows, sttColumn }
}

/**
 * Detect the supported SpeeGo monthly attendance matrix by sheet structure.
 * Sheet/file names are deliberately ignored.
 */
export const detectMonthlyAttendanceMatrix = (rows = []) => {
  const emptyResult = {
    matched: false,
    kind: '',
    headerRowIndex: -1,
    columns: {},
    dayColumns: [],
    ignoredDayColumns: [],
    employeeRowIndexes: [],
    employeeCount: 0,
    month: null,
    year: null,
    yearMonth: '',
    errors: [],
    warnings: []
  }
  if (!Array.isArray(rows) || rows.length === 0) return emptyResult

  const scanLimit = Math.min(rows.length, 60)
  for (let headerRowIndex = 0; headerRowIndex < scanLimit; headerRowIndex += 1) {
    const row = rows[headerRowIndex] || []
    const columns = Object.fromEntries(
      Object.entries(REQUIRED_HEADERS).map(([field, aliases]) => [field, findHeaderColumn(row, aliases)])
    )
    if (Object.values(columns).some(index => index < 0)) continue

    Object.entries(OPTIONAL_HEADERS).forEach(([field, aliases]) => {
      columns[field] = findHeaderColumn(row, aliases)
    })

    const detectedMonth = detectMonthlyAttendanceMonth(rows, headerRowIndex)
    const explicitMonth = detectedMonth?.error ? null : detectedMonth
    const preferredStartDay = Number(explicitMonth?.startDay) > 0 ? Number(explicitMonth.startDay) : null
    const daySequence = findDaySequence(row, columns.totalWork, explicitMonth, {
      startDay: preferredStartDay
    })
    const rawDayColumns = daySequence.columns
    // A malformed in-sheet date range is authoritative and must not be hidden
    // by otherwise valid-looking date headers.
    const monthInfo = detectedMonth?.error ? null : (explicitMonth || daySequence.inferredMonth)
    const maxDay = monthInfo ? daysInMonth(monthInfo.year, monthInfo.month) : 31
    const rangeStart = preferredStartDay || 1
    const rangeEnd = Number(explicitMonth?.endDay) > 0
      ? Number(explicitMonth.endDay)
      : maxDay
    const isPartialRange = Boolean(
      explicitMonth?.source === 'date-range' &&
      (rangeStart > 1 || rangeEnd < maxDay)
    )
    // Full-month sheets need nearly all days; weekly/partial sheets only need
    // the consecutive days inside the declared range.
    const minimumDays = isPartialRange
      ? Math.max(1, rangeEnd - rangeStart + 1)
      : 28
    if (rawDayColumns.length < minimumDays) continue

    const errors = []
    if (!monthInfo) errors.push(detectedMonth?.error || 'Không xác định được tháng/năm từ khoảng ngày hoặc tiêu đề trong sheet.')
    const dayColumns = rawDayColumns.filter(column => column.day <= maxDay)
    const ignoredDayColumns = rawDayColumns.filter(column => column.day > maxDay)
    if (monthInfo && isPartialRange) {
      const firstDay = dayColumns[0]?.day
      const lastDay = dayColumns[dayColumns.length - 1]?.day
      if (
        firstDay !== rangeStart ||
        lastDay !== rangeEnd ||
        dayColumns.length !== (rangeEnd - rangeStart + 1)
      ) {
        errors.push(
          `Dãy ngày trong sheet chưa đủ ${rangeStart}–${rangeEnd} cho tuần/khoảng ngày tháng ${monthInfo.month}/${monthInfo.year}.`
        )
      }
    } else if (monthInfo && dayColumns.length !== maxDay) {
      errors.push(`Dãy ngày trong sheet chưa đủ 1–${maxDay} cho tháng ${monthInfo.month}/${monthInfo.year}.`)
    }

    const employeeArea = findEmployeeRows(rows, headerRowIndex, columns, dayColumns)
    employeeArea.missingNameRows.forEach(rowIndex => {
      errors.push(`Dòng ${rowIndex + 1}: không có Họ tên.`)
    })
    if (employeeArea.employeeRowIndexes.length === 0) {
      errors.push('Không tìm thấy dòng nhân viên hợp lệ trong bảng công.')
    }

    return {
      matched: true,
      kind: MONTHLY_ATTENDANCE_FORMAT,
      headerRowIndex,
      columns: { ...columns, stt: employeeArea.sttColumn },
      dayColumns,
      ignoredDayColumns,
      employeeRowIndexes: employeeArea.employeeRowIndexes,
      employeeCount: employeeArea.employeeRowIndexes.length,
      month: monthInfo?.month ?? null,
      year: monthInfo?.year ?? null,
      yearMonth: monthInfo
        ? `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}`
        : '',
      monthSource: monthInfo?.source || '',
      rangeStartDay: monthInfo ? (isPartialRange ? rangeStart : 1) : null,
      rangeEndDay: monthInfo ? (isPartialRange ? rangeEnd : maxDay) : null,
      isPartialRange,
      errors,
      warnings: []
    }
  }

  return emptyResult
}

export const isSupportedMonthlyAttendanceMatrix = rows =>
  detectMonthlyAttendanceMatrix(rows).matched

export const extractMonthlyAttendanceMatrix = (rows = [], detection = null) => {
  const resolved = detection || detectMonthlyAttendanceMatrix(rows)
  if (!resolved.matched) {
    return { employees: [], attendanceRows: [], warnings: [], errors: ['Không tìm thấy header bảng công tháng.'] }
  }

  const warnings = []
  const errors = [...(resolved.errors || [])]
  const employees = resolved.employeeRowIndexes.map(rowIndex => {
    const row = rows[rowIndex] || []
    const employeeName = String(row[resolved.columns.name] ?? '').replace(/\s+/g, ' ').trim()
    const department = String(row[resolved.columns.department] ?? '').replace(/\s+/g, ' ').trim()
    const shift = String(row[resolved.columns.shift] ?? '').replace(/\s+/g, ' ').trim()
    const employmentType = resolved.columns.employmentType >= 0
      ? String(row[resolved.columns.employmentType] ?? '').replace(/\s+/g, ' ').trim()
      : ''
    const employeeStatus = resolved.columns.employeeStatus >= 0
      ? String(row[resolved.columns.employeeStatus] ?? '').replace(/\s+/g, ' ').trim()
      : ''
    const totalWork = row[resolved.columns.totalWork]
    const stt = resolved.columns.stt >= 0 ? row[resolved.columns.stt] : ''
    const dailyValues = resolved.dayColumns.map(column => ({
      day: column.day,
      columnIndex: column.idx,
      rawValue: row[column.idx]
    }))

    if (!department) warnings.push(`Dòng ${rowIndex + 1}: thiếu Bộ phận.`)
    if (!shift) warnings.push(`Dòng ${rowIndex + 1}: thiếu Ca làm.`)
    if (dailyValues.every(item => String(item.rawValue ?? '').trim() === '')) {
      warnings.push(`Dòng ${rowIndex + 1}: ${employeeName} không có dữ liệu công theo ngày; không tạo bản ghi.`)
    }

    return {
      rowIndex,
      stt,
      employeeName,
      department,
      shift,
      employmentType,
      employeeStatus,
      totalWork,
      dailyValues
    }
  })

  const attendanceRows = employees.flatMap(employee =>
    employee.dailyValues
      .filter(item => String(item.rawValue ?? '').trim() !== '')
      .map(item => ({
        ...item,
        rowIndex: employee.rowIndex,
        employeeName: employee.employeeName,
        department: employee.department,
        shift: employee.shift,
        employmentType: employee.employmentType,
        employeeStatus: employee.employeeStatus,
        totalWork: employee.totalWork,
        date: resolved.yearMonth
          ? `${resolved.yearMonth}-${String(item.day).padStart(2, '0')}`
          : ''
      }))
  )

  return { employees, attendanceRows, warnings, errors }
}

/** Analyze all sheets and refuse to select implicitly when more than one matches. */
export const analyzeMonthlyAttendanceSheets = (sheets = [], requestedSheetName = '') => {
  const candidates = sheets
    .map(sheet => ({ ...sheet, detection: detectMonthlyAttendanceMatrix(sheet.rows || []) }))
    .filter(sheet => sheet.detection.matched)

  const selected = requestedSheetName
    ? candidates.find(candidate => candidate.sheetName === requestedSheetName) || null
    : (candidates.length === 1 ? candidates[0] : null)

  return {
    candidates,
    selected,
    requiresSelection: candidates.length > 1 && !selected
  }
}
