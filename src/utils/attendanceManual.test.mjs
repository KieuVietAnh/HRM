import test from 'node:test'
import assert from 'node:assert/strict'
import { parseManualWorkdayInput, updateManualWorkdays } from './attendanceManual.js'

test('chuẩn hóa số công chỉnh tay và cho phép xóa để dùng lại tự động', () => {
  assert.deepEqual(parseManualWorkdayInput('0,5'), { valid: true, value: 0.5 })
  assert.deepEqual(parseManualWorkdayInput(''), { valid: true, value: null })
  assert.equal(parseManualWorkdayInput('1.5').valid, false)
  assert.equal(parseManualWorkdayInput('-1').valid, false)
})

test('lưu và gỡ giá trị công theo nhân viên, ngày', () => {
  const saved = updateManualWorkdays({}, 'emp-1', 2, 0.5)
  assert.deepEqual(saved, { 'emp-1': { 2: 0.5 } })
  assert.deepEqual(updateManualWorkdays(saved, 'emp-1', 2, null), {})
})
