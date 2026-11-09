import assert from 'node:assert/strict'
import path from 'node:path'
import XLSX from 'xlsx'
import {
  calculateAttendanceTiming,
  formatAttendanceTime
} from '../src/utils/attendanceShift.js'

const source = path.resolve(process.argv[2] || '../TONG_CONG_THANG_8.xlsx')
const workbook = XLSX.readFile(source, { cellDates: false })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
const headers = rows[2].map(value => String(value || '').trim().toLowerCase())
const indexOf = name => headers.indexOf(name.toLowerCase())

const columns = {
  code: indexOf('mã n.viên'),
  name: indexOf('tên nhân viên'),
  date: indexOf('ngày'),
  checkIn: indexOf('vào 1'),
  checkOut: indexOf('ra 1')
}

const findRow = (code, checkIn) => rows.slice(3).find(row =>
  String(row[columns.code]) === code && String(row[columns.checkIn]) === checkIn
)

const verify = ({ code, checkIn, employee, expectedLate, expectedEarly }) => {
  const row = findRow(code, checkIn)
  assert.ok(row, `Không tìm thấy dòng ${code} - ${checkIn}`)
  const actualIn = String(row[columns.checkIn])
  const actualOut = String(row[columns.checkOut])
  const htmlIn = formatAttendanceTime(actualIn)
  const htmlOut = formatAttendanceTime(actualOut)
  const timing = calculateAttendanceTiming({ employee, checkIn: actualIn, checkOut: actualOut })

  assert.equal(htmlIn, actualIn)
  assert.equal(htmlOut, actualOut)
  assert.equal(timing.lateMinutes, expectedLate)
  assert.equal(timing.earlyMinutes, expectedEarly)
  console.log(JSON.stringify({
    employee: row[columns.name],
    excelCheckIn: actualIn,
    htmlCheckIn: htmlIn,
    excelCheckOut: actualOut,
    htmlCheckOut: htmlOut,
    shift: `${timing.shift.start}-${timing.shift.end}`,
    lateMinutes: timing.lateMinutes,
    earlyMinutes: timing.earlyMinutes
  }))
}

verify({
  code: '00001',
  checkIn: '08:35',
  employee: { position: 'HR', shift: 'Ca ngày' },
  expectedLate: 5,
  expectedEarly: 0
})

verify({
  code: '00002',
  checkIn: '04:02',
  employee: { department: 'Trang', position: 'Sale', shift: 'Ca ngày' },
  expectedLate: 2,
  expectedEarly: 0
})
