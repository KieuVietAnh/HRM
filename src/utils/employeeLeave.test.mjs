import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTenure, normalizeLeaveData, parseLeaveAmount } from './employeeLeave.js'

test('giữ tổng phép độc lập với phân bổ tháng và không tự chia đều', () => {
  assert.deepEqual(normalizeLeaveData({
    2026: { total_leave: 12, months: { 1: 0, 2: 1.5, 13: 4 } },
    2027: { total_leave: 14, months: { 1: 1 } }
  }), {
    2026: { total_leave: 12, months: { 1: 0, 2: 1.5 } },
    2027: { total_leave: 14, months: { 1: 1 } }
  })
})

test('tính thâm niên theo ngày vào làm và ngày hiện tại', () => {
  assert.equal(formatTenure('2024-09-25', new Date(2026, 8, 24)), '1 năm 11 tháng')
  assert.equal(formatTenure('2024-09-25', new Date(2026, 8, 25)), '2 năm 0 tháng')
  assert.equal(formatTenure('', new Date(2026, 8, 25)), 'Chưa có ngày vào làm')
  assert.equal(formatTenure('2027-01-01', new Date(2026, 8, 25)), 'Chưa đến ngày vào làm')
})

test('chấp nhận phép lẻ nhập bằng dấu phẩy hoặc dấu chấm', () => {
  assert.equal(parseLeaveAmount('1,5'), 1.5)
  assert.equal(parseLeaveAmount('1.5'), 1.5)
  assert.equal(parseLeaveAmount('-1'), null)
  assert.equal(parseLeaveAmount('abc'), null)
})
