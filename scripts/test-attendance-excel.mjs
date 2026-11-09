import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { buildAttendanceWorkbook } from '../src/utils/attendanceExcel.js'

const template = await fs.readFile('public/templates/attendance-report-template.xlsx')
const cases = [
  ['2027-02', 28],
  ['2028-02', 29],
  ['2026-04', 30],
  ['2026-07', 31]
]

for (const [month, days] of cases) {
  const workbook = await buildAttendanceWorkbook(template, [], month)
  const [year, monthNumber] = month.split('-').map(Number)
  const sheet = workbook.getWorksheet(`THÁNG ${monthNumber}`)
  assert.ok(sheet, `${month}: sai tên sheet động`)
  assert.equal(sheet.getCell('AL4').value, `1/${monthNumber}/${year} - ${days}/${monthNumber}/${year}`)
  for (let day = 1; day <= 31; day += 1) {
    const column = sheet.getColumn(36 + day - 1)
    assert.equal(column.hidden, day > days, `${month}: trạng thái ẩn sai ở ngày ${day}`)
    assert.equal(sheet.getCell(6, 36 + day - 1).value, day <= days ? day : null)
  }
  assert.equal(sheet.getCell('C7').value, null, `${month}: còn sót nhân viên mẫu`)
}

console.log(JSON.stringify({ valid: true, monthLengths: cases.map(([, days]) => days) }))
