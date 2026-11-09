import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareEmployeeImportSheet, planEmployeeSheetImport } from './employeeImport.js'

export const monthlyRows = (count = 40, namePrefix = 'Nhân Viên') => [
    ['BẢNG CÔNG T8/2026'], ['1/8/2026 - 31/8/2026'], [], [], [],
    ['STT', '', 'Họ tên', 'Bộ phận', 'Ca làm', 'Tổng công', ...Array.from({ length: 32 }, (_, i) => i + 1)],
    ...Array.from({ length: count }, (_, i) => [i + 1, '', `${namePrefix} ${i}`, 'Sale', 'Ca ngày', 31, ...Array(32).fill(1)]),
    [], ['', '', 'Tuần 1'], ['', '', 'Danh sách VP'], ['', '', 'Tổng SL vi phạm']
]

test('monthly personnel adapter reads 40 employees only and preserves Excel row coordinates', () => {
    const sheet = prepareEmployeeImportSheet({ sheetName: 'Current', rows: monthlyRows() })
    assert.equal(sheet.employeeCount, 40)
    assert.equal(sheet.records[0].rowIndex, 6)
    assert.equal(sheet.records[39].rowIndex, 45)
    assert.equal(sheet.records[0].department, 'Sale')
    assert.equal(sheet.records[0].shift, 'Ca ngày')
    assert.deepEqual(sheet.errors, [])
})

test('hidden historical and current sheets retain independent counts', () => {
    const old = prepareEmployeeImportSheet({ sheetName: 'Old', rows: monthlyRows(61), hidden: 1 })
    const current = prepareEmployeeImportSheet({ sheetName: 'Current', rows: monthlyRows(40) })
    assert.equal(old.employeeCount, 61)
    assert.equal(old.hidden, true)
    assert.equal(current.employeeCount, 40)
    assert.equal(current.hidden, false)
})

test('existing code-less employees are kept while missing names are planned for creation', () => {
    const sheet = prepareEmployeeImportSheet({ sheetName: 'Current', rows: monthlyRows() })
    const plan = planEmployeeSheetImport(sheet, [{ id: 'one', ho_va_ten: 'Nhân Viên 0', bo_phan: 'Sale' }], 'speego-original')
    assert.equal(plan.createCount, 39)
    assert.equal(plan.existingCount, 1)
    assert.equal(plan.records[0].action, 'existing')
    assert.deepEqual(plan.errors, [])
})

test('duplicate profile names require review rather than creating yet another profile', () => {
    const sheet = prepareEmployeeImportSheet({ sheetName: 'Current', rows: monthlyRows(1) })
    const plan = planEmployeeSheetImport(sheet, ['a', 'b'].map(id => ({ id, ho_va_ten: 'Nhân Viên 0', bo_phan: 'Sale' })), 'speego-original')
    assert.equal(plan.records[0].action, 'review')
    assert.equal(plan.errors.length, 1)
    assert.equal(plan.createCount, 0)
})

test('duplicate source rows are blocked instead of making preview count disagree with writes', () => {
    const rows = monthlyRows(2)
    rows[7][2] = rows[6][2]
    const plan = planEmployeeSheetImport(prepareEmployeeImportSheet({ sheetName: 'Current', rows }), [], 'speego-original')
    assert.equal(plan.errors.length, 1)
})

test('ordinary personnel templates still preserve code-based update input and blank-row coordinates', () => {
    const sheet = prepareEmployeeImportSheet({ sheetName: 'Personnel', rows: [
        ['HỌ TÊN', 'Mã NV', 'TEAM', 'CA LÀM'], ['Nguyễn Văn A', 'NV1', 'MKT', 'Ca ngày'], [],
        ['Nguyễn Văn B', 'NV2', 'Sale', 'Ca đêm']
    ] })
    assert.equal(sheet.isMonthlyMatrix, false)
    assert.equal(sheet.employeeCount, 2)
    assert.equal(sheet.records[1].rowIndex, 3)
    assert.equal(sheet.records[0].employeeCode, 'NV1')
    assert.equal(planEmployeeSheetImport(sheet, [], 'speego-original').records[0].action, 'upsert')
})

test('sheets without a personnel name header are not offered as candidates', () => {
    assert.equal(prepareEmployeeImportSheet({ sheetName: 'Notes', rows: [['Hướng dẫn'], ['abc']] }), null)
})
