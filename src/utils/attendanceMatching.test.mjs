import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAttendanceRecordKey,
  buildAttendanceStorageId,
  buildMonthlyAttendanceSourceKey,
  applyEmployeeToAttendanceLog,
  matchAttendanceEmployee,
  matchDetailedAttendanceEmployee,
  matchMonthlyAttendanceEmployee,
  scopeAttendanceEmployeesByCompany
} from './attendanceMatching.js'

test('ghép hồ sơ không làm mất bộ phận gốc trong Excel', () => {
  const log = applyEmployeeToAttendanceLog({
    employeeName: 'Nhân viên A',
    department: 'Leader Content',
    importFormat: 'attendance-monthly-matrix'
  }, {
    id: 'employee-a',
    ho_va_ten: 'Nhân viên A',
    bo_phan: 'MKT'
  })
  assert.equal(log.department, 'MKT')
  assert.equal(log.sourceDepartment, 'Leader Content')
})

test('does not auto-match a machine code collision when employee names differ', () => {
  const wrongEmployee = {
    id: 'wrong-profile',
    employeeId: '00019',
    ho_va_ten: 'Nguyễn Thị Hồng Thắm'
  }

  const match = matchAttendanceEmployee(
    '00019',
    'Nguyễn Thị Phương Anh',
    [wrongEmployee]
  )

  assert.equal(match.employee, null)
  assert.ok(match.confidence < 0.9)
  assert.equal(match.method, 'Mã trùng nhưng tên không khớp')
})

test('detailed attendance requires exact employee code and name when code exists', () => {
  const employees = [
    { id: 'right', employeeId: '00001', ho_va_ten: 'Đặng Thùy Liên' },
    { id: 'wrong-name', employeeId: '00002', ho_va_ten: 'Đặng Thùy Linh' }
  ]
  assert.equal(
    matchDetailedAttendanceEmployee('00001', 'Đặng Thùy Liên', employees, 'speego-original').employee?.id,
    'right'
  )
  const conflict = matchDetailedAttendanceEmployee('00001', 'Người Khác', employees, 'speego-original')
  assert.equal(conflict.employee, null)
  assert.equal(conflict.status, 'review')
  assert.deepEqual(conflict.candidates.map(candidate => candidate.employee.id), ['right'])
})

test('prefers an exact name over a colliding machine code', () => {
  const wrongEmployee = {
    id: 'wrong-profile',
    employeeId: '00019',
    ho_va_ten: 'Nguyễn Thị Hồng Thắm'
  }
  const correctEmployee = {
    id: 'correct-profile',
    employeeId: 'LU099',
    ho_va_ten: 'Nguyễn Thị Phương Anh'
  }

  const match = matchAttendanceEmployee(
    '00019',
    'Nguyễn Thị Phương Anh',
    [wrongEmployee, correctEmployee]
  )

  assert.equal(match.employee?.id, 'correct-profile')
  assert.equal(match.method, 'Tên trùng → gán mã nhân viên Lumi')
})

test('still auto-matches when both employee code and name agree', () => {
  const employee = {
    id: 'correct-profile',
    employeeId: 'LU035',
    ho_va_ten: 'Đặng Thùy Liên'
  }

  const match = matchAttendanceEmployee('LU035', 'Đặng Thùy Liên', [employee])

  assert.equal(match.employee?.id, 'correct-profile')
  assert.equal(match.status, 'matched')
})

test('does not auto-match different Vietnamese given names with a high overall similarity', () => {
  const employee = {
    id: 'wrong-profile',
    employeeId: 'LU003',
    ho_va_ten: 'Nguyễn Thị Gấm'
  }

  const match = matchAttendanceEmployee('00012', 'Nguyễn Thị Đảm', [employee])

  assert.equal(match.employee, null)
  assert.equal(match.status, 'review')
})

test('does not choose arbitrarily when multiple profiles have the same full name', () => {
  const employees = [
    { id: 'profile-1', employeeId: 'LU012', ho_va_ten: 'Nguyễn Thị Lan Anh' },
    { id: 'profile-2', employeeId: 'LU018', ho_va_ten: 'Nguyễn Thị Lan Anh' }
  ]

  const match = matchAttendanceEmployee('00004', 'Nguyễn Thị Lan Anh', employees)

  assert.equal(match.employee, null)
  assert.equal(match.status, 'review')
})

test('matches an exact name even when its profile is outside the preferred branch', () => {
  const employees = [
    {
      id: 'profile-hn',
      employeeId: 'LU101',
      ho_va_ten: 'Nguyễn Việt Khánh',
      chi_nhanh: 'Hà Nội'
    },
    {
      id: 'profile-hcm',
      employeeId: 'LU102',
      ho_va_ten: 'Nguyễn Nam Khánh',
      chi_nhanh: 'HCM'
    }
  ]

  const match = matchAttendanceEmployee(
    'ROW11',
    'Nguyễn Việt Khánh',
    employees,
    'HCM'
  )

  assert.equal(match.employee?.id, 'profile-hn')
  assert.equal(match.confidence, 1)
})

test('uses the preferred branch to resolve duplicate exact names', () => {
  const employees = [
    {
      id: 'profile-hn',
      employeeId: 'LU201',
      ho_va_ten: 'Nguyễn Thị Lan Anh',
      chi_nhanh: 'Hà Nội'
    },
    {
      id: 'profile-hcm',
      employeeId: 'LU202',
      ho_va_ten: 'Nguyễn Thị Lan Anh',
      chi_nhanh: 'HCM'
    }
  ]

  const match = matchAttendanceEmployee(
    'ROW23',
    'Nguyễn Thị Lan Anh',
    employees,
    'HCM'
  )

  assert.equal(match.employee?.id, 'profile-hcm')
  assert.equal(match.status, 'matched')
})

test('attendance identity stays stable when corrected punch times change', () => {
  const first = {
    employeeId: 'user-1', date: '2026-08-01', vao: '08:00', ra: '17:00', shiftName: 'Ca ngày'
  }
  const corrected = { ...first, vao: '08:15', ra: '17:30' }

  assert.equal(buildAttendanceRecordKey(first), buildAttendanceRecordKey(corrected))
  assert.equal(buildAttendanceStorageId(first), buildAttendanceStorageId(corrected))
})

test('attendance identity keeps different employees and shifts separate', () => {
  const base = { employeeId: 'user-1', date: '2026-08-01', shiftName: 'Ca ngày' }
  assert.notEqual(buildAttendanceRecordKey(base), buildAttendanceRecordKey({ ...base, employeeId: 'user-2' }))
  assert.notEqual(buildAttendanceRecordKey(base), buildAttendanceRecordKey({ ...base, shiftName: 'Ca đêm' }))
})

test('monthly matrix matches a unique exact employee name without a code', () => {
  const employees = [
    { id: 'profile-1', ho_va_ten: 'Nguyễn Đức Anh', bo_phan: 'Giám đốc Vận hành' },
    { id: 'profile-2', ho_va_ten: 'Nguyễn Danh Nam', bo_phan: 'MKT' }
  ]

  const match = matchMonthlyAttendanceEmployee(
    'Nguyễn Đức Anh',
    'Giám đốc Vận hành',
    employees,
    'speego-original'
  )

  assert.equal(match.employee?.id, 'profile-1')
  assert.equal(match.status, 'matched')
})

test('monthly matrix uses department to resolve duplicate exact names', () => {
  const employees = [
    { id: 'sale', ho_va_ten: 'Nguyễn Thị Lan Anh', bo_phan: 'Sale' },
    { id: 'cskh', ho_va_ten: 'Nguyễn Thị Lan Anh', bo_phan: 'CSKH' }
  ]

  const match = matchMonthlyAttendanceEmployee(
    'Nguyễn Thị Lan Anh',
    'CSKH',
    employees,
    'speego-original'
  )

  assert.equal(match.employee?.id, 'cskh')
  assert.equal(match.method, 'Tên và bộ phận trùng hồ sơ')
})

test('monthly matrix leaves indistinguishable duplicate names ambiguous', () => {
  const employees = [
    { id: 'one', ho_va_ten: 'Nguyễn Thị Lan Anh', bo_phan: 'Sale' },
    { id: 'two', ho_va_ten: 'Nguyễn Thị Lan Anh', bo_phan: 'Sale' }
  ]

  const match = matchMonthlyAttendanceEmployee(
    'Nguyễn Thị Lan Anh',
    'Sale',
    employees,
    'speego-original'
  )

  assert.equal(match.employee, null)
  assert.equal(match.status, 'review')
  assert.match(match.method, /Trùng tên/)
})

test('monthly matrix matching is isolated by company id', () => {
  const employees = [
    { id: 'company-a-profile', companyId: 'company-a', ho_va_ten: 'Nguyễn Văn A', bo_phan: 'MKT' },
    { id: 'company-b-profile', companyId: 'company-b', ho_va_ten: 'Nguyễn Văn A', bo_phan: 'MKT' }
  ]

  assert.deepEqual(
    scopeAttendanceEmployeesByCompany(employees, 'company-a').map(employee => employee.id),
    ['company-a-profile']
  )
  assert.equal(
    matchMonthlyAttendanceEmployee('Nguyễn Văn A', 'MKT', employees, 'company-a').employee?.id,
    'company-a-profile'
  )
})

test('monthly matrix source identity includes department for duplicate names', () => {
  assert.notEqual(
    buildMonthlyAttendanceSourceKey('Nguyễn Thị Lan Anh', 'Sale'),
    buildMonthlyAttendanceSourceKey('Nguyễn Thị Lan Anh', 'CSKH')
  )
})

test('monthly matrix source identity keeps duplicate source rows separate', () => {
  assert.notEqual(
    buildMonthlyAttendanceSourceKey('Nguyễn Thị Lan Anh', 'Sale', 7),
    buildMonthlyAttendanceSourceKey('Nguyễn Thị Lan Anh', 'Sale', 8)
  )
})

test('monthly matching does not suggest Nguyen Thi Lan Anh for Nguyen Quang Minh', () => {
  const match = matchMonthlyAttendanceEmployee('Nguyễn Quang Minh', 'MKT', [
    { id: 'wrong', employeeId: 'nv0040', ho_va_ten: 'Nguyễn Thị Lan Anh' }
  ], 'speego-original')
  assert.equal(match.status, 'unmatched')
  assert.equal(match.employee, null)
  assert.equal(match.suggestedEmployee, null)
  assert.deepEqual(match.candidates, [])
})

test('untagged legacy profiles cannot leak into another company or a punctuation-colliding id', () => {
  const employees = [
    { id: 'legacy' },
    { id: 'tagged', companyId: 'company-a' }
  ]
  assert.deepEqual(scopeAttendanceEmployeesByCompany(employees, 'companya'), [])
  assert.deepEqual(scopeAttendanceEmployeesByCompany(employees, 'company-a').map(employee => employee.id), ['tagged'])
  assert.deepEqual(scopeAttendanceEmployeesByCompany(employees, 'speego-original').map(employee => employee.id), ['legacy'])
  assert.deepEqual(scopeAttendanceEmployeesByCompany(employees, ''), [])
})
