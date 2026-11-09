import assert from 'node:assert/strict'
import test from 'node:test'
import { planAttendanceImport } from './attendanceImportService.js'

const imported = overrides => ({
  id: 'old-id',
  employeeId: 'employee-1',
  date: '2026-08-01',
  shiftName: 'Ca ngày',
  vao: '08:00',
  ra: '17:00',
  sourceEmployeeCode: 'M01',
  sourceType: 'excel-import',
  ...overrides
})

test('retrying an unchanged import does not insert another row', () => {
  const existing = imported()
  const incoming = { ...existing }
  delete incoming.id
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })

  assert.equal(plan.inserts.length, 0)
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.unchanged.length, 1)
})

test('corrected punches update the same imported attendance row', () => {
  const existing = imported()
  const incoming = { ...existing, vao: '08:15', ra: '17:30' }
  delete incoming.id
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })

  assert.equal(plan.inserts.length, 0)
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].id, 'old-id')
})

test('detail re-import replaces old Excel totals even when the app shift differs from the source shift', () => {
  const existing = imported({
    sourceEmployeeName: 'Nguyễn Mỹ Hạnh', shiftName: 'HC',
    cong: 0.73, hours: 5.83, lateMinutes: 130, tc1: 0.5
  })
  const incoming = imported({
    id: undefined, sourceEmployeeName: 'Nguyễn Mỹ Hạnh',
    shiftName: 'Ca hành chính', importFormat: 'attendance-detail-list',
    calculationMode: 'punches', vao: '09:40', ra: '17:36',
    cong: 476 / 480, hours: 476 / 60, lateMinutes: 100, tc1: 0,
    sourceWorkdays: null, sourceHours: null
  })
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })
  assert.equal(plan.inserts.length, 0)
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].id, 'old-id')
  assert.equal(plan.updates[0].data.tc1, 0)
  assert.equal(plan.updates[0].data.sourceWorkdays, null)
})

test('detail re-import keeps the precise department from an earlier monthly sheet', () => {
  const existing = imported({
    importFormat: 'attendance-monthly-matrix',
    sourceDepartment: 'Leader Content',
    department: 'MKT'
  })
  const incoming = imported({
    id: undefined,
    importFormat: 'attendance-detail-list',
    sourceDepartment: 'Văn phòng',
    department: 'MKT'
  })
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].data.sourceDepartment, 'Văn phòng')
  assert.equal(plan.updates[0].data.monthlyDepartment, 'Leader Content')
})

test('new monthly sheet can update its own department without retaining an older label', () => {
  const existing = imported({
    importFormat: 'attendance-detail-list',
    sourceDepartment: 'Văn phòng',
    monthlyDepartment: 'Media'
  })
  const incoming = imported({
    id: undefined,
    importFormat: 'attendance-monthly-matrix',
    sourceDepartment: 'SEO',
    monthlyDepartment: 'SEO'
  })
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].data.monthlyDepartment, 'SEO')
})

test('detail re-import does not take a different source employee on the same day', () => {
  const existing = imported({ sourceEmployeeCode: 'M02', sourceEmployeeName: 'Người khác' })
  const incoming = imported({
    id: undefined, sourceEmployeeName: 'Nguyễn Mỹ Hạnh',
    shiftName: 'Ca hành chính', importFormat: 'attendance-detail-list'
  })
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.inserts.length, 1)
})

test('does not overwrite an attendance record from another source', () => {
  const existing = {
    id: 'manual-id', employeeId: 'employee-1', date: '2026-08-01', shiftName: 'Ca ngày', vao: '08:00'
  }
  const incoming = imported({ id: undefined, vao: '08:15' })
  const plan = planAttendanceImport({ incomingLogs: [incoming], existingLogs: [existing] })

  assert.equal(plan.updates.length, 0)
  assert.equal(plan.conflicts.length, 1)
})

test('uses a deterministic id for a new row and collapses duplicate input', () => {
  const incoming = imported({ id: undefined })
  const plan = planAttendanceImport({ incomingLogs: [incoming, { ...incoming }] })

  assert.equal(plan.inserts.length, 1)
  assert.match(plan.inserts[0].id, /^excel_/)
  assert.equal(plan.skipped.length, 1)
})
