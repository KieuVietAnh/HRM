import assert from 'node:assert/strict'
import test from 'node:test'
import { makePayrollRecord, parsePayrollMoney, payrollAmounts, payrollSummaryTotals, pastePayrollCells, regularPayrollWorkdays } from './payrollSummary.js'

const record = (id = 'nv1') => ({ ...makePayrollRecord({ employeeId: id, workdays: 26 }), mainPay: 10000000 })

test('cộng cấu thành lương, chỉ trừ BHXH và đã ứng theo yêu cầu', () => {
  const values = payrollAmounts({ ...record(), overtimePay: 1500000, allowance: 500000, bonus: 1000000, otherIncome: 200000, insurance: 800000, advance: 2000000, penalty: 999999, tax: 999999 })
  assert.equal(values.gross, 13200000)
  assert.equal(values.net, 10400000)
  assert.equal(payrollAmounts({ ...record(), advance: 20000000 }).net, -10000000)
})

test('chấp nhận 0 và phân cách VNĐ, không biến tiền sai hoặc thiếu thành 0', () => {
  for (const text of ['12.000.000', '12,000,000', '12 000 000 đ', 12000000]) assert.equal(parsePayrollMoney(text), 12000000)
  assert.equal(parsePayrollMoney(''), null)
  assert.equal(parsePayrollMoney('0'), 0)
  for (const text of ['12tr', '-1', '1.5', '1,5', 'Infinity', '9007199254740992']) assert.throws(() => parsePayrollMoney(text))
  assert.equal(payrollAmounts(makePayrollRecord({ employeeId: 'a', overtimeHours: 1 })).gross, null)
  assert.equal(payrollAmounts({ ...record(), overtimePay: '' }).net, null)
  assert.equal(payrollAmounts({ ...record(), mainPay: 0, insurance: '', advance: '' }).net, 0)
  assert.throws(() => payrollAmounts({ ...record(), mainPay: Number.MAX_SAFE_INTEGER, bonus: 1 }))
})

test('tách công chính khỏi tăng ca, không tính tăng ca hai lần', () => {
  const row = { workdays: 1.5, overtimeHours: 4, days: new Map([['2026-11-01', { workdaysExact: 1.5, regularWorkdaysExact: 1, overtimeHours: 4 }]]) }
  assert.equal(regularPayrollWorkdays(row), 1)
  assert.equal(makePayrollRecord(row).overtimeHours, 4)
  assert.equal(regularPayrollWorkdays({ workdays: 1.5, overtimeHours: 4 }), null)
  assert.equal(regularPayrollWorkdays({ days: { a: { workdays: 1, paidLeaveWorkdays: 1 } } }), 1)
  assert.equal(makePayrollRecord({ employeeId: 'a' }, { tong_luong: 0 }).referenceSalary, 0)
})

test('dán nhiều nhân viên theo đúng thứ tự lọc; từ chối toàn vùng khi có lỗi', () => {
  const rows = [record('nv2'), record('nv1')]
  assert.deepEqual(pastePayrollCells('800.000\t2.000.000\r\n900000\t0\r\n', 0, 5, rows), {
    nv2: { insurance: 800000, advance: 2000000 }, nv1: { insurance: 900000, advance: 0 }
  })
  assert.deepEqual(pastePayrollCells('1000', 1, 6, rows), { nv1: { advance: 1000 } })
  assert.throws(() => pastePayrollCells('100\t200\n300\tabc', 0, 5, rows), /Dòng 2/)
  assert.throws(() => pastePayrollCells('1\t2', 0, 7, rows), /Vùng dán vượt/)
  assert.throws(() => pastePayrollCells('1\n2\n3', 0, 0, rows))
  assert.equal(rows[0].insurance, 0)
})

test('tổng theo các dòng đã lọc và đếm rõ nhân viên thiếu phân bổ', () => {
  const rows = [{ ...record(), advance: 1000000 }, { ...record('b'), mainPay: null, advance: 2000000 }]
  assert.deepEqual(payrollSummaryTotals(rows), { gross: 10000000, net: 9000000, insurance: 0, advance: 3000000, incomplete: 1,
    components: { mainPay: 10000000, overtimePay: 0, allowance: 0, bonus: 0, otherIncome: 0 } })
  assert.equal(payrollSummaryTotals(rows.slice(0, 1)).advance, 1000000)
  assert.throws(() => payrollSummaryTotals([{ ...record(), advance: 'sai' }]))
})

test('dán cả phân bổ lương và khấu trừ; ô lương trống giữ trạng thái chưa nhập', () => {
  const rows = [record('a'), record('b')]
  const patches = pastePayrollCells('10.000.000\t500000\t200000\t1000000\t0\t800000\t2000000\tĐã đối chiếu\n\t\t\t\t\t\t\t', 0, 0, rows)
  assert.deepEqual(patches.a, { mainPay: 10000000, overtimePay: 500000, allowance: 200000, bonus: 1000000, otherIncome: 0, insurance: 800000, advance: 2000000, note: 'Đã đối chiếu' })
  assert.equal(payrollAmounts({ ...rows[0], ...patches.a }).net, 8900000)
  assert.deepEqual(patches.b, { mainPay: null, overtimePay: null, allowance: 0, bonus: 0, otherIncome: 0, insurance: 0, advance: 0, note: '' })
})

test('đọc ghi chú có xuống dòng, tab và ngoặc kép do Excel bao lại', () => {
  assert.deepEqual(pastePayrollCells('"Dòng 1\r\nDòng 2\tghi ""chú"""\r\n', 0, 7, [record('a')]), { a: { note: 'Dòng 1\nDòng 2\tghi "chú"' } })
  assert.throws(() => pastePayrollCells('"Chưa đóng', 0, 7, [record()]), /thiếu dấu/)
  assert.throws(() => pastePayrollCells('"Đã đóng"sai', 0, 7, [record()]), /ngoặc kép/)
  assert.throws(() => pastePayrollCells('a'.repeat(1001), 0, 7, [record()]), /1.000 ký tự/)
  assert.throws(() => pastePayrollCells('1', -1, 0, [record()]), /Vùng dán vượt/)
})

test('tổng từng cấu thành không được vượt giới hạn kể cả dòng chưa đủ lương', () => {
  const row = { ...record(), mainPay: Number.MAX_SAFE_INTEGER, overtimePay: null }
  assert.throws(() => payrollSummaryTotals([row, { ...row, mainPay: 1 }]), /vượt giới hạn/)
})
