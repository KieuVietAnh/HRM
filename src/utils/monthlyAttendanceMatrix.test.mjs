import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import XLSX from 'xlsx-js-style'
import { expandAttendanceMergedCells } from './attendanceImport.js'
import {
  analyzeMonthlyAttendanceSheets,
  detectMonthlyAttendanceMatrix,
  detectMonthlyAttendanceMonth,
  extractMonthlyAttendanceMatrix,
  isSupportedMonthlyAttendanceMatrix
} from './monthlyAttendanceMatrix.js'

const createMatrix = ({
  month = 8,
  year = 2026,
  title = `BẢNG CÔNG T${month}/${year}`,
  range = `1/${month}/${year} - 31/${month}/${year}`,
  headerDays = Array.from({ length: 32 }, (_, index) => index + 1),
  leadingColumns = [],
  employees = null,
  includeDepartment = true,
  includeShift = true,
  includeTotalWork = true
} = {}) => {
  const baseHeaders = [
    'STT', 'Xác nhận', 'Họ tên',
    includeDepartment ? 'Bộ phận' : 'Phòng',
    includeShift ? 'Ca làm' : 'Lịch',
    'Loại HĐ', 'Trạng thái',
    includeTotalWork ? 'Tổng công' : 'Công cộng',
    ...headerDays
  ]
  const values = Array.from({ length: headerDays.length }, (_, index) => {
    if (index === 0) return 1
    if (index === 1) return 0.5
    return 'X'
  })
  const sourceEmployees = employees || [{
    stt: 1,
    name: 'Nguyễn Văn A',
    department: 'MKT',
    shift: 'Ca ngày',
    employmentType: 'Chính thức',
    status: 'Đang làm',
    totalWork: 1.5,
    values
  }]
  const pad = row => [...leadingColumns.map(() => ''), ...row]
  const employeeRows = sourceEmployees.map(employee => pad([
    employee.stt,
    '',
    employee.name,
    employee.department,
    employee.shift,
    employee.employmentType,
    employee.status,
    employee.totalWork,
    ...(employee.values || values)
  ]))

  return [
    pad(['', '', '', title]),
    pad(['', '', '', range]),
    pad(['', '', 'Thông tin nhân sự']),
    [],
    pad(baseHeaders),
    ...employeeRows,
    [],
    pad(['', '', 'Tuần 1', 'Đi muộn', '', '', '', '', 99, 98, 97]),
    pad(['', '', 'Danh sách VP', 'Không chấm công'])
  ]
}

test('detects the supported monthly attendance matrix by structure', () => {
  const rows = createMatrix()
  const result = detectMonthlyAttendanceMatrix(rows)

  assert.equal(result.matched, true)
  assert.equal(result.kind, 'monthly-attendance-matrix')
  assert.equal(isSupportedMonthlyAttendanceMatrix(rows), true)
})

test('finds the real header row without hard-coding row 6', () => {
  const rows = [['Ghi chú thêm'], ...createMatrix()]
  const result = detectMonthlyAttendanceMatrix(rows)

  assert.equal(result.headerRowIndex, 5)
  assert.equal(result.columns.name, 2)
})

test('survives columns inserted before the employee fields', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix({ leadingColumns: ['A', 'B'] }))

  assert.equal(result.columns.name, 4)
  assert.equal(result.columns.department, 5)
  assert.equal(result.columns.shift, 6)
})

test('prefers the in-sheet date range over a conflicting title', () => {
  const rows = createMatrix({ title: 'BẢNG CÔNG T7/2026' })
  const result = detectMonthlyAttendanceMatrix(rows)

  assert.equal(result.yearMonth, '2026-08')
  assert.equal(result.monthSource, 'date-range')
})

test('falls back to the in-sheet title and never needs a filename', () => {
  const rows = createMatrix({ range: '', title: 'BẢNG CÔNG T82026' })

  assert.deepEqual(detectMonthlyAttendanceMonth(rows, 4), {
    year: 2026,
    month: 8,
    source: 'title',
    rowIndex: 0
  })
})

test('reports an error when month and year are absent', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix({ title: '', range: '' }))

  assert.equal(result.matched, true)
  assert.ok(result.errors.some(error => error.includes('tháng/năm')))
})

test('rejects sheets missing a required structural header', () => {
  assert.equal(detectMonthlyAttendanceMatrix(createMatrix({ includeDepartment: false })).matched, false)
  assert.equal(detectMonthlyAttendanceMatrix(createMatrix({ includeShift: false })).matched, false)
  assert.equal(detectMonthlyAttendanceMatrix(createMatrix({ includeTotalWork: false })).matched, false)
})

test('detects days 1-31 and ignores the template day 32', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix())

  assert.deepEqual(result.dayColumns.map(column => column.day), Array.from({ length: 31 }, (_, index) => index + 1))
  assert.deepEqual(result.ignoredDayColumns.map(column => column.day), [32])
})

test('accepts a descriptive Tổng công header from the same workbook family', () => {
  const rows = createMatrix()
  rows[4][7] = 'Tổng công ngày thường + Lễ'

  assert.equal(detectMonthlyAttendanceMatrix(rows).matched, true)
})

test('filters invalid February days instead of creating 29-31 February', () => {
  const rows = createMatrix({
    month: 2,
    range: '1/2/2026 - 28/2/2026',
    title: 'BẢNG CÔNG T2/2026'
  })
  const result = detectMonthlyAttendanceMatrix(rows)

  assert.equal(result.dayColumns.length, 28)
  assert.deepEqual(result.ignoredDayColumns.map(column => column.day), [29, 30, 31, 32])
})

test('extracts employee fields and does not require an employee code', () => {
  const rows = createMatrix()
  const detection = detectMonthlyAttendanceMatrix(rows)
  const employee = extractMonthlyAttendanceMatrix(rows, detection).employees[0]

  assert.equal(employee.employeeName, 'Nguyễn Văn A')
  assert.equal(employee.department, 'MKT')
  assert.equal(employee.shift, 'Ca ngày')
  assert.equal(employee.employmentType, 'Chính thức')
  assert.equal(employee.employeeStatus, 'Đang làm')
  assert.equal(employee.totalWork, 1.5)
  assert.equal(Object.hasOwn(employee, 'employeeCode'), false)
})

test('normalizes daily 1, 0.5 and X values to the correct August dates', () => {
  const rows = createMatrix()
  const detection = detectMonthlyAttendanceMatrix(rows)
  const records = extractMonthlyAttendanceMatrix(rows, detection).attendanceRows

  assert.deepEqual(records.slice(0, 3).map(record => ({ date: record.date, raw: record.rawValue })), [
    { date: '2026-08-01', raw: 1 },
    { date: '2026-08-02', raw: 0.5 },
    { date: '2026-08-03', raw: 'X' }
  ])
})

test('stops before weekly statistics and violation-list sections', () => {
  const rows = createMatrix()
  const result = detectMonthlyAttendanceMatrix(rows)
  const extracted = extractMonthlyAttendanceMatrix(rows, result)

  assert.equal(result.employeeCount, 1)
  assert.equal(extracted.employees.some(employee => employee.employeeName === 'Tuần 1'), false)
  assert.equal(extracted.employees.some(employee => employee.employeeName === 'Danh sách VP'), false)
})

test('accepts a weekly/partial date range without requiring the full month columns', () => {
  const weekDays = [8, 9, 10, 11, 12, 13, 14]
  const rows = createMatrix({
    month: 10,
    year: 2026,
    title: 'BẢNG CÔNG TUẦN 2 T10/2026',
    range: '8/10/2026 - 14/10/2026',
    headerDays: weekDays,
    employees: [{
      stt: 1,
      name: 'Nguyễn Văn A',
      department: 'MKT',
      shift: 'Ca ngày',
      employmentType: 'Chính thức',
      status: 'Đang làm',
      totalWork: 5,
      values: [1, 1, 1, 0.5, 1, 'X', 'X']
    }]
  })
  const result = detectMonthlyAttendanceMatrix(rows)
  const extracted = extractMonthlyAttendanceMatrix(rows, result)

  assert.equal(result.matched, true)
  assert.equal(result.isPartialRange, true)
  assert.equal(result.yearMonth, '2026-10')
  assert.equal(result.rangeStartDay, 8)
  assert.equal(result.rangeEndDay, 14)
  assert.deepEqual(result.dayColumns.map(column => column.day), weekDays)
  assert.equal(result.errors.length, 0)
  assert.deepEqual(extracted.attendanceRows.map(record => record.date), [
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
    '2026-10-12',
    '2026-10-13',
    '2026-10-14'
  ])
})

test('warns for missing department and shift without dropping the employee', () => {
  const rows = createMatrix({
    employees: [{ stt: 1, name: 'Nguyễn Văn B', department: '', shift: '', totalWork: 0 }]
  })
  const detection = detectMonthlyAttendanceMatrix(rows)
  const extracted = extractMonthlyAttendanceMatrix(rows, detection)

  assert.equal(extracted.employees.length, 1)
  assert.ok(extracted.warnings.some(warning => warning.includes('Bộ phận')))
  assert.ok(extracted.warnings.some(warning => warning.includes('Ca làm')))
})

test('reports a numbered employee row that has no name', () => {
  const rows = createMatrix({
    employees: [
      { stt: 1, name: 'Nguyễn Văn A', department: 'MKT', shift: 'Ca ngày' },
      { stt: 2, name: '', department: 'Sale', shift: 'Ca ngày' }
    ]
  })
  const result = detectMonthlyAttendanceMatrix(rows)

  assert.ok(result.errors.some(error => error.includes('không có Họ tên')))
})

test('requires an explicit sheet selection when several sheets match', () => {
  const analysis = analyzeMonthlyAttendanceSheets([
    { sheetName: 'Tháng 8', rows: createMatrix() },
    { sheetName: 'Tháng 9', rows: createMatrix({ month: 9, title: 'BẢNG CÔNG T9/2026', range: '1/9/2026 - 30/9/2026', headerDays: Array.from({ length: 30 }, (_, index) => index + 1) }) },
    { sheetName: 'Hướng dẫn', rows: [['Hướng dẫn sử dụng']] }
  ])

  assert.equal(analysis.candidates.length, 2)
  assert.equal(analysis.selected, null)
  assert.equal(analysis.requiresSelection, true)
})

test('selects only the requested supported sheet', () => {
  const sheets = [
    { sheetName: 'Tháng 8', rows: createMatrix() },
    { sheetName: 'Tháng 9', rows: createMatrix({ month: 9, title: 'BẢNG CÔNG T9/2026', range: '1/9/2026 - 30/9/2026', headerDays: Array.from({ length: 30 }, (_, index) => index + 1) }) }
  ]
  const analysis = analyzeMonthlyAttendanceSheets(sheets, 'Tháng 9')

  assert.equal(analysis.selected.sheetName, 'Tháng 9')
  assert.equal(analysis.selected.detection.yearMonth, '2026-09')
  assert.equal(analysis.requiresSelection, false)
})

test('recognizes the checked-in August workbook fixture', () => {
  const bytes = readFileSync(new URL('../../BANG_CONG_THANG_8_2026_TEST.xlsx', import.meta.url))
  const workbook = XLSX.read(bytes, { type: 'buffer', cellNF: true, cellDates: false })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = expandAttendanceMergedCells(
    XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' }),
    worksheet['!merges'] || []
  )
  const detection = detectMonthlyAttendanceMatrix(rows)

  assert.equal(detection.matched, true)
  assert.equal(detection.headerRowIndex, 5)
  assert.equal(detection.yearMonth, '2026-08')
  assert.equal(detection.dayColumns.length, 31)
  assert.ok(detection.employeeCount > 0)
})

test('rejects an invalid date range rather than silently trusting the title', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix({ range: '1/2/2026 - 31/2/2026' }))
  assert.equal(result.yearMonth, '')
  assert.ok(result.errors.some(error => error.includes('Khoảng ngày')))
})

test('does not interpret dates inside employee records as the sheet month', () => {
  const rows = createMatrix({ title: '', range: '' })
  rows[5][5] = '1/9/2026 - 30/9/2026'
  assert.equal(detectMonthlyAttendanceMatrix(rows).yearMonth, '')
})

test('employees named Tong or Cong are not mistaken for summary sections', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix({ employees: [
    { stt: 1, name: 'Tống Văn An', department: 'Sale', shift: 'Ca ngày' },
    { stt: 2, name: 'Công Văn Bình', department: 'Sale', shift: 'Ca đêm' }
  ] }))
  assert.equal(result.employeeCount, 2)
})

test('does not truncate a larger contiguous employee table at 500 rows', () => {
  const result = detectMonthlyAttendanceMatrix(createMatrix({ employees: Array.from({ length: 520 }, (_, i) => ({
    stt: i + 1, name: `Nhân Viên ${i}`, department: 'Sale', shift: 'Ca ngày'
  })) }))
  assert.equal(result.employeeCount, 520)
})

test('validates leap-year February and a labeled STT row with a missing name', () => {
  const leapYear = detectMonthlyAttendanceMatrix(createMatrix({ year: 2028, month: 2, range: '1/2/2028 - 29/2/2028' }))
  assert.equal(leapYear.dayColumns.length, 29)
  const missingName = detectMonthlyAttendanceMatrix(createMatrix({ employees: [
    { stt: 1, name: '', department: 'Sale', shift: 'Ca ngày' }
  ] }))
  assert.ok(missingName.errors.some(error => error.includes('không có Họ tên')))
})

test('accepts consecutive full Excel dates as day headers', () => {
  const rows = createMatrix()
  const firstDayColumn = 8
  Array.from({ length: 32 }, (_, index) => index).forEach(index => {
    rows[4][firstDayColumn + index] = 46235 + index
  })
  const result = detectMonthlyAttendanceMatrix(rows)
  assert.equal(result.matched, true)
  assert.equal(result.yearMonth, '2026-08')
  assert.deepEqual(result.dayColumns.map(column => column.day), Array.from({ length: 31 }, (_, index) => index + 1))
  assert.deepEqual(result.ignoredDayColumns.map(column => column.day), [])
})

test('can infer month from consecutive full date headers when title and range are absent', () => {
  const rows = createMatrix({ title: '', range: '', headerDays: Array.from({ length: 31 }, (_, index) =>
    `${String(index + 1).padStart(2, '0')}/08/2026`
  ) })
  const result = detectMonthlyAttendanceMatrix(rows)
  assert.equal(result.matched, true)
  assert.equal(result.yearMonth, '2026-08')
  assert.equal(result.monthSource, '')
  assert.equal(result.dayColumns.length, 31)
})

test('recognizes the replacement attendance workbook with full-date headers', {
  skip: !process.env.NEW_ATTENDANCE_FILE
}, () => {
  const bytes = readFileSync(process.env.NEW_ATTENDANCE_FILE)
  const workbook = XLSX.read(bytes, { type: 'buffer', cellNF: true, cellDates: false })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = expandAttendanceMergedCells(
    XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '', blankrows: true }),
    worksheet['!merges'] || []
  )
  const detection = detectMonthlyAttendanceMatrix(rows)
  const extracted = extractMonthlyAttendanceMatrix(rows, detection)
  assert.equal(workbook.SheetNames[0], 'Trang tính1')
  assert.equal(detection.yearMonth, '2026-08')
  assert.equal(detection.employeeCount, 34)
  assert.equal(detection.dayColumns.length, 31)
  assert.equal(extracted.attendanceRows.length, 1054)
  assert.equal(extracted.employees[0].employeeName, 'Nguyễn Minh Nhựt')
  assert.equal(extracted.employees[33].employeeName, 'Mai Văn Tuấn')
})

test('invalid authoritative range still blocks full-date headers', () => {
  const rows = createMatrix({ range: '1/8/2026 - 32/8/2026' })
  Array.from({ length: 32 }, (_, index) => index).forEach(index => {
    rows[4][8 + index] = 46235 + index
  })
  const result = detectMonthlyAttendanceMatrix(rows)
  assert.equal(result.yearMonth, '')
  assert.ok(result.errors.some(error => error.includes('Khoảng ngày')))
})
