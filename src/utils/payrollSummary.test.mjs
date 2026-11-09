import assert from 'node:assert/strict'
import test from 'node:test'
import { makePayrollRecord, parsePayrollMoney, payrollAmounts, payrollSummaryTotals, pastePayrollDeductions, regularPayrollWorkdays } from './payrollSummary.js'

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
  assert.deepEqual(pastePayrollDeductions('800.000\t2.000.000\r\n900000\t0\r\n', 0, 0, rows), {
    nv2: { insurance: 800000, advance: 2000000 }, nv1: { insurance: 900000, advance: 0 }
  })
  assert.deepEqual(pastePayrollDeductions('1000', 1, 1, rows), { nv1: { advance: 1000 } })
  assert.throws(() => pastePayrollDeductions('100\t200\n300\tabc', 0, 0, rows), /Dòng 2/)
  assert.throws(() => pastePayrollDeductions('1\t2', 0, 1, rows), /hai cột/)
  assert.throws(() => pastePayrollDeductions('1\n2\n3', 0, 0, rows))
  assert.equal(rows[0].insurance, 0)
})

test('tổng theo các dòng đã lọc và đếm rõ nhân viên thiếu phân bổ', () => {
  const rows = [{ ...record(), advance: 1000000 }, { ...record('b'), mainPay: null, advance: 2000000 }]
  assert.deepEqual(payrollSummaryTotals(rows), { gross: 10000000, net: 9000000, insurance: 0, advance: 3000000, incomplete: 1 })
  assert.equal(payrollSummaryTotals(rows.slice(0, 1)).advance, 1000000)
  assert.throws(() => payrollSummaryTotals([{ ...record(), advance: 'sai' }]))
})
