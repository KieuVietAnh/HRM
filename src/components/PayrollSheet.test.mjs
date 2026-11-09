import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const compiled = await build({
  stdin: { contents: `export { default as Sheet } from './PayrollSheet.jsx'; export { hooks } from 'react'; export { db } from '../services/firebase';`,
    resolveDir: new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsxFactory: 'h', jsxFragment: '"fragment"',
  banner: { js: 'const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });' },
  plugins: [{ name: 'payroll-test', setup(api) {
    api.onResolve({ filter: /^react$|[\\/]services[\\/](firebase|attendancePenaltiesDb|employeeLeave)$|[\\/]Payroll(Table|Summary)$/ }, args => ({ path: args.path, namespace: 'test' }))
    api.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'react' ? `
      export const hooks = { values: [], index: 0, effects: [], deps: [] };
      export const useState = initial => {
        const i = hooks.index++;
        if (!(i in hooks.values)) hooks.values[i] = initial;
        return [hooks.values[i], value => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value }];
      };
      export const useMemo = fn => fn();
      export const useEffect = (fn, deps) => {
        const i = hooks.index++;
        if (!hooks.deps[i] || deps.some((value, j) => value !== hooks.deps[i][j])) hooks.effects.push(fn);
        hooks.deps[i] = deps;
      };`
      : args.path.endsWith('firebase') ? `
        export const db = { snapshot: null, writes: [], failHistory: false,
          employees: { e: { tong_luong: 13000000, ngay_lam_chinh_thuc: '2026-11-11' } },
          history: { e: { employeeId: 'e', entries: [{ effectiveDate: '2026-11-01', amount: 13000000, probationPercent: 80 }] } } };
        export const fbGet = async path => {
          if (path.includes('payrollMonthSnapshots')) return db.snapshot;
          if (path === 'hr/employeeSalaryHistory') { if (db.failHistory) throw Error('Lỗi đọc lịch sử'); return db.history; }
          return {};
        };
        export const fbGetEmployeesDirectory = async () => db.employees;
        export const fbSet = async (path, data) => { db.writes.push({ path, data: structuredClone(data) }); db.snapshot = structuredClone(data); };`
      : args.path.endsWith('attendancePenaltiesDb') ? 'export const getPenaltiesByMonth = async () => [];'
      : args.path.endsWith('employeeLeave') ? 'export const loadEmployeeLeaveSettings = async () => ({});'
      : args.path.endsWith('PayrollSummary') ? 'export default function PayrollSummary() {}'
      : 'export default function PayrollTable() {}'
    }))
  } }]
})
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)]
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : tree && typeof tree === 'object' ? tree.children.map(text).join(' ') : ''

const harness = () => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const { Sheet, hooks, db } = module.exports
  let month = '2026-11'
  let rows = [{ employeeId: 'e', workdays: 26, days: new Map(Array.from({ length: 26 }, (_, i) => [
    `2026-11-${String(i + 1).padStart(2, '0')}`, { workdays: 1 }
  ])) }]
  const render = () => { hooks.index = 0; return Sheet({ rows, month, companyId: 'speego-original' }) }
  return { db, render,
    setRows: value => { rows = value }, setMonth: value => { month = value },
    async load() {
      render(); for (const effect of hooks.effects.splice(0)) effect(); await new Promise(setImmediate)
      nodes(render()).find(n => n.type?.name === 'PayrollSummary')?.props.onStateChange({ ready: true, dirty: false, saving: false, data: { records: {} } })
      return render()
    },
    table() { return nodes(render()).find(n => n.type?.name === 'PayrollTable').props },
    button(label) { return nodes(render()).find(n => n.type === 'button' && text(n).includes(label)) }
  }
}

test('giao diện tính hai giai đoạn, chốt và giữ nguyên khi công/hồ sơ thay đổi', async () => {
  const app = harness()
  await app.load()
  assert.equal(app.table().rows[0].payroll.amount, 12000000)
  assert.equal(app.button('Chốt bảng lương').props.disabled, false)
  await app.button('Chốt bảng lương').props.onClick()
  assert.equal(app.db.writes.length, 1)
  app.db.employees.e.tong_luong = 99000000
  app.setRows([])
  assert.equal(app.table().rows[0].payroll.amount, 12000000)
  assert.equal(app.button('Chốt bảng lương'), undefined)
  assert.equal(app.db.writes[0].data.standardWorkdays, 26)
  const reopened = harness()
  reopened.db.snapshot = app.db.snapshot
  reopened.db.failHistory = true
  await reopened.load()
  assert.equal(reopened.table().rows[0].payroll.amount, 12000000)
  assert.equal(reopened.button('Chốt bảng lương'), undefined)
})

test('lỗi tải lịch sử không cho xem hoặc chốt bảng tính thiếu dữ liệu', async () => {
  const app = harness()
  app.db.failHistory = true
  assert.match(text(await app.load()), /Lỗi đọc lịch sử/)
  assert.equal(app.button('Chốt bảng lương'), undefined)
})

test('bảng nhập hiện trước, bảng chỉ xem nằm trong phần đối chiếu thu gọn', async () => {
  const app = harness()
  const tree = await app.load()
  const rendered = nodes(tree)
  const summaryIndex = rendered.findIndex(node => node.type?.name === 'PayrollSummary')
  const tableIndex = rendered.findIndex(node => node.type?.name === 'PayrollTable')
  const reference = rendered.find(node => node.type === 'details')
  assert.ok(summaryIndex >= 0 && summaryIndex < tableIndex)
  assert.equal(Boolean(reference.props.open), false)
  assert.ok(nodes(reference).some(node => node.type?.name === 'PayrollTable'))
  assert.match(text(reference), /chỉ xem/)
  assert.equal(rendered[summaryIndex].props.readOnly, false)
})

test('phải lưu hoặc bỏ nháp phân bổ trước khi chốt cả hai bảng', async () => {
  const app = harness()
  await app.load()
  const summary = nodes(app.render()).find(n => n.type?.name === 'PayrollSummary')
  summary.props.onStateChange({ ready: true, dirty: true, saving: false })
  assert.equal(app.button('Chốt bảng lương').props.disabled, true)
  summary.props.onStateChange({ ready: true, dirty: false, saving: false, data: { records: { e: { mainPay: 12000000 } } } })
  await app.button('Chốt bảng lương').props.onClick()
  assert.equal(app.db.snapshot.payrollSummary.records.e.mainPay, 12000000)
  assert.equal(nodes(app.render()).find(n => n.type?.name === 'PayrollSummary').props.readOnly, true)
})

test('mức cũ phải đối chiếu trước khi chốt; công chuẩn sai phải bị chặn', async () => {
  const app = harness()
  app.db.history.e.entries[0].legacy = true
  await app.load()
  assert.equal(app.button('Chốt bảng lương').props.disabled, true)
  nodes(app.render()).find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  assert.equal(app.button('Chốt bảng lương').props.disabled, false)
  nodes(app.render()).find(n => n.props['aria-label'] === 'Công chuẩn tháng').props.onChange({ target: { value: 0 } })
  assert.equal(app.button('Chốt bảng lương').props.disabled, true)
})
