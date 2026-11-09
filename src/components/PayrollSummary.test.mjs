import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const compiled = await build({
  stdin: { contents: `export { default as Summary } from './PayrollSummary.jsx'; export { hooks } from 'react'; export { db } from '../services/payrollSummary'; export { excel } from 'xlsx';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsxFactory: 'h', jsxFragment: '"fragment"', loader: { '.css': 'empty' },
  banner: { js: 'const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });' },
  plugins: [{ name: 'payroll-summary-test', setup(api) {
    api.onResolve({ filter: /^react$|^xlsx$|[\\/]contexts[\\/]AuthContext$|[\\/]services[\\/](firebase|supabase|payrollSummary)$/ }, args => ({ path: args.path, namespace: 'test' }))
    api.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'react' ? `
      export const hooks = { values: [], index: 0, effects: [], deps: [] };
      export const useState = initial => { const i = hooks.index++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], value => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value }]; };
      export const useRef = initial => { const i = hooks.index++; return hooks.values[i] ||= { current: initial }; };
      export const useMemo = fn => fn();
      export const useEffect = (fn, deps) => { const i = hooks.index++; if (!hooks.deps[i] || deps.some((v,j) => v !== hooks.deps[i][j])) hooks.effects.push(fn); hooks.deps[i] = deps; };`
      : args.path === 'xlsx' ? `export const excel = {}; export const utils = { aoa_to_sheet: rows => { excel.rows = rows; return {} }, encode_cell: ({r,c}) => r+','+c, book_new: () => ({}), book_append_sheet: () => {} }; export const writeFile = (book, name) => { excel.name = name };`
      : args.path.endsWith('AuthContext') ? `export const useAuth = () => ({ user: { id: 'hr' } });`
      : args.path.endsWith('firebase') ? `export const fbGetEmployeesDirectory = async () => ({});`
      : args.path.endsWith('supabase') ? `export const supabase = {};`
      : `export const db = { writes: [], fail: false }; export const loadPayrollSummary = async () => null;
        export const savePayrollSummary = async (client,companyId,month,previous,records) => { if(db.fail) throw Error('Lỗi lưu thử nghiệm'); db.writes.push(structuredClone(records)); return { data: { records }, updated_at: 'revision' }; };`
    }))
  } }]
})
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)]
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree && typeof tree === 'object' ? tree.children.map(text).join(' ') : ''
async function harness(extra = {}) {
  const cache = new Map()
  globalThis.sessionStorage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) }
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const { Summary, hooks, db, excel } = module.exports
  const props = { month: '2026-11', companyId: 'company', rows: [
    { employeeId: 'a', employeeName: 'Nhân viên A', workdays: 26 }, { employeeId: 'b', employeeName: 'Nhân viên B', workdays: 25 }
  ], ...extra }
  const render = () => { hooks.index = 0; return Summary(props) }
  render()
  for (const effect of hooks.effects.splice(0)) effect()
  await new Promise(setImmediate)
  const cell = (row, column) => nodes(render()).find(node => node.type === 'input' && node.props['data-row'] === row && node.props['data-column'] === column)
  const button = label => nodes(render()).find(node => node.type === 'button' && text(node).includes(label))
  return { render, cell, button, db, excel,
    paste(value, row = 0, column = 0) { let prevented = false; cell(row, column).props.onPaste({ clipboardData: { getData: () => value }, preventDefault() { prevented = true } }); return prevented }
  }
}

test('nhập cả dòng, tự tính tiền, lưu và xuất đúng các cột mới', async () => {
  const app = await harness()
  assert.equal(nodes(app.render()).filter(node => node.type === 'input' && node.props['data-row'] === 0).length, 8)
  assert.equal(app.paste('10000000\t500000\t200000\t1000000\t0\t800000\t2000000\tĐã kiểm tra'), true)
  assert.match(text(app.render()), /11.700.000 đ/)
  assert.match(text(app.render()), /8.900.000 đ/)
  app.cell(0, 0).props.onChange({ target: { value: '11000000' } })
  assert.match(text(app.render()), /9.900.000 đ/)
  app.button('Xuất Excel').props.onClick()
  assert.deepEqual(app.excel.rows[0].slice(5), ['Lương công chính', 'Lương tăng ca', 'Phụ cấp', 'Thưởng / KPI', 'Thu nhập khác', 'BHXH', 'Đã ứng', 'Ghi chú', 'Tổng lương nhận', 'Thực nhận'])
  assert.equal(app.excel.rows[1][13], 12700000)
  assert.equal(app.excel.rows[1][14], 9900000)
  await app.button('Lưu thay đổi').props.onClick()
  assert.equal(app.db.writes[0].a.mainPay, 11000000)
  assert.equal(app.db.writes[0].a.note, 'Đã kiểm tra')
  assert.equal(app.button('Lưu thay đổi').props.disabled, true)
})

test('dán lỗi không nhận một phần; lưu lỗi giữ nguyên các ô đang gõ', async () => {
  const app = await harness()
  app.paste('10000000\t0\nabc\t0')
  assert.equal(app.cell(0, 0).props.value, '')
  assert.match(text(app.render()), /Dòng 2, Lương công chính/)
  app.paste('10000000\t0')
  app.db.fail = true
  await app.button('Lưu thay đổi').props.onClick()
  assert.equal(app.cell(0, 0).props.value, '10.000.000')
  assert.equal(app.button('Lưu thay đổi').props.disabled, false)
  assert.match(text(app.render()), /Lỗi lưu thử nghiệm/)
})

test('Tab hết các cột nhập xuống dòng; Enter và Escape dùng đúng cột lương', async () => {
  const app = await harness()
  const selectors = []
  const grid = nodes(app.render()).find(node => node.props.className === 'payroll-summary-scroll')
  grid.props.ref.current = { querySelector: selector => { selectors.push(selector); return { focus() {}, select() {} } } }
  const event = key => ({ key, preventDefault() {}, currentTarget: { dataset: { original: '' }, blur() {} } })
  app.cell(0, 7).props.onKeyDown(event('Tab'))
  assert.equal(selectors.at(-1), '[data-row="1"][data-column="0"]')
  app.cell(0, 3).props.onKeyDown(event('Enter'))
  assert.equal(selectors.at(-1), '[data-row="1"][data-column="3"]')
  app.cell(0, 0).props.onChange({ target: { value: '12000000' } })
  app.cell(0, 0).props.onKeyDown(event('Escape'))
  assert.equal(app.cell(0, 0).props.value, '')
})

test('kỳ đã chốt khóa toàn bộ cột và không nhận dữ liệu dán', async () => {
  const app = await harness({ readOnly: true, frozen: { payrollSummary: { records: {} } } })
  for (let column = 0; column < 8; column++) assert.equal(app.cell(0, column).props.disabled, true)
  assert.equal(app.paste('10000000\t0'), false)
  app.cell(0, 0).props.onChange({ target: { value: '12000000' } })
  assert.equal(app.cell(0, 0).props.value, '')
  assert.equal(app.button('Lưu thay đổi').props.disabled, true)
})
