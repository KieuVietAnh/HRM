import assert from 'node:assert/strict'
import test from 'node:test'
import { asIdentityText, getEmployeeEmploymentStatus, mapAppToUser, mapUserToApp } from './helpers.js'

test('không suy diễn hồ sơ có employment_status rỗng thành Chính thức', () => {
  const employee = mapUserToApp({
    id: 'employee-1',
    name: 'Nhân viên chưa đánh dấu',
    employment_status: '',
    status: 'Chính thức'
  })
  assert.equal(getEmployeeEmploymentStatus(employee), '')
})
test('giữ đúng trạng thái HR đã đánh dấu và fallback legacy khi không có cột mới', () => {
  assert.equal(getEmployeeEmploymentStatus({ employmentStatus: 'Thử việc' }), 'Thử việc')
  assert.equal(getEmployeeEmploymentStatus({ status: 'Nghỉ việc' }), 'Nghỉ việc')
})

test('asIdentityText giữ số 0 đầu của SĐT/CCCD dạng chuỗi', () => {
  assert.equal(asIdentityText('0912345678', 'phone'), '0912345678')
  assert.equal(asIdentityText('001234567890', 'cccd'), '001234567890')
  assert.equal(asIdentityText(' 0123456789 ', 'phone'), '0123456789')
})

test('asIdentityText khôi phục số 0 đầu khi Excel lưu dạng số', () => {
  assert.equal(asIdentityText(912345678, 'phone'), '0912345678')
  assert.equal(asIdentityText(12345678901, 'cccd'), '012345678901')
  assert.equal(asIdentityText(12345678, 'cccd'), '012345678')
  assert.equal(asIdentityText(1234567890, 'cccd'), '1234567890')
})

test('mapUserToApp / mapAppToUser không bỏ số 0 đầu SĐT, CCCD và Số TK', () => {
  const app = mapUserToApp({
    id: 'e1',
    name: 'Test',
    phone: '0912345678',
    cccd: '001234567890',
    bank_name: 'Vietcombank',
    bank_account_number: '0123456789',
    bank_account_name: 'NGUYEN VAN A'
  })
  assert.equal(app.sđt, '0912345678')
  assert.equal(app.cccd, '001234567890')
  assert.equal(app.ngan_hang, 'Vietcombank')
  assert.equal(app.so_tk, '0123456789')
  assert.equal(app.ten_tai_khoan, 'NGUYEN VAN A')

  const db = mapAppToUser({
    ho_va_ten: 'Test',
    sđt: '0912345678',
    cccd: '001234567890',
    ngan_hang: 'Vietcombank',
    so_tk: '0123456789',
    ten_tai_khoan: 'NGUYEN VAN A'
  })
  assert.equal(db.phone, '0912345678')
  assert.equal(db.cccd, '001234567890')
  assert.equal(db.bank_name, 'Vietcombank')
  assert.equal(db.bank_account_number, '0123456789')
  assert.equal(db.bank_account_name, 'NGUYEN VAN A')
})


test('tách Trạng thái (đang làm/nghỉ) khỏi Tình trạng (thử việc/chính thức)', async () => {
  const helpers = await import('./helpers.js')
  assert.equal(helpers.getEmployeeWorkState({ employment_status: 'Chính thức' }), 'Đang làm việc')
  assert.equal(helpers.getEmployeeStage({ employment_status: 'Chính thức' }), 'Chính thức')
  assert.equal(helpers.getEmployeeWorkState({ employment_status: 'Nghỉ việc', status: 'Thử việc' }), 'Nghỉ việc')
  assert.equal(helpers.getEmployeeStage({ employment_status: 'Nghỉ việc', status: 'Thử việc' }), 'Thử việc')
  assert.equal(helpers.getEmployeeStage({}), '')

  const resigned = helpers.composeEmploymentFields({ workState: 'Đã nghỉ', stage: 'Chính thức' })
  assert.equal(resigned.trang_thai, 'Nghỉ việc')
  assert.equal(resigned.tinh_trang, 'Chính thức')
  const active = helpers.composeEmploymentFields({ workState: 'Đang làm', stage: 'Thử việc' })
  assert.equal(active.trang_thai, 'Thử việc')
  // File cũ đặt Thử việc/Chính thức ở cột Trạng thái
  const legacy = helpers.composeEmploymentFields({ workState: 'Chính thức', stage: '' })
  assert.equal(legacy.tinh_trang, 'Chính thức')
  assert.equal(legacy.trang_thai, 'Chính thức')
  assert.equal(helpers.composeEmploymentFields({}).trang_thai, '')

  assert.equal(helpers.matchesEmployeeStatusFilter({ employment_status: 'Nghỉ việc' }, 'Nghỉ việc'), true)
  assert.equal(helpers.matchesEmployeeStatusFilter({ employment_status: 'Chính thức' }, 'Đang làm việc'), true)
  assert.equal(helpers.matchesEmployeeStatusFilter({ employment_status: 'Chính thức' }, 'Thử việc'), false)
})
