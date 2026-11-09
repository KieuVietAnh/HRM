import {
  fbGet,
  fbGetAttendanceLogsForWorkMonth,
  fbGetEmployeesDirectory,
  fbSet
} from './firebase'
import {
  buildAttendanceSummary,
  serializeAttendanceSummaryRows
} from '../utils/attendanceSummary'
import { normalizeAttendanceShiftSettings } from '../utils/attendanceShift'
import { getCompanyIdForUser, getCompanyNameForContext } from '../utils/companyContext'
import { syncPenaltiesFromAttendanceSummary } from './attendancePenaltiesDb'

/**
 * Rebuild and persist the monthly attendance snapshot used by /bang-cong-preview.
 * Online check-in/out writes attendanceLogs only; this syncs those logs into
 * attendanceMonthSummaries so the bảng công table stays up to date.
 */
export const rebuildAttendanceMonthSummary = async (
  targetMonth,
  {
    companyId = getCompanyIdForUser(),
    companyName = getCompanyNameForContext({ name: 'SpeeGo Logistics' })
  } = {}
) => {
  const period = String(targetMonth || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Tháng không hợp lệ. Dùng định dạng YYYY-MM.')
  }

  const [employeeData, logData, nextAdjustments, nextManuals, storedSettings] = await Promise.all([
    fbGetEmployeesDirectory(companyId),
    fbGetAttendanceLogsForWorkMonth(period),
    fbGet(`hr/attendanceAdjustments/${period}`, companyId),
    fbGet(`hr/manualWorkdays/${period}`, companyId),
    fbGet('hr/attendanceSettings/default', companyId)
  ])

  const attendanceSettings = normalizeAttendanceShiftSettings(storedSettings)
  const employeeList = employeeData
    ? Object.entries(employeeData).map(([id, value]) => ({ ...value, id }))
    : []
  const monthLogs = logData
    ? Object.entries(logData).map(([id, value]) => ({ ...value, id }))
    : []
  const summaryRows = buildAttendanceSummary({
    attendanceLogs: monthLogs,
    employees: employeeList,
    month: period,
    attendanceAdjustments: nextAdjustments || {},
    manualWorkdays: nextManuals || {},
    attendanceSettings
  })
  const validEmpIds = new Set(employeeList.map(employee => String(employee.id)))
  const filteredSummaryRows = summaryRows.filter(row => validEmpIds.has(String(row.employeeId)))
  const snapshot = {
    month: period,
    companyId,
    companyName,
    generatedAt: new Date().toISOString(),
    sourceLogCount: monthLogs.length,
    employeeCount: filteredSummaryRows.length,
    rows: serializeAttendanceSummaryRows(filteredSummaryRows)
  }

  await fbSet(`hr/attendanceMonthSummaries/${period}`, snapshot, companyId)

  // Liên kết Bảng phạt với bảng công: cập nhật dòng phạt auto, giữ dòng nhập tay.
  try {
    await syncPenaltiesFromAttendanceSummary(
      period,
      filteredSummaryRows,
      attendanceSettings?.penaltyCategories
    )
  } catch (penaltyError) {
    console.warn('Đã lưu bảng công nhưng chưa đồng bộ được Bảng phạt:', penaltyError)
  }

  return snapshot
}

export const rebuildAttendanceMonthSummaryForDate = async (dateValue, options = {}) => {
  const date = String(dateValue || '').slice(0, 10)
  const period = date.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(period)) return null
  const snapshot = await rebuildAttendanceMonthSummary(period, options)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return snapshot
  const nextDate = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(nextDate.getTime()) || nextDate.toISOString().slice(0, 10) !== date) return snapshot
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const nextPeriod = nextDate.toISOString().slice(0, 7)
  if (nextPeriod !== period) {
    // Ca bắt đầu ngày cuối tháng được chuyển sang bảng công tháng kế tiếp.
    await rebuildAttendanceMonthSummary(nextPeriod, options)
  }
  return snapshot
}
