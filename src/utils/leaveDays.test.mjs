import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLeaveDate, isValidLeaveDate, normalizeLeaveReason, todayLocalDate } from './leaveDays.js'

test('chỉ nhận ngày nghỉ hợp lệ, kể cả ngày nhuận', () => {
  assert.equal(isValidLeaveDate('2028-02-29'), true)
  assert.equal(isValidLeaveDate('2027-02-29'), false)
  assert.equal(isValidLeaveDate('2026-13-01'), false)
  assert.equal(isValidLeaveDate(''), false)
})

test('hiển thị ngày nghỉ và lấy ngày hiện tại theo giờ địa phương', () => {
  assert.equal(formatLeaveDate('2026-09-24'), '24/09/2026')
  assert.equal(todayLocalDate(new Date(2026, 8, 24)), '2026-09-24')
})

test('lý do chỉ nhận Nghỉ cố định hoặc Nghỉ có phép', () => {
  assert.equal(normalizeLeaveReason('  Nghỉ cố định  '), 'Nghỉ cố định')
  assert.equal(normalizeLeaveReason('Nghỉ có phép'), 'Nghỉ có phép')
  assert.throws(() => normalizeLeaveReason('Việc gia đình'), /Vui lòng chọn lý do/)
  assert.throws(() => normalizeLeaveReason('   '), /Vui lòng chọn lý do/)
})
