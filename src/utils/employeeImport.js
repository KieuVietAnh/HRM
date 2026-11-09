import { detectMonthlyAttendanceMatrix } from './monthlyAttendanceMatrix.js'
import { detectAttendanceDetailList } from './attendanceDetailList.js'
import {
    matchDetailedAttendanceEmployee,
    matchMonthlyAttendanceEmployee,
    normalizeEmployeeIdentity
} from './attendanceMatching.js'

export const normalizeEmployeeImportHeader = value => String(value ?? '')
    .toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

const NAME_HEADERS = ['ho_va_ten', 'ho_ten', 'ten_nhan_vien', 'ten', 'name']
const pick = (record, keys) => keys.map(key => record[key]).find(value => String(value ?? '').trim()) || ''

/** Keep the original row coordinates and restrict monthly sheets to their employee table. */
export const prepareEmployeeImportSheet = ({ sheetName, rows = [], hidden = false }) => {
    const matrix = detectMonthlyAttendanceMatrix(rows)
    const detail = matrix.matched ? null : detectAttendanceDetailList(rows)
    const headerRowIndex = matrix.matched ? matrix.headerRowIndex : detail?.matched ? detail.headerRowIndex : rows.slice(0, 60).findIndex(row =>
        row.some(value => NAME_HEADERS.includes(normalizeEmployeeImportHeader(value)))
    )
    if (headerRowIndex < 0) return null
    const headers = rows[headerRowIndex].map(normalizeEmployeeImportHeader)
    const indexes = matrix.matched ? matrix.employeeRowIndexes : detail?.matched ? detail.dataRowIndexes
        : rows.map((_, index) => index).filter(index => index > headerRowIndex)
    let records = indexes.map(index => {
        const values = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? '']))
        return {
            rowIndex: index, row: rows[index],
            name: String(pick(values, NAME_HEADERS)).trim(),
            department: String(pick(values, ['team', 'bo_phan', 'phong_ban', 'department'])).trim(),
            shift: String(pick(values, ['ca_lam', 'ca_lam_viec', 'ca', 'shift'])).trim(),
            employeeCode: String(pick(values, ['ma_nhan_vien', 'ma_nv', 'employee_id'])).trim()
        }
    }).filter(record => record.name)
    if (detail?.matched) {
        records = [...new Map(records.map(record => [
            normalizeEmployeeIdentity(record.employeeCode) || normalizeEmployeeIdentity(record.name),
            record
        ])).values()]
    }
    return {
        sheetName, hidden: Boolean(hidden), headers, headerRowIndex, records,
        isMonthlyMatrix: matrix.matched,
        isDetailedAttendanceList: Boolean(detail?.matched),
        yearMonth: matrix.yearMonth || detail?.yearMonth || '',
        errors: matrix.matched ? matrix.errors : detail?.errors || [],
        employeeCount: records.length
    }
}

/** For code-less matrices, existing profiles are kept, never overwritten or duplicated. */
export const planEmployeeSheetImport = (sheet, employees, companyId) => {
    if (!sheet) return { records: [], errors: [], createCount: 0, existingCount: 0 }
    const errors = [...sheet.errors]
    const seen = new Set()
    const records = sheet.records.map(record => {
        if (sheet.isDetailedAttendanceList) {
            const match = matchDetailedAttendanceEmployee(
                record.employeeCode, record.name, employees, companyId
            )
            if (match.employee) return { ...record, action: 'existing', existingId: match.employee.id }
            if (match.status === 'review') {
                errors.push(`${record.name}: mã hoặc họ tên xung đột với hồ sơ hiện có; cần kiểm tra trước khi nhập.`)
                return { ...record, action: 'review' }
            }
            return { ...record, action: 'create' }
        }
        if (!sheet.isMonthlyMatrix) return { ...record, action: record.employeeCode ? 'upsert' : 'create' }
        const identity = `${normalizeEmployeeIdentity(record.name)}::${normalizeEmployeeIdentity(record.department)}`
        if (seen.has(identity)) {
            errors.push(`Dòng ${record.rowIndex + 1}: ${record.name} bị lặp trong sheet; hãy kiểm tra trước khi nhập.`)
            return { ...record, action: 'review' }
        }
        seen.add(identity)
        const match = matchMonthlyAttendanceEmployee(record.name, record.department, employees, companyId)
        if (match.employee) return { ...record, action: 'existing', existingId: match.employee.id }
        if (match.status === 'review') {
            errors.push(`${record.name}: có nhiều hồ sơ trùng tên, cần kiểm tra bên Nhân sự trước khi nhập.`)
            return { ...record, action: 'review' }
        }
        return { ...record, action: 'create' }
    })
    return {
        records, errors,
        createCount: records.filter(record => record.action === 'create').length,
        existingCount: records.filter(record => record.action === 'existing').length
    }
}
