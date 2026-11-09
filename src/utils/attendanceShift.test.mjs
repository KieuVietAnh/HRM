import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCalculatedAttendanceTiming,
  buildAttendanceShiftSettingsPayload,
  calculateAttendanceTiming,
  formatAttendanceTime,
  normalizeAttendanceShiftSettings,
  resolveAttendanceShift
} from './attendanceShift.js'

test('ca đêm đi vào sau nửa đêm vẫn tính muộn từ đầu ca tối hôm trước', () => {
  const result = calculateAttendanceTiming({
    log: { standardCheckIn: '22:00', standardCheckOut: '06:00' },
    checkIn: '01:00', checkOut: '05:30'
  })
  assert.equal(result.lateMinutes, 180)
  assert.equal(result.earlyMinutes, 30)
})

test('uses the normal morning shift for a non-Sale employee', () => {
  const result = calculateAttendanceTiming({
    employee: { position: 'HR', shift: 'Ca ngày' },
    checkIn: '08:45',
    checkOut: '17:20'
  })

  assert.equal(result.shift.start, '08:30')
  assert.equal(result.shift.end, '17:30')
  assert.equal(result.lateMinutes, 15)
  assert.equal(result.earlyMinutes, 10)
})

test('calculates history timing when an admin has no employee profile for the log', () => {
  const result = applyCalculatedAttendanceTiming(
    { vao: '08:18', ra: '17:30', source: 'employee-online' },
    null
  )
  assert.equal(result.shiftName, 'Ca Hành chính')
  assert.equal(result.lateMinutes, 0)
  assert.equal(result.earlyMinutes, 0)
})

test('uses 04:00-13:30 for an employee identified as Sale', () => {
  const result = calculateAttendanceTiming({
    employee: { department: 'Trang', position: 'Sale', shift: 'Ca ngày' },
    checkIn: '04:15',
    checkOut: '13:20'
  })

  assert.equal(result.shift.start, '04:00')
  assert.equal(result.shift.end, '13:30')
  assert.equal(result.lateMinutes, 15)
  assert.equal(result.earlyMinutes, 10)
})

test('stores and resolves separate times for each configured shift', () => {
  const settings = normalizeAttendanceShiftSettings({
    shifts: {
      administrative: {
        name: 'Ca Hành chính',
        standardCheckIn: '08:35',
        standardCheckOut: '17:40'
      },
      saleMorning: {
        name: 'Ca Sáng Sale',
        standardCheckIn: '04:05',
        standardCheckOut: '13:35'
      }
    }
  })

  assert.deepEqual(
    resolveAttendanceShift({ shift: 'Ca Hành chính', position: 'HR' }, {}, settings),
    { name: 'Ca Hành chính', start: '08:35', end: '17:40' }
  )
  assert.deepEqual(
    resolveAttendanceShift({ shift: 'Ca Sáng Sale', position: 'Sale' }, {}, settings),
    { name: 'Ca Sáng Sale', start: '04:05', end: '13:35' }
  )

  const payload = buildAttendanceShiftSettingsPayload(settings)
  assert.equal(payload.shifts.administrative.standardCheckIn, '08:35')
  assert.equal(payload.shifts.saleMorning.standardCheckIn, '04:05')
  assert.equal(payload.standardCheckIn, '08:35')
})

test('legacy shared settings only change the administrative shift', () => {
  const settings = normalizeAttendanceShiftSettings({
    standardCheckIn: '09:00',
    standardCheckOut: '18:00'
  })

  assert.equal(settings.shifts.administrative.standardCheckIn, '09:00')
  assert.equal(settings.shifts.saleMorning.standardCheckIn, '04:00')
  assert.equal(settings.shifts.saleMorning.standardCheckOut, '13:30')
})

test('reuses the existing Trang team mapping to identify Sale employees', () => {
  const result = resolveAttendanceShift({ department: 'Trang', position: '' })
  assert.deepEqual(result, resolveAttendanceShift({ position: 'Sale' }))
})

test('prefers an explicit shift range in the attendance row over Sale inference', () => {
  const result = resolveAttendanceShift(
    { position: 'Sale' },
    { shiftName: 'Ca điều động 09:00 - 18:00' }
  )
  assert.equal(result.start, '09:00')
  assert.equal(result.end, '18:00')
})

test('prefers an explicit time range stored in the employee shift', () => {
  assert.deepEqual(
    resolveAttendanceShift({ shift: 'Ca riêng 07:15 - 16:45', position: 'Sale' }),
    { name: 'Ca riêng 07:15 - 16:45', start: '07:15', end: '16:45' }
  )
})

test('assigns Sale punches to the closest configured shift at 05:55 and 08:18', () => {
  const attendanceSettings = normalizeAttendanceShiftSettings({
    shifts: {
      administrative: {
        name: 'Ca 6h',
        standardCheckIn: '06:00',
        standardCheckOut: '14:00'
      },
      saleMorning: {
        name: 'Ca 4h',
        standardCheckIn: '04:00',
        standardCheckOut: '13:30'
      },
      lateMorning: {
        name: 'Ca 8h',
        standardCheckIn: '08:00',
        standardCheckOut: '16:00'
      }
    }
  })
  const employee = { position: 'Sale', shift: 'Ca ngày' }
  const early = calculateAttendanceTiming({ employee, checkIn: '05:55', attendanceSettings })
  const later = calculateAttendanceTiming({ employee, checkIn: '08:18', attendanceSettings })

  assert.equal(early.shift.start, '06:00')
  assert.equal(early.lateMinutes, 0)
  assert.equal(later.shift.start, '08:00')
  assert.equal(later.lateMinutes, 18)

  const nonSale = calculateAttendanceTiming({
    employee: { position: 'HR', shift: 'Ca ngày' },
    checkIn: '08:18',
    attendanceSettings
  })
  assert.equal(nonSale.shift.start, '08:00')
  assert.equal(nonSale.lateMinutes, 18)
})

test('uses the shift id stored on the attendance row before the employee fallback', () => {
  const result = calculateAttendanceTiming({
    employee: { shift: 'Ca Hành chính', position: 'HR' },
    log: { shiftId: 'saleMorning' },
    checkIn: '08:18'
  })

  assert.equal(result.shift.start, '04:00')
  assert.equal(result.lateMinutes, 258)
})

test('keeps actual punch strings while replacing incorrect source penalties', () => {
  const log = applyCalculatedAttendanceTiming({
    vao: '04:02',
    ra: '13:38',
    lateMinutes: 0,
    earlyMinutes: 202
  }, { position: 'Sale' })

  assert.equal(log.vao, '04:02')
  assert.equal(log.ra, '13:38')
  assert.equal(log.lateMinutes, 2)
  assert.equal(log.earlyMinutes, 0)
})

test('split shift timing does not mark a morning-only checkout or afternoon-only checkin as missing a half-day', () => {
  const settings = normalizeAttendanceShiftSettings({
    shifts: {
      administrative: {
        name: 'Ca Hành chính',
        standardCheckIn: '08:30',
        standardCheckOut: '17:30',
        splitShift: {
          enabled: true,
          morning: { start: '08:30', end: '12:00', workdays: 0.5 },
          afternoon: { start: '13:00', end: '17:30', workdays: 0.5 }
        }
      }
    }
  })
  const employee = { shift: 'Ca Hành chính', position: 'HR' }
  const morning = calculateAttendanceTiming({
    employee, checkIn: '08:24', checkOut: '12:33', attendanceSettings: settings
  })
  assert.equal(morning.lateMinutes, 0)
  assert.equal(morning.earlyMinutes, 0)

  const afternoon = calculateAttendanceTiming({
    employee, checkIn: '12:30', checkOut: '17:33', attendanceSettings: settings
  })
  assert.equal(afternoon.lateMinutes, 0)
  assert.equal(afternoon.earlyMinutes, 0)

  const late = calculateAttendanceTiming({
    employee, checkIn: '09:00', checkOut: '17:30', attendanceSettings: settings
  })
  assert.equal(late.lateMinutes, 30)
  assert.equal(late.earlyMinutes, 0)
})

test('formats stored timestamps in the attendance timezone', () => {
  assert.equal(formatAttendanceTime('2026-08-05T21:02:00.000Z'), '04:02')
  assert.equal(formatAttendanceTime('8:30 PM'), '20:30')
})

test('lưu cấu hình chia hai buổi độc lập cho từng ca', () => {
  const settings = normalizeAttendanceShiftSettings({
    shifts: {
      administrative: {
        splitShift: {
          enabled: true,
          morning: { start: '08:30', end: '12:00', workdays: 0.5 },
          afternoon: { start: '13:00', end: '17:30', workdays: 0.5 }
        }
      },
      saleMorning: {
        splitShift: {
          enabled: true,
          morning: { start: '04:00', end: '08:00', workdays: 0.5 },
          afternoon: { start: '09:00', end: '13:30', workdays: 0.5 }
        }
      }
    }
  })
  const payload = buildAttendanceShiftSettingsPayload(settings)

  assert.equal(payload.shifts.administrative.splitShift.morning.end, '12:00')
  assert.equal(payload.shifts.saleMorning.splitShift.afternoon.start, '09:00')
  assert.equal(
    resolveAttendanceShift({ shift: 'Ca Sáng Sale', position: 'Sale' }, {}, settings).splitShift.enabled,
    true
  )

  const explicitEmployeeShift = resolveAttendanceShift({
    shift: 'Ca Hành chính',
    standardCheckIn: '08:30',
    standardCheckOut: '17:30'
  }, {}, settings)
  assert.equal(explicitEmployeeShift.splitShift.morning.end, '12:00')
})

test('preserves custom shifts through saving and reload, including split hours', () => {
  const custom = {
    id: 'custom_evening', name: 'Ca tối', standardCheckIn: '14:00', standardCheckOut: '22:00',
    splitShift: {
      enabled: true,
      morning: { start: '14:00', end: '18:00', workdays: 0.5 },
      afternoon: { start: '19:00', end: '22:00', workdays: 0.5 }
    }
  }
  for (const shifts of [{ custom_evening: custom }, [custom]]) {
    const payload = buildAttendanceShiftSettingsPayload({ shifts })
    const reloaded = normalizeAttendanceShiftSettings(payload)
    assert.deepEqual(reloaded.shifts.custom_evening, custom)
    assert.ok(reloaded.shifts.administrative)
    assert.ok(reloaded.shifts.saleMorning)
    const resolved = resolveAttendanceShift({ shift: 'Ca tối' }, {}, reloaded)
    assert.equal(resolved.start, '14:00')
    assert.equal(resolved.end, '22:00')
    assert.deepEqual(resolved.splitShift, custom.splitShift)
  }
})
