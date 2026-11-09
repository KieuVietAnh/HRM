import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRegistrationChanges,
  buildShiftOptions,
  shiftWeekKey,
  weekDays,
  weekStartKey
} from './shiftRegistration.js'

test('weekStartKey returns Monday for any day in the week', () => {
  assert.equal(weekStartKey('2026-11-02'), '2026-11-02')
  assert.equal(weekStartKey('2026-11-08'), '2026-11-02')
  assert.equal(weekStartKey('2026-11-04'), '2026-11-02')
})

test('shiftWeekKey and weekDays span Monday to Sunday', () => {
  assert.equal(shiftWeekKey('2026-11-02', 1), '2026-11-09')
  assert.equal(shiftWeekKey('2026-11-02', -1), '2026-10-26')
  const days = weekDays('2026-11-02')
  assert.equal(days.length, 7)
  assert.equal(days[0].label, 'Thứ 2')
  assert.equal(days[6].date, '2026-11-08')
  assert.equal(days[6].label, 'Chủ nhật')
})

test('buildShiftOptions lists configured shifts plus day off', () => {
  const options = buildShiftOptions({
    shifts: { administrative: { id: 'administrative', name: 'Ca HC', standardCheckIn: '08:30', standardCheckOut: '17:30' } }
  })
  assert.deepEqual(options.map(option => option.id), ['administrative', 'off'])
})

test('buildRegistrationChanges skips approved days and only writes changes', () => {
  const days = weekDays('2026-11-02').slice(0, 4)
  const options = buildShiftOptions({
    shifts: { administrative: { id: 'administrative', name: 'Ca HC', standardCheckIn: '08:30', standardCheckOut: '17:30' } }
  })
  const existingByDate = {
    '2026-11-02': { id: 'a', shift_id: 'administrative', status: 'approved' },
    '2026-11-03': { id: 'b', shift_id: 'administrative', status: 'pending' },
    '2026-11-04': { id: 'c', shift_id: 'administrative', status: 'rejected' }
  }
  const selections = {
    '2026-11-02': 'off',
    '2026-11-03': '',
    '2026-11-04': 'administrative',
    '2026-11-05': 'off'
  }
  const { upserts, removals } = buildRegistrationChanges({ days, selections, existingByDate, options })
  assert.deepEqual(removals, ['b'])
  assert.deepEqual(upserts.map(row => row.work_date), ['2026-11-04', '2026-11-05'])
  assert.equal(upserts[1].start_time, null)
})
