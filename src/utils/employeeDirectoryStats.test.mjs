import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateEmployeeActivity, getEmployeeStatRows } from './employeeDirectoryStats.js'

const today = new Date(2026, 9, 1)
const employees = [
  {
    id: 'a', employeeId: 'NV-A', trang_thai: 'Chính thức', cccd: '123456789012',
    ngay_sinh: '1992-10-12', ngay_vao_lam: '20/10/2020', ngay_het_han: '2026-11-10'
  },
  {
    id: 'b', employeeId: 'NV-B', trang_thai: 'Thử việc', cccd: '',
    ngay_sinh: '02/09/1995', ngay_vao_lam: '2026-08-01', ngay_het_han: '2026-12-15'
  },
  {
    id: 'c', employeeId: 'NV-C', trang_thai: 'Nghỉ việc', cccd: '',
    ngay_sinh: '1990-10-01', ngay_vao_lam: '2020-10-01', ngay_het_han: '2026-10-02'
  }
]

test('all employee cards count the same people their drill-down lists return', () => {
  const activity = aggregateEmployeeActivity([
    { rows: [{ employeeId: 'a', employeeCode: 'NV-A', lateCount: 2, paidLeaveWorkdays: 4 }] },
    { rows: [{ employeeId: 'a', employeeCode: 'NV-A', lateCount: 2, paidLeaveWorkdays: 5 }] }
  ])
  const expected = {
    all: ['a', 'b'], probation: ['b'], official: ['a'], expiring: ['a'],
    missingDocuments: ['b'], frequentLate: ['a'], frequentLeave: ['a'],
    birthday: ['a'], anniversary: ['a']
  }
  for (const [stat, ids] of Object.entries(expected)) {
    assert.deepEqual(getEmployeeStatRows(employees, stat, activity, today).map(item => item.id), ids, stat)
  }
})

test('annual activity also matches employees by code when a summary lacks the profile id', () => {
  const activity = aggregateEmployeeActivity([
    { rows: [{ employeeCode: 'NV-B', lateCount: 4, paidLeaveWorkdays: 9 }] }
  ])
  assert.deepEqual(getEmployeeStatRows(employees, 'frequentLate', activity, today).map(item => item.id), ['b'])
  assert.deepEqual(getEmployeeStatRows(employees, 'frequentLeave', activity, today).map(item => item.id), ['b'])
})

test('expired contracts and past anniversaries do not appear as upcoming', () => {
  const people = [
    { id: 'past', trang_thai: 'Chính thức', ngay_het_han: '2026-09-30', ngay_vao_lam: '2020-09-30' },
    { id: 'soon', trang_thai: 'Chính thức', ngay_het_han: '2026-11-30', ngay_vao_lam: '2020-10-31' }
  ]
  assert.deepEqual(getEmployeeStatRows(people, 'expiring', {}, today).map(item => item.id), ['soon'])
  assert.deepEqual(getEmployeeStatRows(people, 'anniversary', {}, today).map(item => item.id), ['soon'])
})
