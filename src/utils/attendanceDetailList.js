import {
  findAttendanceListHeader,
  normalizeAttendanceHeader,
  parseAttendanceDate
} from './attendanceImport.js'

export const ATTENDANCE_DETAIL_LIST_FORMAT = 'attendance-detail-list'

const titleMatches = rows => rows.slice(0, 10).some(row =>
  row.some(cell => normalizeAttendanceHeader(cell) === 'chi tiet cham cong')
)

/** Detect only the exported daily-detail layout, never an arbitrary mapped list. */
export const detectAttendanceDetailList = (rows = [], options = {}) => {
  const empty = {
    matched: false, kind: '', headerRowIndex: -1, columns: {},
    dataRowIndexes: [], employeeCount: 0, rowCount: 0,
    yearMonth: '', errors: [], warnings: []
  }
  if (!Array.isArray(rows) || !titleMatches(rows)) return empty
  const header = findAttendanceListHeader(rows)
  if (!header || header.format !== 'full') return empty
  const required = ['code', 'name', 'department', 'date', 'workdays', 'hours', 'shift', 'symbol', 'totalHours']
  if (required.some(field => header.columns[field] < 0) || header.punches.allIndexes.length < 2) return empty

  const errors = []
  const dataRowIndexes = []
  const employees = new Set()
  const months = new Set()
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || []
    const code = String(row[header.columns.code] ?? '').trim()
    const name = String(row[header.columns.name] ?? '').replace(/\s+/g, ' ').trim()
    const dateRaw = row[header.columns.date]
    if (!code && !name && String(dateRaw ?? '').trim() === '') continue
    if (!code || !name) {
      errors.push(`Dòng ${rowIndex + 1}: thiếu Mã N.Viên hoặc Tên nhân viên.`)
      continue
    }
    const date = parseAttendanceDate(dateRaw, options)
    if (!date) {
      errors.push(`Dòng ${rowIndex + 1}: ngày không hợp lệ (${dateRaw}).`)
      continue
    }
    dataRowIndexes.push(rowIndex)
    employees.add(code || name)
    months.add(date.slice(0, 7))
  }
  if (months.size > 1) errors.push('File chi tiết chứa dữ liệu của nhiều tháng; hãy tách file trước khi import.')
  if (!dataRowIndexes.length) errors.push('Không tìm thấy dòng chấm công hợp lệ.')
  return {
    matched: true,
    kind: ATTENDANCE_DETAIL_LIST_FORMAT,
    headerRowIndex: header.rowIndex,
    columns: header.columns,
    punches: header.punches,
    dataRowIndexes,
    employeeCount: employees.size,
    rowCount: dataRowIndexes.length,
    dayCount: new Set(dataRowIndexes.map(index =>
      parseAttendanceDate(rows[index][header.columns.date], options)
    )).size,
    yearMonth: months.size === 1 ? [...months][0] : '',
    errors,
    warnings: []
  }
}

export const analyzeAttendanceDetailSheets = (sheets = [], requestedSheetName = '', options = {}) => {
  const candidates = sheets.map(sheet => ({
    ...sheet,
    detailDetection: detectAttendanceDetailList(sheet.rows || [], options)
  })).filter(sheet => sheet.detailDetection.matched)
  const selected = requestedSheetName
    ? candidates.find(candidate => candidate.sheetName === requestedSheetName) || null
    : (candidates.length === 1 ? candidates[0] : null)
  return { candidates, selected, requiresSelection: candidates.length > 1 && !selected }
}
