import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canManageAttendance,
  getDefaultLandingPath,
  isAccountingUser
} from './staffAccess.js'

test('nhận diện Kế toán theo vai trò hoặc hồ sơ nhân sự', () => {
  assert.equal(isAccountingUser({ role: 'accountant' }), true)
  assert.equal(isAccountingUser({ role: 'user', bo_phan: 'Kế toán' }), true)
  assert.equal(isAccountingUser({ role: 'user', position: 'Kế toán viên' }), true)
  assert.equal(isAccountingUser({ role: 'user', bo_phan: 'Vận hành' }), false)
})

test('Kế toán được quản lý bảng công nhưng không dùng trang chủ nhân sự', () => {
  const accountant = { role: 'user', department: 'Kế toán' }
  assert.equal(canManageAttendance(accountant), true)
  assert.equal(getDefaultLandingPath(accountant), '/bang-cong-preview')
  assert.equal(getDefaultLandingPath({ role: 'admin' }), '/employees')
  assert.equal(getDefaultLandingPath({ role: 'user', department: 'Sale' }), '/bang-cong')
})
