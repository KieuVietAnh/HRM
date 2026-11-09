import assert from 'node:assert/strict'
import test from 'node:test'
import {
  departmentForAttendanceSummary,
  resolveAttendanceDepartment
} from './attendanceDepartment.js'

test('bảng công giữ tên bộ phận cụ thể, không gộp theo chức vụ', () => {
  assert.equal(resolveAttendanceDepartment({ department: 'Media', position: 'Marketing' }), 'Media')
  assert.equal(resolveAttendanceDepartment({ department: 'SEO', position: 'Content' }), 'SEO')
  assert.equal(resolveAttendanceDepartment({ department: 'Tài xế và thủ kho', position: 'Logistics' }), 'Tài xế và thủ kho')
  assert.equal(resolveAttendanceDepartment({ department: '', position: 'Marketing' }), 'MKT')
})

test('bảng công tháng ưu tiên bộ phận Excel; file chấm công chi tiết ưu tiên hồ sơ', () => {
  const employee = { bo_phan: 'Media' }
  assert.equal(departmentForAttendanceSummary({
    importFormat: 'attendance-monthly-matrix',
    sourceDepartment: 'SEO',
    department: 'Media'
  }, employee), 'SEO')
  assert.equal(departmentForAttendanceSummary({
    importFormat: 'attendance-detail-list',
    sourceDepartment: 'Văn phòng',
    department: 'Văn phòng'
  }, employee), 'Media')
  assert.equal(departmentForAttendanceSummary({
    importFormat: 'attendance-detail-list',
    monthlyDepartment: 'Leader Content',
    sourceDepartment: 'Văn phòng'
  }, employee), 'Leader Content')
})
