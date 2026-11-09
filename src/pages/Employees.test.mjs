import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { build } from 'esbuild'
import XLSX from 'xlsx'

// Run the actual upload and confirmation handlers. No network or real DB writes.
const compiled = await build({
    stdin: {
        contents: `export { default as Page } from './Employees.jsx';
            export { hooks } from 'react'; export { db } from '../services/supabase';`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx'
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    jsx: 'transform', jsxFactory: 'h', jsxFragment: 'fragment',
    banner: { js: 'const fragment = "fragment"; const h = (type, props, ...children) => ({type, props: props || {}, children: children.flat(Infinity)});' },
    plugins: [{ name: 'employee-import-test', setup(api) {
        api.onResolve({ filter: /^react$|[\\/]services[\\/](supabase|firebase|employeeDirectory)$|[\\/]contexts[\\/]AuthContext$|[\\/]components[\\/]EmployeeDirectory$/ }, args => ({ path: args.path, namespace: 'test' }))
        api.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents:
            args.path === 'react' ? `
                export const hooks = { values: [], index: 0 };
                export const useState = initial => {
                    const i = hooks.index++;
                    if (!(i in hooks.values)) hooks.values[i] = initial;
                    return [hooks.values[i], value => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value }];
                };
                export const useRef = initial => useState({current: initial})[0];
                export const useEffect = () => {};`
            : args.path.endsWith('AuthContext') ? `export const useAuth = () => ({ user: { id: 'admin', role: 'admin' } });`
            : args.path.endsWith('/EmployeeDirectory') ? `export default function EmployeeDirectory() {}`
            : args.path.endsWith('firebase') ? `
                export const fbGet = async () => null;
                export const fbListCollectionIds = async () => [];`
            : args.path.endsWith('employeeDirectory') ? `
                import { db } from '../services/supabase';
                export const fetchUsersDirectory = async () => {
                    if (db.failRead) throw Error('Directory unavailable');
                    return db.rows.slice();
                };`
            : `export const db = { rows: [], writes: [], failRead: false };
                export const supabase = { from: table => ({
                    insert: async rows => { db.writes.push({table, action:'insert', rows}); db.rows.push(...rows); return {error:null}; },
                    update: payload => ({eq: async (key, value) => {
                        db.writes.push({table, action:'update', payload, key, value}); return {error:null};
                    }})
                }) };`
        }))
    } }]
})

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)]
const textOf = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
    : tree && typeof tree === 'object' ? tree.children.map(textOf).join(' ') : ''
globalThis.crypto ||= webcrypto

const harness = (rows = []) => {
    const module = { exports: {} }
    new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
    const { Page, hooks, db } = module.exports
    db.rows = rows
    const alerts = []
    globalThis.alert = message => alerts.push(message)
    const render = () => { hooks.index = 0; return Page() }
    render()
    hooks.values[2] = false // Directory loading is tested elsewhere; effects are isolated here.
    const preview = () => nodes(render()).find(node => node.type?.name === 'EmployeeImportPreview')
    return {
        db, alerts, preview,
        view: () => { const node = preview(); return node.type(node.props) },
        async upload(bytes, name = 'renamed.xlsx') {
            const directory = nodes(render()).find(node => node.type?.name === 'EmployeeDirectory')
            await directory.props.onImport({ target: { value: 'selected', files: [{ name,
                arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            }] } })
        }
    }
}
const workbookBytes = () => {
    const workbook = XLSX.utils.book_new()
    for (const [sheetName, count, prefix] of [['Historical', 61, 'Old'], ['Current', 40, 'Current']]) {
        const rows = [['BẢNG CÔNG T8/2026'], ['1/8/2026 - 31/8/2026'], [], [], [],
            ['STT', '', 'Họ tên', 'Bộ phận', 'Ca làm', 'Tổng công', ...Array.from({ length: 32 }, (_, i) => i + 1)],
            ...Array.from({ length: count }, (_, i) => [i + 1, '', `${prefix} ${i}`, 'Sale', 'Ca ngày', 31, ...Array(32).fill(1)]),
            [], ['', '', 'Tuần 1'], ['', '', 'Danh sách VP']]
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName)
    }
    workbook.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] }
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

test('upload requires explicit choice of 61-hidden or 40-current and makes no writes before confirmation', async () => {
    const app = harness()
    await app.upload(workbookBytes())
    const props = app.preview().props
    assert.equal(props.preview.selectedSheetName, '')
    assert.deepEqual(props.preview.sheets.map(sheet => [sheet.sheetName, sheet.employeeCount, sheet.hidden]), [
        ['Historical', 61, true], ['Current', 40, false]
    ])
    await props.onConfirm()
    assert.equal(app.db.writes.length, 0)
    props.onSelectSheet('Current')
    assert.equal(nodes(app.view()).filter(node => node.type === 'tbody')[0].children.length, 40)
    app.preview().props.onClose()
    assert.equal(app.preview().props.preview, null)
    assert.equal(app.db.writes.length, 0)
})

test('confirmation writes only 40 selected employees, ignores historical/summary rows, and guards double submission', async () => {
    const app = harness()
    await app.upload(workbookBytes())
    app.preview().props.onSelectSheet('Current')
    const confirm = app.preview().props.onConfirm
    await Promise.all([confirm(), confirm()])
    assert.equal(app.db.writes.length, 40, app.alerts.join('\n'))
    assert.ok(app.db.rows.every(row => row.name.startsWith('Current ')))
    assert.ok(app.db.writes.every(write => write.table === 'users' && write.action === 'insert'))
    assert.equal(new Set(app.db.rows.map(row => row.username)).size, 40)
    await app.upload(workbookBytes())
    app.preview().props.onSelectSheet('Current')
    assert.match(textOf(app.view()), /đã có, giữ nguyên hồ sơ:\s+40/)
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 40, 're-import must not create duplicate profiles')
})

test('existing names are retained and fresh directory is checked before adding missing employees', async () => {
    const app = harness()
    await app.upload(workbookBytes())
    app.preview().props.onSelectSheet('Current')
    app.db.rows.push({ id: 'existing', name: 'Current 0', department: 'Sale', username: 'nv0007', email: 'keep@example.test' })
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 39, app.alerts.join('\n'))
    assert.equal(app.db.rows.length, 40)
    assert.equal(app.db.rows[0].email, 'keep@example.test')
    assert.ok(app.db.writes.every(write => write.action === 'insert'))
})

test('failed directory refresh blocks all writes', async context => {
    context.mock.method(console, 'error', () => {})
    const app = harness()
    await app.upload(workbookBytes())
    app.preview().props.onSelectSheet('Current')
    app.db.failRead = true
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 0)
    assert.ok(app.alerts.some(message => message.includes('Directory unavailable')))
})

test('ordinary CSV still previews and updates an explicitly matching employee code only after confirmation', async () => {
    const app = harness([{ id: 'existing', employee_id: 'NV1', name: 'Nguyễn Văn A' }])
    await app.upload(Buffer.from('Họ tên,Mã NV,Bộ phận\nNguyễn Văn A,NV1,MKT', 'utf8'), 'staff.csv')
    assert.equal(app.db.writes.length, 0)
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 1, app.alerts.join('\n'))
    assert.equal(app.db.writes[0].action, 'update')
    assert.equal(app.db.writes[0].value, 'existing')
})

test('actual supplied workbook imports exactly 40 August names, not the hidden 61-person sheet', {
    skip: !process.env.ATTENDANCE_SAMPLE_PATH
}, async () => {
    const app = harness()
    await app.upload(readFileSync(process.env.ATTENDANCE_SAMPLE_PATH))
    const props = app.preview().props
    assert.equal(props.preview.selectedSheetName, '')
    assert.equal(props.preview.sheets.find(sheet => sheet.sheetName === 'Tháng 052025').employeeCount, 61)
    props.onSelectSheet('BẢNG CÔNG T82026')
    const selected = app.preview().props.preview.sheets.find(sheet => sheet.sheetName === 'BẢNG CÔNG T82026')
    assert.equal(selected.employeeCount, 40)
    assert.equal(selected.records[0].name, 'Nguyễn Đức Anh')
    assert.equal(selected.records[39].name, 'Tô Châu')
    assert.equal(app.db.writes.length, 0)
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 40, app.alerts.join('\n'))
    assert.equal(app.db.rows[0].name, 'Nguyễn Đức Anh')
    assert.equal(app.db.rows[39].name, 'Tô Châu')
})

test('replacement workbook previews and imports its 34 employees from the only sheet', {
    skip: !process.env.NEW_ATTENDANCE_FILE
}, async () => {
    const app = harness()
    await app.upload(readFileSync(process.env.NEW_ATTENDANCE_FILE))
    const preview = app.preview().props.preview
    assert.equal(preview.selectedSheetName, 'Trang tính1')
    assert.equal(preview.sheets.length, 1)
    assert.equal(preview.sheets[0].employeeCount, 34)
    assert.equal(preview.sheets[0].records[0].name, 'Nguyễn Minh Nhựt')
    assert.equal(preview.sheets[0].records[33].name, 'Mai Văn Tuấn')
    assert.equal(app.db.writes.length, 0)
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 34, app.alerts.join('\n'))
    assert.equal(app.db.rows[0].name, 'Nguyễn Minh Nhựt')
    assert.equal(app.db.rows[33].name, 'Mai Văn Tuấn')
})

test('daily-detail workbook deduplicates 1054 days into 34 personnel profiles', {
    skip: !process.env.DETAIL_ATTENDANCE_FILE
}, async () => {
    const app = harness()
    await app.upload(readFileSync(process.env.DETAIL_ATTENDANCE_FILE))
    const preview = app.preview().props.preview
    assert.equal(preview.selectedSheetName, 'Xuất lưới')
    assert.equal(preview.sheets[0].isDetailedAttendanceList, true)
    assert.equal(preview.sheets[0].employeeCount, 34)
    assert.equal(preview.sheets[0].records[0].name, 'Đặng Thùy Liên')
    assert.equal(preview.sheets[0].records[33].name, 'Hồ Ngọc Phú')
    assert.equal(app.db.writes.length, 0)
    await app.preview().props.onConfirm()
    assert.equal(app.db.writes.length, 34, app.alerts.join('\n'))
})
