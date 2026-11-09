import assert from 'node:assert/strict'
import path from 'node:path'
import ExcelJS from 'exceljs'

const [, , sourceArg, outputArg, employeeCountArg] = process.argv
if (!sourceArg || !outputArg) {
  throw new Error('Usage: node scripts/validate-attendance-workbook.mjs <golden.xlsx> <output.xlsx>')
}

const load = async (file) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path.resolve(file))
  return workbook
}

const [golden, output] = await Promise.all([load(sourceArg), load(outputArg)])
assert.equal(output.worksheets.length, golden.worksheets.length, 'Số sheet phải giống golden template')
const source = golden.worksheets[0]
const target = output.worksheets[0]
const employeeCount = employeeCountArg === undefined ? 25 : Number(employeeCountArg)
assert.ok(Number.isInteger(employeeCount) && employeeCount >= 0, 'Số nhân viên kiểm tra không hợp lệ')
const normalizeMetadata = (value) => {
  if (Array.isArray(value)) return value.map(normalizeMetadata)
  if (!value || typeof value !== 'object') return value
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null && entry !== false)
      .map(([key, entry]) => [key, normalizeMetadata(entry)])
      .filter(([, entry]) => !(entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 0))
  )
  return normalized
}
assert.equal(target.name, source.name, 'Tên sheet phải giữ nguyên')

for (let column = 1; column <= 70; column += 1) {
  assert.equal(target.getColumn(column).width, source.getColumn(column).width, `Sai width cột ${column}`)
}
for (let row = 1; row <= 6; row += 1) {
  for (let column = 1; column <= 70; column += 1) {
    const expected = source.getCell(row, column)
    const actual = target.getCell(row, column)
    assert.deepEqual(normalizeMetadata(actual.style), normalizeMetadata(expected.style), `Sai style header ${actual.address}`)
  }
}
for (let column = 1; column <= 66; column += 1) {
  assert.deepEqual(normalizeMetadata(target.getCell(7, column).style), normalizeMetadata(source.getCell(7, column).style), `Sai style dòng NV cột ${column}`)
}

assert.deepEqual(normalizeMetadata(target.views), normalizeMetadata(source.views), 'Freeze panes/view phải giữ nguyên')
assert.deepEqual(normalizeMetadata(target.pageSetup), normalizeMetadata(source.pageSetup), 'Page setup phải giữ nguyên')
assert.deepEqual(normalizeMetadata(target.pageMargins), normalizeMetadata(source.pageMargins), 'Margins phải giữ nguyên')
assert.equal(target.getCell('AJ2').value, 'BẢNG CÔNG T7/2026', 'Sai tiêu đề tháng')
assert.equal(target.getCell('AL4').value, '1/7/2026 - 31/7/2026', 'Sai khoảng ngày')
assert.equal(target.getCell('AJ5').value, 'T4', 'Sai thứ ngày 1/7/2026')
assert.equal(target.getCell('BN6').value, 31, 'Thiếu ngày 31')

const headerMerges = (worksheet) => Object.values(worksheet._merges)
  .map(item => item.model)
  .filter(item => item.top < 7)
  .map(item => `${item.top}:${item.left}:${item.bottom}:${item.right}`)
  .sort()
const sourceHeaderMerges = headerMerges(source)
const targetHeaderMerges = headerMerges(target)
assert.deepEqual(targetHeaderMerges, sourceHeaderMerges, 'Merge vùng header phải giữ nguyên')

const rowDelta = employeeCount - 25
const mergeKeys = (worksheet, minimumRow, delta = 0) => Object.values(worksheet._merges)
  .map(item => item.model)
  .filter(item => item.top >= minimumRow)
  .map(item => `${item.top + delta}:${item.left}:${item.bottom + delta}:${item.right}`)
  .sort()
assert.deepEqual(
  mergeKeys(target, 33 + rowDelta),
  mergeKeys(source, 33, rowDelta),
  'Merge vùng tổng hợp/legend phải dịch đúng theo số nhân viên'
)
const summaryStartRow = 33 + rowDelta
assert.match(String(target.getCell(`AJ${summaryStartRow}`).value), /^Tuần 1/, 'Sai vị trí vùng tổng hợp tuần')
if (employeeCount > 25) {
  for (let column = 1; column <= 66; column += 1) {
    assert.deepEqual(
      normalizeMetadata(target.getCell(6 + employeeCount, column).style),
      normalizeMetadata(source.getCell(7, column).style),
      `Sai style dòng nhân viên mở rộng cột ${column}`
    )
  }
}

console.log(JSON.stringify({
  valid: true,
  sheet: target.name,
  headerStylesChecked: 420,
  employeeStylesChecked: 66,
  employeeCount,
  mergeCount: Object.keys(target._merges).length
}))
