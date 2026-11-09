import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { build } from 'esbuild'
import XLSX from 'xlsx-js-style'
import { planAttendanceImport } from '../services/attendanceImportService.js'

// Exercise the actual modal handlers without a browser or a database. Hooks and
// JSX are represented as plain objects; all persistence is replaced by spies.
const compiled = await build({
  stdin: {
    contents: `export { default as Modal } from './AttendanceImportModal.jsx';
      export { hooks } from 'react'; export { writes } from '../services/firebase';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  jsx: 'transform', jsxFactory: 'h', jsxFragment: 'fragment',
  banner: { js: 'const fragment = "fragment"; const h = (type, props, ...children) => ({type, props: props || {}, children: children.flat(Infinity)});' },
  plugins: [{
    name: 'isolated-modal-test',
    setup(api) {
      api.onResolve({ filter: /^(react)$|[\\/]services[\\/](firebase|employeeDirectory)$|[\\/]contexts[\\/]AuthContext$/ }, args => ({ path: args.path, namespace: 'test' }))
      api.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents:
        args.path === 'react' ? `
          export const hooks = { values: [], index: 0 };
          export const useState = initial => {
            const i = hooks.index++;
            if (!(i in hooks.values)) hooks.values[i] = initial;
            return [hooks.values[i], value => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value }];
          };
          export const useMemo = fn => fn();
          export const useRef = initial => useState({ current: initial })[0];`
          : args.path.endsWith('AuthContext') ? `export const useAuth = () => ({ user: { id: 'test-admin', role: 'admin' } });`
          : args.path.endsWith('employeeDirectory') ? `export const createEmployeeDirectoryProfile = () => { throw Error('Unexpected profile write'); };`
          : `export const writes = [];
             export const fbGet = async () => ({});
             export const fbSet = async (...args) => writes.push(args);
             export const fbUpdate = async (...args) => writes.push(args);`
      }))
    }
  }]
})

const makeHarness = (employees, employeeMappings = {}, attendanceSettings = {}) => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const { Modal, hooks, writes } = module.exports
  const props = { employees, employeeMappings, attendanceSettings, isOpen: true, onClose() {}, onSave() {} }
  return {
    writes,
    render() { hooks.index = 0; return Modal(props) },
    detailPreview() { return hooks.values.find(value => value?.isDetailedAttendanceList) },
    matrixPreview() { return hooks.values.find(value => value?.isMonthlyMatrix) }
  }
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)]
const textOf = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : tree && typeof tree === 'object' ? tree.children.map(textOf).join(' ') : ''
const findButton = (tree, label) => nodes(tree).find(node => node.type === 'button' && textOf(node).includes(label))
const makeWorkbook = ({ duplicate = false, unknown = false } = {}) => {
  const header = ['STT', '', 'Họ tên', 'Bộ phận', 'Ca làm', 'Loại HĐ', 'Trạng thái', 'Tổng công', ...Array.from({ length: 32 }, (_, i) => i + 1)]
  const employees = Array.from({ length: 40 }, (_, i) => ({
    id: `profile-${i}`, employeeId: `nv${i}`, ho_va_ten: `Nhân Viên ${i}`, bo_phan: 'Sale'
  }))
  const rows = [['BẢNG CÔNG T8/2026'], ['1/8/2026 - 31/8/2026'], [], [], [], header,
    ...employees.map((employee, i) => [i + 1, '', duplicate && i === 1 ? employees[0].ho_va_ten : employee.ho_va_ten,
      'Sale', 'Ca ngày', 'Chính thức', 'Đang làm', 29.5,
      ...Array.from({ length: 32 }, (_, d) => d === 0 ? (unknown ? 'BAD' : 0.5) : d === 1 ? 'X' : 1)]),
    [], ['', '', 'Tuần 1'], ['', '', 'Danh sách VP']]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Selected')
  return { bytes: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), employees }
}
const upload = async (harness, bytes) => {
  let tree = harness.render()
  nodes(tree).find(node => node.type === 'input' && node.props.type === 'file').props.onChange({
    target: { files: [{ name: 'renamed.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }] }
  })
  tree = harness.render()
  await findButton(tree, 'Phân tích').props.onClick()
  return harness.render()
}

const makeDetailWorkbook = () => {
  const headers = [
    'Mã N.Viên', 'Tên nhân viên', 'Phòng ban', 'Chức vụ', 'Ngày', 'Thứ',
    'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2', 'Vào 3', 'Ra 3', 'Công', 'Giờ',
    'Công+', 'Giờ+', 'Vào Trễ', 'Ra sớm', 'TC1', 'TC2', 'TC3',
    'Tên ca', 'Kí hiệu', 'Kí hiệu+', 'Tổng giờ'
  ]
  const row = (date, checkIn, checkOut, workdays, hours) => [
    '00026', 'Nguyễn Mỹ Hạnh', 'Văn phòng', '-----', date, 'Bảy',
    checkIn, checkOut, '', '', '', '', workdays, hours,
    0, 0, 130, 0, 0.5, 0, 0, 'HC', 'Tr+', '', hours + 0.5
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['CHI TIẾT CHẤM CÔNG'], ['Từ ngày 01/08/2026 đến ngày 31/08/2026'],
    headers,
    row(46242, '09:40', '17:36', 0.73, 5.83),
    row(46243, '', '', 1, 8),
    row(46244, '08:00', '', 1, 8)
  ]), 'Xuất lưới')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

globalThis.crypto ||= webcrypto
globalThis.alert = message => { throw new Error(`Unexpected alert: ${message}`) }

test('monthly upload previews all 40 people / 1240 days without database writes', async () => {
  const { bytes, employees } = makeWorkbook()
  const harness = makeHarness(employees, {
    'excel::no-code::nhanvien0': { employeeId: 'profile-1' },
    'monthlymatrixspeegooriginal::no-code::nhanvien0salerow7': { employeeId: 'profile-1' }
  })
  let tree = await upload(harness, bytes)
  assert.equal(harness.writes.length, 0)
  const matrixLog = harness.matrixPreview().logs[0]
  assert.equal(matrixLog.importFormat, 'attendance-monthly-matrix')
  assert.equal(matrixLog.sourceDepartment, 'Sale')
  assert.equal(matrixLog.monthlyDepartment, 'Sale')
  assert.equal(nodes(tree).filter(node => node.type === 'table').length, 0, 'matched rows stay collapsed')
  findButton(tree, 'Xem tất cả nhân viên').props.onClick()
  tree = harness.render()
  findButton(tree, 'Xem chi tiết theo ngày').props.onClick()
  tree = harness.render()
  const tables = nodes(tree).filter(node => node.type === 'table')
  const people = nodes(tables[0]).filter(node => node.type === 'select')
  assert.equal(people.length, 40)
  assert.equal(people[0].props.value, 'profile-0', 'saved wrong mapping must not win')
  const days = nodes(tables[1]).filter(node => node.type === 'tbody')[0].children
  assert.equal(days.length, 30, 'show only the first page of days')
  assert.equal(harness.matrixPreview().logs.length, 1240)
  assert.match(textOf(days[0]), /01\/08\/2026.*0.5.*0.5.*Đã ghép/)
  assert.match(textOf(days[1]), /02\/08\/2026.*X.*0.*Đã ghép/)
  assert.equal(Boolean(findButton(tree, 'Xác nhận Import').props.disabled), false)
})

test('missing employee has no similar-name suggestion and cannot be assigned to another person', async () => {
  const { bytes, employees } = makeWorkbook()
  const harness = makeHarness(employees.slice(1))
  let tree = await upload(harness, bytes)
  const select = nodes(tree).find(node => node.type === 'select' && node.props.value === '')
  assert.ok(select)
  assert.equal(select.children.some(option => option.props.value === 'profile-1'), false)
  select.props.onChange({ target: { value: 'profile-1' } })
  tree = harness.render()
  assert.match(textOf(tree), /Chưa có hồ sơ trùng họ tên/)
  assert.equal(Boolean(findButton(tree, 'Xác nhận Import').props.disabled), true)
  assert.equal(harness.writes.length, 0)
})

test('duplicate source rows are retained and block import instead of silently losing days', async () => {
  const { bytes, employees } = makeWorkbook({ duplicate: true })
  const harness = makeHarness(employees)
  const tree = await upload(harness, bytes)
  assert.match(textOf(tree), /nhiều dòng cùng nhân viên/)
  assert.equal(Boolean(findButton(tree, 'Xác nhận Import').props.disabled), true)
  assert.equal(harness.writes.length, 0)
})

test('unsupported daily cells block confirmation before any writes', async () => {
  const { bytes, employees } = makeWorkbook({ unknown: true })
  const harness = makeHarness(employees)
  const tree = await upload(harness, bytes)
  assert.equal(Boolean(findButton(tree, 'Xác nhận Import').props.disabled), true)
  assert.equal(harness.writes.length, 0)
})

test('actual supplied workbook requires sheet selection and previews August only', {
  skip: !process.env.ATTENDANCE_SAMPLE_PATH
}, async () => {
  const bytes = readFileSync(process.env.ATTENDANCE_SAMPLE_PATH)
  const harness = makeHarness([])
  let tree = await upload(harness, bytes)
  assert.equal(findButton(tree, 'Xác nhận Import'), undefined)
  const select = nodes(tree).find(node => node.type === 'select' && node.children.some(option => option.props.value === 'BẢNG CÔNG T82026'))
  assert.ok(select)
  select.props.onChange({ target: { value: 'BẢNG CÔNG T82026' } })
  tree = harness.render()
  await findButton(tree, 'Phân tích sheet').props.onClick()
  tree = harness.render()
  findButton(tree, 'Xem chi tiết theo ngày').props.onClick()
  tree = harness.render()
  const tables = nodes(tree).filter(node => node.type === 'table')
  assert.equal(nodes(tables[0]).filter(node => node.type === 'select').length, 40)
  assert.equal(nodes(tables[1]).filter(node => node.type === 'tbody')[0].children.length, 30)
  assert.equal(harness.matrixPreview().logs.length, 1240)
  assert.match(textOf(tables[0]), /Nguyễn Đức Anh/)
  assert.match(textOf(tables[0]), /Tô Châu/)
  assert.equal(harness.writes.length, 0)
})

test('replacement workbook with full-date columns previews its single sheet and 34 employees', {
  skip: !process.env.NEW_ATTENDANCE_FILE
}, async () => {
  const bytes = readFileSync(process.env.NEW_ATTENDANCE_FILE)
  const harness = makeHarness([])
  let tree = await upload(harness, bytes)
  findButton(tree, 'Xem chi tiết theo ngày').props.onClick()
  tree = harness.render()
  const tables = nodes(tree).filter(node => node.type === 'table')
  assert.equal(nodes(tables[0]).filter(node => node.type === 'select').length, 34)
  assert.equal(nodes(tables[1]).filter(node => node.type === 'tbody')[0].children.length, 30)
  assert.equal(harness.matrixPreview().logs.length, 1054)
  assert.match(textOf(tables[0]), /Nguyễn Minh Nhựt/)
  assert.match(textOf(tables[0]), /Mai Văn Tuấn/)
  assert.equal(harness.writes.length, 0)
})

test('daily-detail workbook uses punch times, not source totals or late/overtime values', async () => {
  const harness = makeHarness([{
    id: 'profile-26', employeeId: '00026', ho_va_ten: 'Nguyễn Mỹ Hạnh',
    bo_phan: 'Văn phòng', ca_lam_viec: '09:00-18:00'
  }])
  let tree = await upload(harness, makeDetailWorkbook())
  const preview = harness.detailPreview()
  assert.ok(preview)
  assert.equal(preview.count, 3, 'days without punches must replace previously imported source workdays with zero')
  assert.equal(nodes(tree).filter(node => node.type === 'table').length, 0)
  findButton(tree, 'Xem chi tiết theo ngày').props.onClick()
  tree = harness.render()
  assert.match(textOf(tree), /Giờ vào.*Giờ ra.*Công.*Kết quả/)
  assert.match(textOf(tree), /1 dòng không có giờ vào\/ra: tính 0 công, 0 giờ/)
  const complete = preview.logs.find(log => log.date === '2026-08-08')
  assert.equal(complete.vao, '09:40')
  assert.equal(complete.ra, '17:36')
  assert.equal(complete.calculationMode, 'punches')
  assert.equal(complete.importFormat, 'attendance-detail-list')
  assert.ok(Math.abs(complete.hours - 476 / 60) < 0.001)
  assert.ok(Math.abs(complete.cong - 476 / 480) < 0.001)
  assert.equal(complete.tc1, 0)
  assert.equal(complete.congPlus, 0)
  assert.equal(complete.sourceWorkdays, null)
  assert.equal(complete.sourceHours, null)
  assert.equal(complete.sourceValues.lateMinutes, null)
  assert.equal(complete.sourceSymbol, '')
  assert.equal(complete.overtimeAutoDisabled, false)
  assert.equal(complete.lateMinutes, 40, 'late minutes must use the employee shift, not Excel 130')
  assert.equal(complete.earlyMinutes, 24)
  const partial = preview.logs.find(log => log.date === '2026-08-10')
  assert.equal(partial.vao, '08:00')
  assert.equal(partial.ra, '')
  assert.equal(partial.cong, 0)
  assert.equal(partial.hours, 0)
  const noPunch = preview.logs.find(log => log.date === '2026-08-09')
  assert.equal(noPunch.cong, 0)
  assert.equal(noPunch.hours, 0)
  assert.equal(noPunch.lateMinutes, 0)
  assert.equal(noPunch.tc1, 0)
  assert.equal(noPunch.sourceValues.workdays, null)
  const previousImport = preview.logs.map((log, index) => ({
    ...log, id: `old-${index}`, importFormat: undefined,
    sourceType: 'excel-import', calculationMode: 'source-value',
    shiftName: 'HC', tenCa: 'HC', cong: 0.73, hours: 5.83,
    lateMinutes: 130, tc1: 0.5
  }))
  const reimport = planAttendanceImport({ incomingLogs: preview.logs, existingLogs: previousImport })
  assert.equal(reimport.inserts.length, 0)
  assert.equal(reimport.updates.length, 3)
  assert.equal(harness.writes.length, 0)
})

test('daily-detail preview uses the configured morning and afternoon windows', async () => {
  const settings = {
    standardWorkMinutes: 480,
    unpaidBreakMinutes: 0,
    shifts: {
      administrative: {
        name: 'Ca Hành chính', standardCheckIn: '08:30', standardCheckOut: '17:30',
        splitShift: {
          enabled: true,
          morning: { start: '08:30', end: '12:00', workdays: 0.5 },
          afternoon: { start: '13:00', end: '17:30', workdays: 0.5 }
        }
      }
    }
  }
  const harness = makeHarness([{
    id: 'profile-26', employeeId: '00026', ho_va_ten: 'Nguyễn Mỹ Hạnh',
    bo_phan: 'Văn phòng', ca_lam_viec: 'Ca Hành chính'
  }], {}, settings)
  await upload(harness, makeDetailWorkbook())
  const complete = harness.detailPreview().logs.find(log => log.date === '2026-08-08')
  assert.equal(complete.hours, 410 / 60)
  assert.equal(complete.cong, 140 / 210 * 0.5 + 0.5)
  assert.equal(complete.lateMinutes, 70)
  assert.equal(complete.tc1, 0)
  assert.equal(harness.writes.length, 0)
})

test('daily-detail preview recalculates workdays after matching the employee shift', async () => {
  const settings = {
    shifts: {
      administrative: {
        name: 'Ca Hành chính', standardCheckIn: '08:30', standardCheckOut: '17:30',
        splitShift: {
          enabled: true,
          morning: { start: '08:30', end: '12:00', workdays: 0.5 },
          afternoon: { start: '13:00', end: '17:30', workdays: 0.5 }
        }
      },
      saleMorning: {
        name: 'Ca Sáng Sale', standardCheckIn: '04:00', standardCheckOut: '13:30',
        splitShift: {
          enabled: true,
          morning: { start: '04:00', end: '08:00', workdays: 0.5 },
          afternoon: { start: '09:30', end: '13:30', workdays: 0.5 }
        }
      }
    }
  }
  const harness = makeHarness([{
    id: 'profile-26', employeeId: '00026', ho_va_ten: 'Nguyễn Mỹ Hạnh',
    bo_phan: 'Sale', ca_lam_viec: 'Ca Sáng Sale'
  }], {}, settings)
  await upload(harness, makeDetailWorkbook())
  const complete = harness.detailPreview().logs.find(log => log.date === '2026-08-08')
  assert.equal(complete.employeeId, 'profile-26')
  assert.equal(complete.hours, 230 / 60)
  assert.equal(complete.cong, 230 / 240 * 0.5)
})

test('daily-detail workbook previews 34 employees and zeros no-punch days without writes', {
  skip: !process.env.DETAIL_ATTENDANCE_FILE
}, async () => {
  const bytes = readFileSync(process.env.DETAIL_ATTENDANCE_FILE)
  const harness = makeHarness([])
  let tree = await upload(harness, bytes)
  assert.match(textOf(tree), /Chi tiết chấm công theo ngày/)
  findButton(tree, 'Xem chi tiết theo ngày').props.onClick()
  tree = harness.render()
  const tables = nodes(tree).filter(node => node.type === 'table')
  assert.equal(nodes(tables[0]).filter(node => node.type === 'select').length, 34)
  assert.equal(nodes(tables[1]).filter(node => node.type === 'tbody')[0].children.length, 30)
  assert.equal(harness.detailPreview().logs.length, 1054)
  assert.match(textOf(tables[0]), /Đặng Thùy Liên/)
  assert.match(textOf(tables[0]), /Hồ Ngọc Phú/)
  assert.match(textOf(tables[1]), /01\/08\/2026.*08:20.*17:53/)
  const row = harness.detailPreview().logs.find(log => log.provenance.row === 786)
  assert.equal(row.sourceEmployeeName, 'Nguyễn Mỹ Hạnh')
  assert.equal(row.vao, '09:40')
  assert.equal(row.ra, '17:36')
  assert.equal(row.sourceWorkdays, null)
  assert.equal(row.tc1, 0)
  const noPunch = harness.detailPreview().logs.find(log => log.provenance.row === 5)
  assert.equal(noPunch.cong, 0)
  assert.equal(noPunch.hours, 0)
  assert.equal(noPunch.sourceWorkdays, null)
  assert.match(harness.detailPreview().warnings[0], /469 dòng không có giờ vào\/ra/)
  assert.equal(harness.writes.length, 0)
})
