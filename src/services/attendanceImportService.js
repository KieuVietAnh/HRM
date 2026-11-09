import {
  buildAttendanceRecordKey,
  buildAttendanceStorageId,
  buildSourceEmployeeKey
} from '../utils/attendanceMatching.js'

export const sanitizeAttendanceImportLog = log =>
  Object.fromEntries(
    Object.entries(log || {}).filter(([key]) => key !== 'id' && !key.startsWith('_'))
  )

const isExcelManagedLog = log =>
  log?.sourceType === 'excel-import' ||
  Boolean(log?.sourceEmployeeCode || log?.sourceEmployeeName || log?.syntheticPunch)

const dayIdentity = log => buildAttendanceRecordKey(log).split('|').slice(0, 2).join('|')

const hasChanged = (current, next) =>
  Object.entries(next).some(([field, value]) => {
    if (field === 'importJobId' || field === 'importedAt') return false
    return JSON.stringify(current?.[field] ?? null) !== JSON.stringify(value ?? null)
  })

/**
 * Build a deterministic, retry-safe write plan from a fresh DB snapshot.
 * Non-Excel records are reported as conflicts and are never overwritten.
 */
export const planAttendanceImport = ({
  incomingLogs = [],
  existingLogs = [],
  skippedSourceKeys = new Set()
} = {}) => {
  const existingByKey = new Map()
  const existingByDay = new Map()
  existingLogs.forEach(log => {
    const recordKey = buildAttendanceRecordKey(log)
    const dayKey = dayIdentity(log)
    if (!existingByKey.has(recordKey)) existingByKey.set(recordKey, [])
    if (!existingByDay.has(dayKey)) existingByDay.set(dayKey, [])
    existingByKey.get(recordKey).push(log)
    existingByDay.get(dayKey).push(log)
  })

  const seenIncoming = new Set()
  const inserts = []
  const updates = []
  const unchanged = []
  const skipped = []
  const conflicts = []

  incomingLogs.forEach(log => {
    if (skippedSourceKeys.has(log?._sourceEmployeeKey)) {
      skipped.push({ log, reason: 'Nhân viên được chọn bỏ qua' })
      return
    }

    const key = buildAttendanceRecordKey(log)
    if (seenIncoming.has(key)) {
      skipped.push({ log, reason: 'Trùng bản ghi trong chính file import' })
      return
    }
    seenIncoming.add(key)

    let candidates = existingByKey.get(key) || []
    if (!candidates.length && log.importFormat === 'attendance-detail-list') {
      const sourceKey = buildSourceEmployeeKey(log.sourceEmployeeCode, log.sourceEmployeeName)
      candidates = (existingByDay.get(dayIdentity(log)) || []).filter(existing =>
        isExcelManagedLog(existing) &&
        buildSourceEmployeeKey(existing.sourceEmployeeCode, existing.sourceEmployeeName) === sourceKey
      )
    }
    const hasStableShift = Boolean(log.shiftName || log.tenCa || log.importEventKey)
    if (!candidates.length && !hasStableShift) {
      candidates = existingByDay.get(dayIdentity(log)) || []
    }

    if (candidates.length > 1) {
      conflicts.push({ log, existing: candidates, reason: 'Có nhiều bản ghi cùng nhân viên/ngày nhưng file không đủ thông tin phân biệt ca.' })
      return
    }

    const existing = candidates[0]
    const previousMonthlyDepartment = existing?.monthlyDepartment || (
      existing?.importFormat === 'attendance-monthly-matrix'
        ? existing.sourceDepartment || ''
        : ''
    )
    const data = sanitizeAttendanceImportLog({
      ...log,
      sourceType: 'excel-import',
      ...(log.importFormat === 'attendance-detail-list' && previousMonthlyDepartment
        ? { monthlyDepartment: previousMonthlyDepartment }
        : {})
    })
    if (!existing) {
      inserts.push({ id: buildAttendanceStorageId(log), data, log })
      return
    }
    if (!existing.id) {
      conflicts.push({ log, existing: candidates, reason: 'Bản ghi hiện tại thiếu ID nên không thể cập nhật an toàn.' })
      return
    }
    if (!isExcelManagedLog(existing)) {
      conflicts.push({ log, existing: candidates, reason: 'Ngày này đã có chấm công từ nguồn khác; Excel không được tự ghi đè.' })
      return
    }
    if (hasChanged(existing, data)) updates.push({ id: existing.id, data, log })
    else unchanged.push({ id: existing.id, log })
  })

  return { inserts, updates, unchanged, skipped, conflicts }
}
