import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePayrollSalary, calculatePayrollKpi, parseSalaryAmount } from './payrollSalary.js'

const days = (month, count) => new Map(Array.from({ length: count }, (_, i) => [
  `${month}-${String(i + 1).padStart(2, '0')}`, { workdays: 1 }
]))
const rate = (effectiveDate, amount, probationPercent = 100) => ({ effectiveDate, amount, probationPercent })

test('mức lương theo tháng không đổi khi hồ sơ hiện tại thay đổi', () => {
  const history = [rate('2026-09-01', 12000000), rate('2026-10-01', 13000000)]
  const employee = { tong_luong: 99000000 }
  assert.equal(calculatePayrollSalary({ days: days('2026-09', 26) }, history, employee, '2026-09', 26).amount, 12000000)
  assert.equal(calculatePayrollSalary({ days: days('2026-10', 26) }, history, employee, '2026-10', 26).amount, 13000000)
})

test('10 công thử việc 80%, từ ngày 11 hưởng lương chính thức', () => {
  const result = calculatePayrollSalary({ days: days('2026-11', 26) }, [rate('2026-11-01', 13000000, 80)],
    { ngay_lam_chinh_thuc: '2026-11-11' }, '2026-11', 26)
  assert.equal(result.amount, 12000000)
  assert.deepEqual(result.segments.map(s => [s.workdays, s.percent]), [[10, 80], [16, 100]])
})

test('đổi lương giữa tháng, công lẻ và công nghỉ hưởng lương', () => {
  const row = { days: { '2026-11-10': { workdaysExact: 0.5 }, '2026-11-11': { workdays: 1, paidLeaveWorkdays: 1 } } }
  const result = calculatePayrollSalary(row, [rate('2026-11-01', 12000000), rate('2026-11-11', 15000000)], {}, '2026-11', 30)
  assert.equal(result.amount, 700000)
})

test('không tự lấy lương hiện tại khi thiếu lịch sử hoặc thiếu chi tiết công', () => {
  const row = { days: days('2026-09', 1) }
  assert.equal(calculatePayrollSalary(row, [rate('2026-10-01', 13000000)], { tong_luong: 13000000 }, '2026-09', 26).amount, null)
  assert.equal(calculatePayrollSalary({ workdays: 1 }, [], {}, '2026-09', 26).amount, null)
  assert.equal(calculatePayrollSalary(row, [], {}, '2026-09', 0).amount, null)
  assert.equal(calculatePayrollSalary({ ...row, workdays: 2 }, [rate('2026-09-01', 100)], {}, '2026-09', 26).amount, null)
})

test('lương 0 hợp lệ, cảnh báo mốc cũ và tỷ lệ thử việc chưa có ngày chính thức', () => {
  const row = { days: days('2026-09', 1) }
  const result = calculatePayrollSalary(row, [{ ...rate('0001-01-01', 13000000, 80), legacy: true }],
    { tinh_trang: 'Thử việc' }, '2026-09', 26)
  assert.equal(result.amount, 400000)
  assert.equal(result.legacy, true)
  assert.equal(calculatePayrollSalary(row, [rate('2026-09-01', 0)], {}, '2026-09', 26).amount, 0)
  assert.equal(calculatePayrollSalary(row, [rate('2026-09-01', 100, 101)], {}, '2026-09', 26).amount, null)
})

test('chấp nhận tiền VNĐ nguyên, từ chối chuỗi mơ hồ; KPI theo lương đã phân bổ', () => {
  for (const value of ['12.000.000', '12,000,000', '12 000 000 đ', 12000000]) assert.equal(parseSalaryAmount(value), 12000000)
  for (const value of ['', '12tr', '-1', '1.5', 'abc']) assert.equal(parseSalaryAmount(value), null)
  assert.deepEqual(calculatePayrollKpi({ totalKPI: 80 }, 12000000), { amount: 9600000, percent: 80 })
  assert.equal(calculatePayrollKpi({ totalKPI: 0 }, 12000000).amount, 0)
  assert.equal(calculatePayrollKpi({ totalKPI: null }, 12000000).amount, null)
})
