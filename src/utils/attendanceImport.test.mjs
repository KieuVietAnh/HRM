import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeAttendanceSheet,
  buildAttendanceHeaderSignature,
  buildAttendanceTemplateBindings,
  classifyMatrixAttendanceCell,
  collectAttendancePunches,
  expandAttendanceMergedCells,
  findMatrixDayHeader,
  findAttendancePunchColumns,
  mapAttendanceColumns,
  parseAttendanceDate,
  parseAttendanceDecimal,
  parseAttendanceTime,
  resolveAttendanceTemplateBindings
} from './attendanceImport.js'

test('finds numbered punch pairs in the August attendance export', () => {
  const headers = [
    'Mã N.Viên', 'Tên nhân viên', 'Ngày',
    'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2', 'Vào 3', 'Ra 3',
    'Vào Trễ', 'Ra sớm'
  ]

  assert.deepEqual(findAttendancePunchColumns(headers), {
    checkInIndexes: [3, 5, 7],
    checkOutIndexes: [4, 6, 8],
    allIndexes: [3, 4, 5, 6, 7, 8]
  })
})

test('supports a simple Vào/Ra pair without including summary columns', () => {
  const headers = ['Mã NV', 'Vào', 'Ra', 'Vào trễ', 'Ra sớm']

  assert.deepEqual(findAttendancePunchColumns(headers), {
    checkInIndexes: [1],
    checkOutIndexes: [2],
    allIndexes: [1, 2]
  })
})

test('uses the first Vào and last actual Ra instead of an unmatched later Vào', () => {
  const columns = findAttendancePunchColumns([
    'Mã NV', 'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2'
  ])
  const result = collectAttendancePunches(
    ['00001', '08:26', '17:36', '17:58', ''],
    columns
  )

  assert.deepEqual(result, {
    checkIn: '08:26',
    checkOut: '17:36',
    punches: ['08:26', '17:36', '17:58'],
    punchPairs: [
      { checkIn: '08:26', checkOut: '17:36' },
      { checkIn: '17:58', checkOut: '' }
    ]
  })
})

test('keeps a lone Ra as checkout instead of converting it to check-in', () => {
  const columns = findAttendancePunchColumns(['Mã NV', 'Vào 1', 'Ra 1'])
  const result = collectAttendancePunches(['00001', '', '17:30'], columns)

  assert.equal(result.checkIn, '')
  assert.equal(result.checkOut, '17:30')
})

test('keeps the first Vào and last Ra when a split-shift punch is unmatched', () => {
  const columns = findAttendancePunchColumns([
    'Mã NV', 'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2'
  ])
  const result = collectAttendancePunches(
    ['00001', '08:00', '12:00', '', '17:30'],
    columns
  )

  assert.equal(result.checkIn, '08:00')
  assert.equal(result.checkOut, '17:30')
  assert.deepEqual(result.punchPairs, [
    { checkIn: '08:00', checkOut: '12:00' },
    { checkIn: '', checkOut: '17:30' }
  ])
})

test('parses Excel serial times and AM/PM without dropping the meridiem', () => {
  assert.equal(parseAttendanceTime(0.5).str, '12:00')
  assert.equal(parseAttendanceTime('8:30 AM').str, '08:30')
  assert.equal(parseAttendanceTime('8:30 PM').str, '20:30')
  assert.equal(parseAttendanceTime('12:05 AM').str, '00:05')
})

test('prefers Vietnamese day/month order for ambiguous text dates', () => {
  assert.equal(parseAttendanceDate('01/08/2026'), '2026-08-01')
  assert.equal(parseAttendanceDate('8/27/2026'), '2026-08-27')
  assert.equal(parseAttendanceDate(46235), '2026-08-01')
})

test('maps reordered Vietnamese and English attendance headers', () => {
  const headers = [
    'Check-out', 'HỌ VÀ TÊN', 'Attendance Date', 'Employee Code',
    'Check-in', 'Bộ phận', 'Công+', 'Tổng giờ'
  ]

  assert.deepEqual(mapAttendanceColumns(headers), {
    code: 3,
    name: 1,
    machineName: -1,
    department: 5,
    position: -1,
    date: 2,
    weekday: -1,
    workdays: -1,
    hours: -1,
    extraWorkdays: 6,
    extraHours: -1,
    shift: -1,
    symbol: -1,
    extraSymbol: -1,
    totalHours: 7,
    lateMinutes: -1,
    earlyMinutes: -1,
    overtime1: -1,
    overtime2: -1,
    overtime3: -1,
    eventTime: -1
  })
})

test('does not assign Ngày công or Tổng giờ to two different meanings', () => {
  const columns = mapAttendanceColumns(['Mã NV', 'Ngày công', 'Tổng giờ'])

  assert.equal(columns.date, -1)
  assert.equal(columns.workdays, 1)
  assert.equal(columns.hours, -1)
  assert.equal(columns.totalHours, 2)
})

test('recognizes a single event-time column as attendance data', () => {
  const result = analyzeAttendanceSheet([
    ['Mã NV', 'Ngày', 'Thời gian'],
    ['00001', '01/08/2026', '08:00']
  ])

  assert.equal(result.kind, 'list')
  assert.ok(result.score > 0)
})

test('validates ISO dates and supports midnight and the Excel 1904 epoch', () => {
  assert.equal(parseAttendanceDate('2026-02-31'), null)
  assert.equal(parseAttendanceTime(0).str, '00:00')
  assert.equal(parseAttendanceDate(44773, { date1904: true }), '2026-08-01')
})

test('finds matrix day headers that use the Excel 1904 date system', () => {
  const result = findMatrixDayHeader([
    ['Mã NV', 'Họ tên', 44773, 44774, 44775, 44776],
    ['NV01', 'Nguyễn Văn A', 1, 1, 0.5, 0]
  ], 60, { date1904: true })

  assert.deepEqual(result.days, [1, 2, 3, 4])
  assert.equal(result.columns[0].year, 2026)
  assert.equal(result.columns[0].month, 8)
})

test('recognizes Giờ vào and Giờ ra punch headers', () => {
  assert.deepEqual(findAttendancePunchColumns(['Mã NV', 'Giờ vào', 'Giờ ra']), {
    checkInIndexes: [1],
    checkOutIndexes: [2],
    allIndexes: [1, 2]
  })
})

test('classifies matrix decimals before Excel time fractions', () => {
  assert.equal(parseAttendanceDecimal('0,5'), 0.5)
  assert.equal(parseAttendanceDecimal('1.234,5'), 1234.5)
  assert.equal(parseAttendanceDecimal('1,234.5'), 1234.5)
  assert.equal(parseAttendanceDecimal('8abc'), null)
  assert.deepEqual(classifyMatrixAttendanceCell(0.5), {
    kind: 'value', workdays: 0.5, hours: 4, symbol: '0.5', status: 'Nửa ngày'
  })
  assert.deepEqual(classifyMatrixAttendanceCell(0.5, { numberFormat: 'hh:mm' }), {
    kind: 'punch', times: ['12:00'], raw: '0.5'
  })
  assert.deepEqual(classifyMatrixAttendanceCell('08:00 - 17:30'), {
    kind: 'punch', times: ['08:00', '17:30'], raw: '08:00 - 17:30'
  })
})

test('preserves matrix symbols without inventing punches', () => {
  assert.deepEqual(classifyMatrixAttendanceCell('P0.5'), {
    kind: 'value', workdays: 0.5, hours: 4, symbol: 'P0.5', status: 'Phép'
  })
  assert.deepEqual(classifyMatrixAttendanceCell('OFF'), {
    kind: 'value', workdays: 0, hours: 0, symbol: 'OFF', status: 'Nghỉ'
  })
})

test('routes monthly X and P1 symbols through the existing matrix classifier', () => {
  assert.deepEqual(classifyMatrixAttendanceCell('X', { sourceFormat: 'monthly-attendance' }), {
    kind: 'value', workdays: 0, hours: 0, symbol: 'X', status: 'Nghỉ theo lịch'
  })
  assert.deepEqual(classifyMatrixAttendanceCell('P1', { sourceFormat: 'monthly-attendance' }), {
    kind: 'value', workdays: 1, hours: 8, symbol: 'P1', status: 'Phép năm'
  })
})

test('keeps monthly holiday multipliers explicit without changing generic X behavior', () => {
  assert.equal(classifyMatrixAttendanceCell('X1', { sourceFormat: 'monthly-attendance' }).workdays, 1)
  assert.equal(classifyMatrixAttendanceCell('X2', { sourceFormat: 'monthly-attendance' }).workdays, 2)
  assert.equal(classifyMatrixAttendanceCell('X3', { sourceFormat: 'monthly-attendance' }).workdays, 3)
  assert.equal(classifyMatrixAttendanceCell('X').workdays, 1)
})

test('monthly work units ignore Excel time styling and reject punches, negative units and unknown P words', () => {
  const options = { sourceFormat: 'monthly-attendance', numberFormat: 'hh:mm' }
  assert.equal(classifyMatrixAttendanceCell(0.5, options).workdays, 0.5)
  for (const value of ['08:00 17:00', -1, 'Potato']) {
    assert.equal(classifyMatrixAttendanceCell(value, options).kind, 'unknown')
  }
})

test('restores a confirmed mapping after columns are reordered', () => {
  const original = ['Mã chấm công', 'Tên người lao động', 'Ngày làm', 'Số công']
  const bindings = { code: 0, name: 1, date: 2, workdays: 3 }
  const template = { bindingHeaders: buildAttendanceTemplateBindings(original, bindings) }
  const reordered = ['Số công', 'Ngày làm', 'Tên người lao động', 'Mã chấm công']

  assert.equal(
    buildAttendanceHeaderSignature(original),
    buildAttendanceHeaderSignature(reordered)
  )
  assert.deepEqual(resolveAttendanceTemplateBindings(reordered, template), {
    code: 3, name: 2, date: 1, workdays: 0
  })
})

test('chooses the real matrix header instead of a numeric employee row', () => {
  const rows = [
    ['BẢNG CÔNG T8/2026'],
    ['Họ tên', 'Bộ phận', ...Array.from({ length: 31 }, (_, index) => index + 1)],
    ['Nguyễn Văn A', 'Sale', ...Array(25).fill(1), 2, 6, 21, 21, 26, 26]
  ]

  const result = findMatrixDayHeader(rows)
  assert.equal(result.rowIndex, 1)
  assert.deepEqual(result.days, Array.from({ length: 31 }, (_, index) => index + 1))
})

test('accepts paired day columns but rejects a non-consecutive numeric summary row', () => {
  const pairedDays = Array.from({ length: 10 }, (_, index) => [index + 1, index + 1]).flat()
  const rows = [
    ['Mã NV', 'Tên NV', ...pairedDays],
    ['NV01', 'Nguyễn Văn A', 1, 1, 1, 1, 2, 6, 21, 21, 26, 26]
  ]

  const result = findMatrixDayHeader(rows)
  assert.equal(result.rowIndex, 0)
  assert.deepEqual(result.days, Array.from({ length: 10 }, (_, index) => index + 1))
})

test('accepts a short 1-to-4-day matrix when the row also contains identity headers', () => {
  const oneDay = findMatrixDayHeader([
    ['Mã NV', 'Họ tên', 1],
    ['NV01', 'Nguyễn Văn A', 0.5]
  ])
  const fourDays = findMatrixDayHeader([
    ['Mã NV', 'Họ tên', 1, 2, 3, 4],
    ['NV01', 'Nguyễn Văn A', 1, 1, 0.5, 0]
  ])

  assert.deepEqual(oneDay.days, [1])
  assert.deepEqual(fourDays.days, [1, 2, 3, 4])
})

test('expands merged day headers so grouped Vào/Ra columns keep their parent day', () => {
  const rows = expandAttendanceMergedCells([
    ['Mã NV', 'Họ tên', 1, '', 2, ''],
    ['', '', 'Vào', 'Ra', 'Vào', 'Ra']
  ], [
    { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } }
  ])

  assert.deepEqual(rows[0], ['Mã NV', 'Họ tên', 1, 1, 2, 2])
  assert.deepEqual(findMatrixDayHeader(rows).days, [1, 2])
})

test('scores an attendance detail sheet above a reconciliation sheet', () => {
  const reconciliationRows = [
    ['Mã máy', 'Tên từ máy/file', 'Mã NV Lumi', 'Kết quả'],
    ['001', 'Nguyễn Văn A', 'NV01', 'Đã ghép']
  ]
  const detailRows = [
    ['Ghi chú xuất dữ liệu'],
    ['Employee Code', 'Employee Name', 'Work Date', 'Time In', 'Time Out'],
    ['NV01', 'Nguyễn Văn A', '2026-08-01', '08:00', '17:00']
  ]

  assert.equal(analyzeAttendanceSheet(reconciliationRows).score, 0)
  assert.equal(analyzeAttendanceSheet(detailRows).kind, 'list')
  assert.ok(analyzeAttendanceSheet(detailRows).score > 0)
})
