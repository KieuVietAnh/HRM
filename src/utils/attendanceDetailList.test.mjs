import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import XLSX from 'xlsx-js-style'
import { expandAttendanceMergedCells } from './attendanceImport.js'
import { analyzeAttendanceDetailSheets, detectAttendanceDetailList } from './attendanceDetailList.js'

const rowsFor = headers => [
  ['CHI TIẾT CHẤM CÔNG'],
  ['Từ ngày 01/08/2026 đến ngày 31/08/2026'],
  headers,
  ['00001', 'Nguyễn Văn A', 'MKT', 'Nhân viên', 46235, 'Bảy', '08:00', '17:00', '', '', '', '', 1, 8, 0, 0, 0, 0, 0, 0, 0, 'HC', '', '', 8]
]
const headers = ['Mã N.Viên', 'Tên nhân viên', 'Phòng ban', 'Chức vụ', 'Ngày', 'Thứ', 'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2', 'Vào 3', 'Ra 3', 'Công', 'Giờ', 'Công+', 'Giờ+', 'Vào Trễ', 'Ra sớm', 'TC1', 'TC2', 'TC3', 'Tên ca', 'Kí hiệu', 'Kí hiệu+', 'Tổng giờ']

test('detects only the explicit daily attendance detail signature', () => {
  const result = detectAttendanceDetailList(rowsFor(headers))
  assert.equal(result.matched, true)
  assert.equal(result.headerRowIndex, 2)
  assert.equal(result.employeeCount, 1)
  assert.equal(result.rowCount, 1)
  assert.equal(result.yearMonth, '2026-08')
})

test('does not enable generic list import without the exact detail title and fields', () => {
  assert.equal(detectAttendanceDetailList(rowsFor(headers).slice(1)).matched, false)
  assert.equal(detectAttendanceDetailList(rowsFor(headers.filter(header => header !== 'Tổng giờ'))).matched, false)
})

test('requires explicit selection when multiple detail sheets match', () => {
  const analysis = analyzeAttendanceDetailSheets([
    { sheetName: 'A', rows: rowsFor(headers) },
    { sheetName: 'B', rows: rowsFor(headers) }
  ])
  assert.equal(analysis.candidates.length, 2)
  assert.equal(analysis.requiresSelection, true)
})

test('recognizes the supplied daily-detail workbook', { skip: !process.env.DETAIL_ATTENDANCE_FILE }, () => {
  const workbook = XLSX.read(readFileSync(process.env.DETAIL_ATTENDANCE_FILE), { type: 'buffer', cellNF: true, cellDates: false })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = expandAttendanceMergedCells(
    XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '', blankrows: true }),
    worksheet['!merges'] || []
  )
  const result = detectAttendanceDetailList(rows)
  assert.equal(workbook.SheetNames[0], 'Xuất lưới')
  assert.equal(result.matched, true)
  assert.equal(result.employeeCount, 34)
  assert.equal(result.dayCount, 31)
  assert.equal(result.rowCount, 1054)
  assert.equal(result.yearMonth, '2026-08')
  assert.deepEqual(result.errors, [])
})
