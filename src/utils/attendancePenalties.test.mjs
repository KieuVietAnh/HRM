import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyPenaltyAmountsToSummaryRows,
  buildPenaltyDetailRows,
  createEmptyPenaltyRow,
  evaluateMonthlyLateEarlyPenalty,
  getPenaltyTotals,
  mergeAutoPenaltiesWithManual
} from './attendancePenalties.js'

test('penalty totals exclude a new row until an employee is selected', () => {
  const draft = createEmptyPenaltyRow('2026-08')
  assert.deepEqual(getPenaltyTotals([draft]), { errorCount: 0, amount: 0 })

  const assigned = { ...draft, employeeId: 'employee-1' }
  assert.deepEqual(getPenaltyTotals([assigned]), { errorCount: 1, amount: 50000 })
})

test('penalty totals count zero-amount errors and ignore invalid amounts', () => {
  const rows = [
    { employeeName: 'Nhân viên A', amount: 0 },
    { employeeCode: 'NV002', amount: 75000 },
    { employeeId: 'employee-3', amount: 'bad value' }
  ]
  assert.deepEqual(getPenaltyTotals(rows), { errorCount: 3, amount: 75000 })
})

test('mergeAutoPenaltiesWithManual giữ dòng tay và thay dòng auto', () => {
  const existing = [
    { id: 'm1', employeeId: 'e1', employeeName: 'A', amount: 200000, source: 'manual', date: '2026-08-01' },
    { id: 'a1', employeeId: 'e1', employeeName: 'A', amount: 50000, source: 'auto', date: '2026-08-02' }
  ]
  const auto = [
    { id: 'a2', employeeId: 'e1', employeeName: 'A', amount: 100000, source: 'auto', date: '2026-08-03' }
  ]
  const merged = mergeAutoPenaltiesWithManual(existing, auto)
  assert.equal(merged.length, 2)
  assert.equal(merged[0].id, 'm1')
  assert.equal(merged[0].source, 'manual')
  assert.equal(merged[1].id, 'a2')
  assert.equal(merged[1].amount, 100000)
})

test('2 lần đầu mỗi lần dưới 15 phút: không phạt', () => {
  const result = evaluateMonthlyLateEarlyPenalty([
    { date: '2026-08-01', type: 'late', minutes: 10 },
    { date: '2026-08-05', type: 'early', minutes: 12 }
  ])
  assert.equal(result.applies, false)
  assert.equal(result.amount, 0)
  assert.equal(result.totalMinutes, 22)
})

test('lần thứ 3 dù dưới 15 phút: phạt theo tổng phút', () => {
  const under = evaluateMonthlyLateEarlyPenalty([
    { date: '2026-08-01', minutes: 5 },
    { date: '2026-08-02', minutes: 5 },
    { date: '2026-08-03', minutes: 5 }
  ])
  assert.equal(under.applies, true)
  assert.equal(under.totalMinutes, 15)
  assert.equal(under.amount, 50000)

  const over = evaluateMonthlyLateEarlyPenalty([
    { date: '2026-08-01', minutes: 10 },
    { date: '2026-08-02', minutes: 10 },
    { date: '2026-08-03', minutes: 10 }
  ])
  assert.equal(over.applies, true)
  assert.equal(over.totalMinutes, 30)
  assert.equal(over.amount, 100000)
})

test('có lần ≥15 phút: phạt ngay theo tổng phút tháng', () => {
  const result = evaluateMonthlyLateEarlyPenalty([
    { date: '2026-08-01', minutes: 20 }
  ])
  assert.equal(result.applies, true)
  assert.equal(result.amount, 50000)
})

test('buildPenaltyDetailRows tạo 1 dòng phạt muộn/sớm theo tháng', () => {
  const rows = buildPenaltyDetailRows([{
    employeeId: 'e1',
    employeeCode: 'NV1',
    employeeName: 'A',
    month: '2026-08',
    days: {
      '2026-08-01': { late: true, lateMinutes: 20, early: false, earlyMinutes: 0 },
      '2026-08-10': { late: false, lateMinutes: 0, early: true, earlyMinutes: 15 }
    }
  }])
  const lateEarly = rows.filter(row => String(row.id).includes('late-early-month'))
  assert.equal(lateEarly.length, 1)
  assert.equal(lateEarly[0].amount, 100000)
})

test('applyPenaltyAmountsToSummaryRows dùng cơ chế phạt tháng', () => {
  const [row] = applyPenaltyAmountsToSummaryRows([{
    employeeName: 'A',
    missingPunchCount: 1,
    unapprovedAbsenceCount: 0,
    days: {
      '2026-08-01': { late: true, lateMinutes: 10, early: false, earlyMinutes: 0 },
      '2026-08-02': { late: true, lateMinutes: 10, early: false, earlyMinutes: 0 }
    }
  }])
  assert.equal(row.lateFine, 0)
  assert.equal(row.missingPunchFine, 50000)
  assert.equal(row.totalFine, 50000)
})
