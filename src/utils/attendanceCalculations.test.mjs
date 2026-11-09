import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateAttendanceMetrics,
  calculateSplitShiftWork,
  calculateWorkedMinutes,
  describeDayWorkFormula,
  getAttendanceHoliday
} from './attendanceCalculations.js'

test('chia buổi qua nửa đêm cộng các cặp và loại thời gian nghỉ', () => {
  for (const [morning, afternoon, punchPairs, minutes] of [
    ['20:00', '00:30', [{ checkIn: '20:00', checkOut: '00:00' }, { checkIn: '00:30', checkOut: '04:30' }], 480],
    ['20:00', '00:30', [{ checkIn: '20:00', checkOut: '04:30' }], 480],
    ['22:00', '03:00', [{ checkIn: '22:00', checkOut: '00:00' }, { checkIn: '00:30', checkOut: '02:00' }, { checkIn: '03:00', checkOut: '07:00' }], 450],
    ['22:00', '03:00', [{ checkIn: '00:30', checkOut: '02:00' }], 90]
  ]) {
    const result = calculateAttendanceMetrics({
      punchPairs,
      splitShift: {
        enabled: true,
        morning: { start: morning, end: morning === '20:00' ? '00:00' : '02:00', workdays: 0.5 },
        afternoon: { start: afternoon, end: afternoon === '00:30' ? '04:30' : '07:00', workdays: 0.5 }
      }
    })
    assert.equal(result.workedMinutes, minutes)
    assert.equal(result.regularWorkdays, minutes / 480)
  }
})

test('nhiều cặp qua đêm không tính giờ nghỉ hoặc lượt chưa check-out', () => {
  const result = calculateAttendanceMetrics({ punchPairs: [
    { checkIn: '22:00', checkOut: '01:00' },
    { checkIn: '01:30', checkOut: '06:30' },
    { checkIn: '07:00', checkOut: '' }
  ] })
  assert.equal(result.workedMinutes, 480)
  assert.equal(result.regularWorkdays, 1)
})

test('tính Công từ phút thực tế và tách phần vượt 480 phút', () => {
  const result = calculateAttendanceMetrics({ checkIn: '08:30', checkOut: '15:24' })
  assert.equal(calculateWorkedMinutes({ checkIn: '08:30', checkOut: '15:24' }), 414)
  assert.equal(result.hours, 6.9)
  assert.equal(result.regularWorkdays, 0.8625)
  assert.equal(result.overtimeHours, 0)
})
test('không tạo số âm cho dữ liệu rỗng, cùng giờ hoặc ca đêm', () => {
  assert.equal(calculateWorkedMinutes({}), null)
  assert.equal(calculateWorkedMinutes({ checkIn: '08:00', checkOut: '08:00' }), 0)
  assert.equal(calculateWorkedMinutes({ checkIn: '22:00', checkOut: '06:00' }), 480)
  const overnight = calculateAttendanceMetrics({ checkIn: '22:00', checkOut: '07:00' })
  assert.equal(overnight.regularWorkdays, 1)
  assert.equal(overnight.overtimeHours, 1)
})

test('ưu tiên tăng ca HR nhập và cho phép tắt tự động khi import Excel', () => {
  const manual = calculateAttendanceMetrics({
    log: { tc1: 0.5 },
    checkIn: '08:00',
    checkOut: '18:00'
  })
  assert.equal(manual.overtimeHours, 0.5)

  const excel = calculateAttendanceMetrics({
    log: { overtimeAutoDisabled: true },
    checkIn: '08:00',
    checkOut: '18:00'
  })
  assert.equal(excel.overtimeHours, 0)
})

test('nhận diện ngày lễ đã được cấu hình', () => {
  const holiday = getAttendanceHoliday('2026-09-02', {
    holidays: [{ date: '2026-09-02', name: 'Quốc khánh' }]
  })
  assert.deepEqual(holiday, { date: '2026-09-02', name: 'Quốc khánh' })
  assert.equal(getAttendanceHoliday('2026-09-03', { holidays: [] }), null)
})

const splitShift = {
  enabled: true,
  morning: { start: '08:30', end: '12:00', workdays: 0.5 },
  afternoon: { start: '13:00', end: '17:30', workdays: 0.5 }
}

test('giờ chấm trước/sau ca bị chặn tại mốc ca và giờ nghỉ trưa tự loại', () => {
  const full = calculateAttendanceMetrics({
    checkIn: '08:24', checkOut: '17:37', splitShift,
    breakMinutes: 60, autoCalculateOvertime: true
  })
  assert.equal(full.workedMinutes, 480)
  assert.equal(full.hours, 8)
  assert.equal(full.regularWorkdays, 1)
  assert.equal(full.overtimeHours, 0)

  const morning = calculateAttendanceMetrics({
    checkIn: '08:30', checkOut: '12:33', splitShift,
    breakMinutes: 60
  })
  assert.equal(morning.workedMinutes, 210)
  assert.equal(morning.hours, 3.5)
  assert.equal(morning.regularWorkdays, 0.5)

  const afternoon = calculateAttendanceMetrics({
    checkIn: '12:30', checkOut: '17:33', splitShift
  })
  assert.equal(afternoon.workedMinutes, 270)
  assert.equal(afternoon.hours, 4.5)
  assert.equal(afternoon.regularWorkdays, 0.5)
})

test('đi muộn buổi sáng giảm riêng công sáng, buổi chiều đủ vẫn 0.5', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '09:00', checkOut: '17:30', splitShift
  })
  assert.equal(result.workedMinutes, 450)
  assert.equal(result.hours, 7.5)
  assert.equal(result.splitShiftBreakdown[0].workdays, 180 / 210 * 0.5)
  assert.equal(result.splitShiftBreakdown[1].workdays, 0.5)
  assert.equal(result.regularWorkdays, 180 / 210 * 0.5 + 0.5)
  assert.equal(result.overtimeHours, 0)
})

test('nhiều cặp chấm trùng nhau không được cộng phút hai lần', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:30', checkOut: '10:00',
    punchPairs: [
      { checkIn: '08:30', checkOut: '10:00' },
      { checkIn: '08:30', checkOut: '10:00' }
    ],
    splitShift
  })
  assert.equal(result.workedMinutes, 90)
  assert.equal(result.regularWorkdays, 90 / 210 * 0.5)
})

test('chia hai cặp chấm thành buổi sáng và chiều, không tính giờ nghỉ giữa ca', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:30',
    checkOut: '17:30',
    punchPairs: [
      { checkIn: '08:30', checkOut: '12:00' },
      { checkIn: '13:00', checkOut: '17:30' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.calculationMode, 'split-shift')
  assert.equal(result.hours, 8)
  assert.equal(result.regularWorkdays, 1)
  assert.equal(result.overtimeHours, 0)
})

test('một cặp phủ cả ngày vẫn trừ khoảng nghỉ giữa hai buổi', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:30',
    checkOut: '17:30',
    punchPairs: [{ checkIn: '08:30', checkOut: '17:30' }],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.calculationMode, 'split-shift')
  assert.equal(result.hours, 8)
  assert.equal(result.regularWorkdays, 1)
})

test('một cặp nằm trong buổi sáng được tính trọn nửa công', () => {
  const result = calculateSplitShiftWork({
    punchPairs: [{ checkIn: '08:30', checkOut: '12:00' }],
    splitShift
  })

  assert.equal(result.regularWorkdays, 0.5)
  assert.equal(result.workedMinutes, 210)
})

test('buổi làm thiếu giờ được tính công theo tỷ lệ phút trong khung buổi', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:00',
    checkOut: '10:00',
    punchPairs: [{ checkIn: '08:00', checkOut: '10:00' }],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 1.5)
  assert.equal(result.regularWorkdays, 90 / 210 * 0.5)
  assert.equal(result.splitShiftBreakdown[0].workdays, 90 / 210 * 0.5)
})

test('mô tả rõ số công riêng của từng buổi trên bảng công', () => {
  const formula = describeDayWorkFormula({
    calculationMode: 'split-shift',
    workdaysExact: 1,
    splitShiftBreakdown: [
      { label: 'Buổi sáng', minutes: 210, workdays: 0.5 },
      { label: 'Buổi chiều', minutes: 270, workdays: 0.5 }
    ]
  })

  assert.match(formula, /Buổi sáng 210p = 0.5 công/)
  assert.match(formula, /Tổng 1 công/)
})

test('giờ chấm hoàn toàn ngoài khung ca là 0 công và tooltip không hiện công giả', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '18:00', checkOut: '19:00', splitShift
  })
  assert.equal(result.workedMinutes, 0)
  assert.equal(result.regularWorkdays, 0)
  assert.match(describeDayWorkFormula({
    checkIn: '18:00', checkOut: '19:00',
    calculationMode: result.calculationMode,
    splitShiftBreakdown: result.splitShiftBreakdown,
    workdaysExact: result.regularWorkdays,
    workedMinutes: result.workedMinutes
  }), /Ngoài khung giờ hai buổi = 0 công/)
})

test('giữ nguyên 8 giờ khi hai buổi đều có đủ cặp chấm', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:30',
    checkOut: '17:30',
    punchPairs: [
      { checkIn: '08:30', checkOut: '12:00' },
      { checkIn: '13:00', checkOut: '17:30' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 8)
  assert.equal(result.regularWorkdays, 1)
  assert.equal(result.calculationMode, 'split-shift')
})

test('mức công tối đa của từng buổi được áp dụng cả khi đủ hai buổi', () => {
  const configuredSplitShift = {
    ...splitShift,
    morning: { ...splitShift.morning, workdays: 0.4 },
    afternoon: { ...splitShift.afternoon, workdays: 0.4 }
  }
  const fullDay = calculateAttendanceMetrics({
    checkIn: '08:30',
    checkOut: '17:30',
    punchPairs: [
      { checkIn: '08:30', checkOut: '12:00' },
      { checkIn: '13:00', checkOut: '17:30' }
    ],
    splitShift: configuredSplitShift,
    autoCalculateOvertime: false
  })
  const morning = calculateAttendanceMetrics({
    checkIn: '08:30',
    checkOut: '12:00',
    punchPairs: [{ checkIn: '08:30', checkOut: '12:00' }],
    splitShift: configuredSplitShift,
    autoCalculateOvertime: false
  })

  assert.equal(fullDay.regularWorkdays, 0.8)
  assert.equal(morning.regularWorkdays, 0.4)
})

test('tính từ Vào đầu đến Ra cuối khi thiếu Ra buổi chiều', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:00',
    checkOut: '12:00',
    punchPairs: [
      { checkIn: '08:00', checkOut: '12:00' },
      { checkIn: '13:00', checkOut: '' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 3.5)
  assert.equal(result.regularWorkdays, 0.5)
  assert.equal(result.calculationMode, 'split-shift')
})

test('cặp thiếu lượt vẫn tính theo phút của buổi có dữ liệu', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:00',
    checkOut: '10:00',
    punchPairs: [
      { checkIn: '08:00', checkOut: '10:00' },
      { checkIn: '13:00', checkOut: '' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 1.5)
  assert.equal(result.regularWorkdays, 90 / 210 * 0.5)
})

test('tính đủ khoảng đầu-cuối khi có Ra sau nửa buổi nhưng thiếu Vào tương ứng', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:00',
    checkOut: '17:30',
    punchPairs: [
      { checkIn: '08:00', checkOut: '12:00' },
      { checkIn: '', checkOut: '17:30' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 8)
  assert.equal(result.regularWorkdays, 1)
  assert.equal(result.calculationMode, 'split-shift')
})

test('tính đủ khoảng đầu-cuối khi thiếu Ra buổi sáng nhưng có đủ buổi chiều', () => {
  const result = calculateAttendanceMetrics({
    checkIn: '08:00',
    checkOut: '17:30',
    punchPairs: [
      { checkIn: '08:00', checkOut: '' },
      { checkIn: '13:00', checkOut: '17:30' }
    ],
    splitShift,
    autoCalculateOvertime: false
  })

  assert.equal(result.hours, 8)
  assert.equal(result.regularWorkdays, 1)
})
