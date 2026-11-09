import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fbGet, fbGetAttendanceLogsByMonth, fbGetEmployeesDirectory, fbListCollectionIds, fbSet } from '../services/firebase'
import {
  hydrateAttendanceSummaryRows
} from '../utils/attendanceSummary'
import { rebuildAttendanceMonthSummary } from '../services/attendanceMonthSummary'
import AttendanceImportModal from '../components/AttendanceImportModal'
import PayrollTable from '../components/PayrollTable'
import ResetAttendanceModal from '../components/ResetAttendanceModal'
import { getPenaltiesByMonth } from '../services/attendancePenaltiesDb'
import { loadEmployeeLeaveSettings } from '../services/employeeLeave'
import { supabase } from '../services/supabase'
import { dayOfWeekFromDate, formatTimeHM } from '../components/AttendanceModal'
import {
  formatAttendanceTime,
  normalizeAttendanceShiftSettings,
  resolveAttendanceShift
} from '../utils/attendanceShift'
import { getCompanyIdForUser, getCompanyNameForContext } from '../utils/companyContext'
import { parseManualWorkdayInput, updateManualWorkdays } from '../utils/attendanceManual'
import {
  describeDayWorkFormula,
  getAttendanceHoliday,
  STANDARD_WORK_MINUTES
} from '../utils/attendanceCalculations'
import { openAttendancePrintWindow } from '../utils/attendancePdf'
import { resolveAttendanceDepartment } from '../utils/attendanceDepartment'
import './AttendancePreview.css'
import MobileActions from '../components/MobileActions'

const EXCEL_DETAIL_PAGE_SIZE = 100
const EXCEL_DETAIL_PAGE_SIZE_OPTIONS = [50, 100, 200]
const punchPairsForDisplay = log => Array.isArray(log?.punchPairs) && log.punchPairs.length
  ? log.punchPairs
  : [{ checkIn: log?.vao || log?.checkIn, checkOut: log?.ra || log?.checkOut }]
const punchTimesForDisplay = (log, field) => punchPairsForDisplay(log)
  .map(pair => formatTimeHM(pair[field]) || '-')
  .join(' · ')
const timingMinutesForLog = (log, field, fallback) => {
  const pairs = log?.punchPairs
  if (!Array.isArray(pairs) || !pairs.length) return Number(fallback) || 0
  const targetPair = field === 'lateMinutes'
    ? pairs.find(pair => pair.checkIn)
    : [...pairs].reverse().find(pair => pair.checkOut)
  return targetPair?.[field] !== null && targetPair?.[field] !== undefined && targetPair?.[field] !== ''
    ? Number(targetPair[field]) || 0
    : Number(fallback) || 0
}
const normalizeSearch = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

let XLSX = null
const ensureXlsx = async () => {
  if (!XLSX) {
    const mod = await import('xlsx-js-style')
    XLSX = mod.default || mod
  }
  return XLSX
}

function ManualWorkdayInput({ value, isManual, disabled, onSave, employeeName, date }) {
  const normalizedValue = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(normalizedValue)

  useEffect(() => {
    setDraft(normalizedValue)
  }, [normalizedValue])

  const commit = () => {
    if (draft === normalizedValue) return
    const parsed = parseManualWorkdayInput(draft)
    if (!parsed.valid) {
      alert(parsed.error)
      setDraft(normalizedValue)
      return
    }
    onSave(draft)
  }

  return (
    <input
      type="number"
      min="0"
      max="1"
      step="0.25"
      inputMode="decimal"
      className={`manual-workday-input ${isManual ? 'is-manual' : ''}`}
      value={draft}
      disabled={disabled}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(normalizedValue)
          event.currentTarget.blur()
        }
      }}
      aria-label={`Chỉnh công ${employeeName || ''} ngày ${date}`}
      title={isManual ? 'Đã chỉnh tay. Xóa giá trị để trở về tự động.' : 'Nhập 0–1 để chỉnh tay số công.'}
    />
  )
}

const normalizeDailyNotes = notes => Object.fromEntries(
  Object.entries(notes || {})
    .map(([day, value]) => [day, String(value || '').trim().slice(0, 500)])
    .filter(([, value]) => value)
    .sort(([a], [b]) => Number(a) - Number(b))
)

const summaryNoteLines = (row, attendanceNotes, month) => {
  const lines = []
  if (String(row.notes || '').trim()) lines.push(String(row.notes).trim())
  const monthNumber = String(month || '').split('-')[1] || ''
  Object.entries(normalizeDailyNotes(attendanceNotes[String(row.employeeId)]))
    .forEach(([day, note]) => lines.push(`${String(day).padStart(2, '0')}/${monthNumber}: ${note}`))
  return lines
}

const enrichExcelLog = (log, employeesById) => {
  const employee = employeesById.get(String(log.employeeId || '')) || null
  const excelCode = String(
    log.sourceEmployeeCode ||
    log.maNV ||
    log.ma_nv ||
    log.excelEmployeeCode ||
    ''
  ).trim()
  // Prefer mã trong file Excel; chỉ dùng employeeCode nếu không phải UUID hệ thống.
  const storedCode = String(log.employeeCode || '').trim()
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedCode)
  const employeeCode = excelCode || (!looksLikeUuid ? storedCode : '') || ''
  const employeeName =
    log.sourceEmployeeName ||
    log.employeeName ||
    employee?.ho_va_ten ||
    employee?.name ||
    ''
  const department =
    log.department ||
    log.phongBan ||
    employee?.bo_phan ||
    employee?.department ||
    ''
  const shiftFromProfile = employee?.ca_lam_viec || employee?.shift || ''
  return {
    ...log,
    displayEmployeeCode: employeeCode,
    employeeCode: employeeCode || storedCode,
    employeeName,
    department,
    phongBan: department,
    profileShift: shiftFromProfile,
    shiftName: shiftFromProfile || log.shiftName || log.tenCa || '',
    tenCa: shiftFromProfile || log.tenCa || log.shiftName || ''
  }
}

const currentMonthValue = () => new Date().toISOString().slice(0, 7)
const roundWorkdays = value => Math.round((Number(value) || 0) * 100) / 100
const paidLeaveWorkdaysFor = row => Math.max(0, roundWorkdays(row?.paidLeaveWorkdays))
const actualWorkdaysFor = row => {
  if (row?.actualWorkdays !== null && row?.actualWorkdays !== undefined) {
    return Math.max(0, roundWorkdays(row.actualWorkdays))
  }
  return Math.max(0, roundWorkdays(
    (Number(row?.workdays) || 0) - paidLeaveWorkdaysFor(row)
  ))
}
const payableWorkdaysFor = row => Math.max(0, roundWorkdays(row?.workdays))
const formatWorkdays = value => Number(value || 0).toFixed(2)
const formatGeneratedAt = value => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}
const dateText = value => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}` : value || ''
}
const weekdayText = (monthValue, day) => {
  const [year, monthNumber] = String(monthValue || '').split('-').map(Number)
  if (!year || !monthNumber) return ''
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, monthNumber - 1, day).getDay()]
}
const dayCode = day => {
  if (!day) return ''
  const statuses = (day.logs || []).map(log => String(log.kyHieuPlus || log.kyHieu || log.status || '').trim().toUpperCase()).filter(Boolean)
  const code = statuses.find(value => ['X', 'X1', 'X2', 'X3', 'P1'].includes(value))
  if (code) return code
  if (day.paidLeaveWorkdays > 0 || statuses.includes('V')) return 'P1'
  if (day.unapprovedAbsence) return 'X'
  return Number(day.workdays) || ''
}
const dayNotes = day => {
  if (!day) return ''
  const notes = []
  if (day.isHoliday) notes.push(day.holidayName ? `Ngày lễ: ${day.holidayName}` : 'Ngày lễ')
  if (day.late) notes.push(`Muộn ${day.lateMinutes || 0}p`)
  if (day.early) notes.push(`Sớm ${day.earlyMinutes || 0}p`)
  if (day.missingPunch) notes.push('Quên chấm')
  if (day.unapprovedAbsence) notes.push('Nghỉ không phép')
  if (day.paidLeaveWorkdays > 0) notes.push(`Phép ${day.paidLeaveWorkdays}`)
  if (day.overtimeHours > 0) notes.push(`TC ${day.overtimeHours}h`)
  return notes.join(' · ')
}

const getConsecutiveDepartmentRowSpans = rows => rows.map((row, index) => {
  const department = row.displayDepartment
  if (!department) return 1
  const previousDepartment = rows[index - 1]?.displayDepartment
  if (department === previousDepartment) return 0
  let rowSpan = 1
  while (rows[index + rowSpan]?.displayDepartment === department) rowSpan += 1
  return rowSpan
})
const groupRowsByDepartment = rows => {
  const groups = new Map()
  rows.forEach(row => {
    const department = resolveAttendanceDepartment(row)
    const key = department.toLocaleLowerCase('vi')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...row, displayDepartment: department })
  })
  return Array.from(groups.values()).flat()
}

function AttendancePreview() {
  const { user } = useAuth()
  const companyId = useMemo(() => getCompanyIdForUser(user), [user])
  const [companyInfo] = useState({ name: 'SpeeGo Logistics' })
  const companyName = useMemo(
    () => getCompanyNameForContext(companyInfo, user),
    [companyInfo, user]
  )
  const [month, setMonth] = useState(currentMonthValue)
  const [summaryMonths, setSummaryMonths] = useState([])
  const [rows, setRows] = useState([])
  const [loadedCompanyId, setLoadedCompanyId] = useState('')
  const [generatedAt, setGeneratedAt] = useState('')
  const [sourceLogCount, setSourceLogCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [summarizing, setSummarizing] = useState(false)
  const [error, setError] = useState('')
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importEmployees, setImportEmployees] = useState([])
  const [importLogs, setImportLogs] = useState([])
  const [importEmployeeMappings, setImportEmployeeMappings] = useState({})
  const [importMappingTemplates, setImportMappingTemplates] = useState({})
  const [attendanceSettings, setAttendanceSettings] = useState(() => normalizeAttendanceShiftSettings())
  const [manualWorkdays, setManualWorkdays] = useState({})
  const [manualSavingKey, setManualSavingKey] = useState('')
  const [attendanceNotes, setAttendanceNotes] = useState({})
  const [noteDrafts, setNoteDrafts] = useState({})
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteNotice, setNoteNotice] = useState('')
  const [manualNotice, setManualNotice] = useState('')
  const [confirmations, setConfirmations] = useState({})
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [detailRow, setDetailRow] = useState(null)
  const [isExcelDetailOpen, setIsExcelDetailOpen] = useState(false)
  const [excelLogs, setExcelLogs] = useState([])
  const [excelLogsLoading, setExcelLogsLoading] = useState(false)
  const [excelSearch, setExcelSearch] = useState('')
  const [excelPage, setExcelPage] = useState(1)
  const [excelPageSize, setExcelPageSize] = useState(EXCEL_DETAIL_PAGE_SIZE)
  const [detailViewMode, setDetailViewMode] = useState('matrix')
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [sheet, setSheet] = useState('attendance')
  const [weekFilter, setWeekFilter] = useState('')
  const [payrollBundle, setPayrollBundle] = useState({
    penalties: [],
    leave: {},
    employees: {},
    kpis: []
  })
  const canEditWorkdays = true
  const canEditNotes = true
  const savedDetailNotes = normalizeDailyNotes(attendanceNotes[String(detailRow?.employeeId)])
  const hasUnsavedNotes = Boolean(detailRow) &&
    JSON.stringify(normalizeDailyNotes(noteDrafts)) !== JSON.stringify(savedDetailNotes)

  const daysInSelectedMonth = useMemo(() => {
    const [y, m] = String(month || '').split('-').map(Number)
    if (!y || !m) return 31
    return new Date(y, m, 0).getDate()
  }, [month])

  const monthDaysHeader = useMemo(() => {
    const [y, m] = String(month || '').split('-').map(Number)
    if (!y || !m) return []
    const days = []
    const dowShort = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const date = new Date(y, m - 1, d)
      const dayStr = String(d).padStart(2, '0')
      const dateKey = `${month}-${dayStr}`
      const holiday = getAttendanceHoliday(dateKey, attendanceSettings)
      days.push({
        day: d,
        dayStr,
        dateKey,
        dow: dowShort[date.getDay()],
        isSunday: date.getDay() === 0,
        isSaturday: date.getDay() === 6,
        isHoliday: Boolean(holiday),
        holidayName: holiday?.name || ''
      })
    }
    return days
  }, [attendanceSettings, month, daysInSelectedMonth])

  // Tuần Thứ 2 → Chủ nhật, cắt theo ranh giới tháng.
  const monthWeeks = useMemo(() => {
    const weeks = []
    monthDaysHeader.forEach(d => {
      const last = weeks[weeks.length - 1]
      if (!last || d.dow === 'T2') {
        weeks.push({ index: weeks.length + 1, start: d.day, end: d.day })
      } else {
        last.end = d.day
      }
    })
    const mm = String(month || '').slice(5, 7)
    return weeks.map(week => ({
      ...week,
      label: `Tuần ${week.index}`,
      rangeLabel: `${String(week.start).padStart(2, '0')}/${mm} - ${String(week.end).padStart(2, '0')}/${mm}`
    }))
  }, [month, monthDaysHeader])
  const activeWeek = useMemo(
    () => monthWeeks.find(week => String(week.index) === String(weekFilter)) || null,
    [monthWeeks, weekFilter]
  )
  const visibleDays = useMemo(
    () => activeWeek
      ? monthDaysHeader.filter(d => d.day >= activeWeek.start && d.day <= activeWeek.end)
      : monthDaysHeader,
    [activeWeek, monthDaysHeader]
  )

  const matrixHolidayLegend = useMemo(
    () => visibleDays.filter(d => d.isHoliday),
    [visibleDays]
  )

  const matrixRows = useMemo(() => {
    if (!rows || rows.length === 0) return []
    const term = normalizeSearch(excelSearch)
    const filtered = rows.filter(r => {
      if (!term) return true
      const code = normalizeSearch(r.displayEmployeeCode || r.employeeCode || '')
      const name = normalizeSearch(r.employeeName || '')
      const dept = normalizeSearch(r.displayDepartment || r.department || '')
      return code.includes(term) || name.includes(term) || dept.includes(term)
    })
    const standardMinutes = Number(attendanceSettings?.standardWorkMinutes) || STANDARD_WORK_MINUTES

    return filtered.map(r => {
      const dailyMap = {}
      let calcTotal = 0
      monthDaysHeader.forEach(({ day, dayStr, isHoliday, holidayName }) => {
        const dateKey = `${month}-${dayStr}`
        const dayObj = r.days?.get ? r.days.get(dateKey) : (r.days?.[dateKey] || null)
        const manualWorkday = manualWorkdays[String(r.employeeId)]?.[String(day)]
        let code = ''
        if (dayObj) {
          code = String(dayCode(dayObj) || (dayObj.workdays > 0 ? dayObj.workdays : '') || '')
          if (!code && (dayObj.isHoliday || isHoliday)) code = 'Lễ'
        } else if (isHoliday) {
          code = 'Lễ'
        }
        if (manualWorkday !== undefined && manualWorkday !== null && manualWorkday !== '') {
          code = String(manualWorkday)
        }
        const formula = describeDayWorkFormula(
          {
            ...(dayObj || {}),
            isHoliday: Boolean(dayObj?.isHoliday || isHoliday),
            holidayName: dayObj?.holidayName || holidayName || '',
            manualOverride: manualWorkday !== undefined && manualWorkday !== null && manualWorkday !== ''
          },
          { standardMinutes, displayCode: code }
        )
        dailyMap[dayStr] = {
          code,
          formula,
          isHoliday: Boolean(dayObj?.isHoliday || isHoliday),
          holidayName: dayObj?.holidayName || holidayName || '',
          workdays: dayObj?.workdaysExact ?? dayObj?.workdays ?? '',
          manualWorkday,
          isManual: manualWorkday !== undefined && manualWorkday !== null && manualWorkday !== ''
        }
        if (activeWeek && (day < activeWeek.start || day > activeWeek.end)) return
        const num = parseFloat(code)
        if (!isNaN(num)) calcTotal += num
        else if (code === 'P1' || code === 'P') calcTotal += 1.0
      })
      return {
        employeeId: r.employeeId,
        code: r.displayEmployeeCode || r.employeeCode || '',
        name: r.employeeName || '',
        position: r.position || r.chuc_vu || r.displayDepartment || '',
        dailyMap,
        totalCong: !activeWeek && r.workdays != null ? Number(r.workdays).toFixed(2) : (calcTotal ? calcTotal.toFixed(2) : '0.00')
      }
    })
  }, [activeWeek, attendanceSettings, rows, month, monthDaysHeader, excelSearch, manualWorkdays])

  const applySnapshot = useCallback((snapshot, nextMonth) => {
    if (!snapshot?.rows) {
      setRows([])
      setGeneratedAt('')
      setSourceLogCount(0)
      setHasSnapshot(false)
      return []
    }
    const nextRows = groupRowsByDepartment(hydrateAttendanceSummaryRows(snapshot.rows))
    setRows(nextRows)
    setGeneratedAt(snapshot.generatedAt || '')
    setSourceLogCount(Number(snapshot.sourceLogCount || 0))
    setHasSnapshot(true)
    if (nextMonth) setMonth(nextMonth)
    return nextRows
  }, [])

  useEffect(() => {
    setDetailRow(previous => {
      if (!previous) return previous
      return rows.find(row => String(row.employeeId) === String(previous.employeeId)) || null
    })
  }, [rows])

  useEffect(() => {
    if (!hasSnapshot || !month || !companyId) return undefined
    let cancelled = false
    if (!canEditWorkdays) return undefined
    const loadPayroll = async () => {
      const [penalties, leave, employees, kpis] = await Promise.all([
        getPenaltiesByMonth(month).catch(() => []),
        loadEmployeeLeaveSettings(companyId).catch(() => ({})),
        fbGetEmployeesDirectory().catch(() => ({})),
        fbGet('hr/kpiResults').catch(() => ({}))
      ])
      if (cancelled) return
      setPayrollBundle({
        penalties: penalties || [],
        leave: leave || {},
        employees: employees || {},
        kpis: kpis && typeof kpis === 'object' ? Object.values(kpis) : []
      })
    }
    loadPayroll()
    return () => {
      cancelled = true
    }
  }, [canEditWorkdays, companyId, hasSnapshot, month])

  const payrollEmployees = useMemo(
    () => new Map(Object.entries(payrollBundle.employees || {})),
    [payrollBundle.employees]
  )
  const payrollKpis = useMemo(() => {
    const map = new Map()
    ;(payrollBundle.kpis || []).forEach(result => {
      if (!result?.employeeId) return
      if (result.month && result.month !== month) return
      map.set(String(result.employeeId), result)
    })
    return map
  }, [month, payrollBundle.kpis])

  const loadConfirmations = useCallback(async (targetMonth) => {
    if (!targetMonth) {
      setConfirmations({})
      return
    }
    try {
      const data = await fbGet(`hr/attendanceMonthConfirmations/${targetMonth}`, companyId)
      setConfirmations(data && typeof data === 'object' ? data : {})
    } catch (requestError) {
      console.warn('Không tải được xác nhận bảng công:', requestError)
      setConfirmations({})
    }
  }, [companyId])

  const loadSummaryIndex = useCallback(async () => {
    const ids = await fbListCollectionIds('attendanceMonthSummaries', companyId)
    const months = ids.filter(value => /^\d{4}-\d{2}$/.test(value)).sort().reverse()
    setSummaryMonths(months)
    return months
  }, [companyId])

  const loadMonthSnapshot = useCallback(async (targetMonth) => {
    if (!targetMonth) return
    setLoading(true)
    setError('')
    try {
      const [snapshot, storedSettings, storedManuals, storedNotes] = await Promise.all([
        fbGet(`hr/attendanceMonthSummaries/${targetMonth}`, companyId),
        fbGet('hr/attendanceSettings/default', companyId),
        fbGet(`hr/manualWorkdays/${targetMonth}`, companyId),
        fbGet(`hr/attendanceNotes/${targetMonth}`, companyId),
        loadConfirmations(targetMonth)
      ])
      setAttendanceSettings(normalizeAttendanceShiftSettings(storedSettings))
      setManualWorkdays(storedManuals || {})
      setAttendanceNotes(storedNotes || {})
      applySnapshot(snapshot, targetMonth)
    } catch (requestError) {
      console.error('Không tải được bảng công đã tổng hợp:', requestError)
      setError('Không thể tải bảng công đã tổng hợp.')
      applySnapshot(null, targetMonth)
      setConfirmations({})
      setManualWorkdays({})
      setAttendanceNotes({})
    } finally {
      setLoading(false)
    }
  }, [applySnapshot, companyId, loadConfirmations])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadedCompanyId('')
      setError('')
      try {
        const months = await loadSummaryIndex()
        if (cancelled) return
        const current = currentMonthValue()
        const snapshots = await Promise.all(
          months.map(value => fbGet(`hr/attendanceMonthSummaries/${value}`, companyId))
        )
        const currentIndex = months.indexOf(current)
        const currentSnapshot = currentIndex >= 0 ? snapshots[currentIndex] : null
        const nonEmptyIndex = snapshots.findIndex(snapshot =>
          Number(snapshot?.sourceLogCount || 0) > 0 ||
          (snapshot?.rows || []).some(row => Number(row?.workdays || 0) > 0)
        )
        const initialIndex = currentSnapshot && (
          Number(currentSnapshot.sourceLogCount || 0) > 0 ||
          (currentSnapshot.rows || []).some(row => Number(row?.workdays || 0) > 0)
        )
          ? currentIndex
          : (nonEmptyIndex >= 0 ? nonEmptyIndex : (currentIndex >= 0 ? currentIndex : 0))
        const initialMonth = months[initialIndex] || current
        const initialSnapshot = snapshots[initialIndex] || null
        const [resolvedSnapshot, storedSettings, storedManuals, storedNotes] = await Promise.all([
          initialSnapshot
            ? Promise.resolve(initialSnapshot)
            : fbGet(`hr/attendanceMonthSummaries/${initialMonth}`, companyId),
          fbGet('hr/attendanceSettings/default', companyId),
          fbGet(`hr/manualWorkdays/${initialMonth}`, companyId),
          fbGet(`hr/attendanceNotes/${initialMonth}`, companyId),
          loadConfirmations(initialMonth)
        ])
        if (cancelled) return
        setAttendanceSettings(normalizeAttendanceShiftSettings(storedSettings))
        setManualWorkdays(storedManuals || {})
        setAttendanceNotes(storedNotes || {})
        setMonth(initialMonth)
        applySnapshot(resolvedSnapshot, initialMonth)
        setLoadedCompanyId(companyId)
      } catch (requestError) {
        console.error('Không tải được danh sách bảng công:', requestError)
        if (!cancelled) {
          setError('Không thể tải dữ liệu bảng công.')
          setLoadedCompanyId(companyId)
          setManualWorkdays({})
          setAttendanceNotes({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [applySnapshot, companyId, loadConfirmations, loadSummaryIndex])

  const handleMonthChange = async (nextMonth) => {
    setMonth(nextMonth)
    setWeekFilter('')
    setManualNotice('')
    await loadMonthSnapshot(nextMonth)
  }

  const handleOpenExcelDetail = async (requestedMonth = '') => {
    const targetMonth = typeof requestedMonth === 'string' && /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : (month || currentMonthValue())
    setIsExcelDetailOpen(true)
    setExcelLogsLoading(true)
    setExcelSearch('')
    setExcelPage(1)
    setExcelPageSize(EXCEL_DETAIL_PAGE_SIZE)
    try {
      const [logsData, empData] = await Promise.all([
        fbGetAttendanceLogsByMonth(targetMonth, companyId),
        fbGetEmployeesDirectory(companyId)
      ])
      const employeesById = new Map(
        (empData
          ? Object.entries(empData).map(([id, value]) => ({ ...value, id }))
          : []
        ).map(employee => [String(employee.id), employee])
      )
      const list = logsData
        ? Object.entries(logsData).map(([id, value]) =>
            enrichExcelLog({ ...value, id }, employeesById)
          )
        : []
      list.sort((a, b) => {
        const nameA = String(a.employeeName || a.machineName || a.tenTheoMayChamCong || '')
        const nameB = String(b.employeeName || b.machineName || b.tenTheoMayChamCong || '')
        if (nameA !== nameB) return nameA.localeCompare(nameB, 'vi')
        return String(a.date || a.timestamp || '').localeCompare(String(b.date || b.timestamp || ''))
      })
      setExcelLogs(list)
    } catch (requestError) {
      console.error('Không tải được bảng chi tiết Excel:', requestError)
      setExcelLogs([])
      alert('Không tải được bảng chi tiết từ Excel: ' + (requestError.message || requestError))
    } finally {
      setExcelLogsLoading(false)
    }
  }

  const handleDownloadExcelDetail = async () => {
    if (!filteredExcelLogs.length) {
      alert('Không có dữ liệu để tải Excel.')
      return
    }
    try {
      await ensureXlsx()
      const rows = filteredExcelLogs.map((log, index) => {
        const dateStr = log.date ? String(log.date).slice(0, 10) : ''
        const hours = Number(log.hours ?? log.soGio ?? log.gio ?? 0) || 0
        const gioPlus = Number(log.gioPlus ?? 0) || 0
        const tongGio = Number(log.tongGio ?? hours + gioPlus) || 0
        const late = timingMinutesForLog(log, 'lateMinutes', log.lateMinutes ?? log.vaoTre)
        const early = timingMinutesForLog(log, 'earlyMinutes', log.earlyMinutes ?? log.raSom)
        return {
          STT: index + 1,
          'Mã NV': log.displayEmployeeCode || log.sourceEmployeeCode || log.employeeCode || '',
          'Họ tên': log.employeeName || '',
          'Công ty': companyName,
          'Tên máy CC': log.machineName || log.tenTheoMayChamCong || '',
          'Phòng ban': log.department || log.phongBan || '',
          Ngày: dateStr
            ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN')
            : '',
          Thứ: log.dayOfWeek || log.thu || dayOfWeekFromDate(dateStr) || '',
          Vào: punchTimesForDisplay(log, 'checkIn'),
          Ra: punchTimesForDisplay(log, 'checkOut'),
          Công: log.cong ?? '',
          Giờ: hours || '',
          'Công+': log.congPlus ?? '',
          'Vào trễ': late || '',
          'Ra sớm': early || '',
          TC1: log.tc1 ?? '',
          TC2: log.tc2 ?? '',
          TC3: log.tc3 ?? '',
          Ca: log.profileShift || log.shiftName || log.tenCa || '',
          KH: log.kyHieu || log.status || '',
          'KH+': log.kyHieuPlus || '',
          'Tổng giờ': tongGio || ''
        }
      })
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'BangChiTiet')
      XLSX.writeFile(workbook, `Bang_cham_cong_chi_tiet_${month || currentMonthValue()}.xlsx`)
    } catch (requestError) {
      console.error('Không tải được Excel bảng chi tiết:', requestError)
      alert('Không tải được Excel: ' + (requestError.message || requestError))
    }
  }

  const filteredExcelLogs = useMemo(() => {
    const term = normalizeSearch(excelSearch)
    if (!term) return excelLogs
    return excelLogs.filter(log => {
      const haystack = [
        log.displayEmployeeCode,
        log.sourceEmployeeCode,
        log.employeeCode,
        log.employeeName,
        log.machineName,
        log.tenTheoMayChamCong,
        log.department,
        log.phongBan,
        log.date
      ].map(normalizeSearch).join(' ')
      return haystack.includes(term)
    })
  }, [excelLogs, excelSearch])

  const excelTotalPages = Math.max(1, Math.ceil(filteredExcelLogs.length / excelPageSize) || 1)
  const excelSafePage = Math.min(excelPage, excelTotalPages)
  const excelPageStart = filteredExcelLogs.length === 0 ? 0 : (excelSafePage - 1) * excelPageSize + 1
  const excelPageEnd = Math.min(excelSafePage * excelPageSize, filteredExcelLogs.length)

  const visibleExcelLogs = useMemo(
    () => filteredExcelLogs.slice((excelSafePage - 1) * excelPageSize, excelSafePage * excelPageSize),
    [excelPageSize, excelSafePage, filteredExcelLogs]
  )

  const handleDownloadSummaryPdf = () => {
    if (!rows.length) {
      alert('Chưa có dữ liệu bảng công tổng hợp để xuất PDF.')
      return
    }

    const headers = [
      'STT', 'Họ tên', 'Công ty', 'Bộ phận', 'Ca làm', 'Công thực tế',
      'Phép hưởng lương', 'Tổng công tính lương', 'Notes', 'Tăng ca',
      'Công làm lễ', 'Công lễ'
    ]
    const reportRows = rows.map((row, index) => [
      index + 1,
      row.employeeName || '-',
      companyName,
      row.displayDepartment || row.department || '-',
      row.shift || '-',
      formatWorkdays(actualWorkdaysFor(row)),
      formatWorkdays(paidLeaveWorkdaysFor(row)),
      formatWorkdays(payableWorkdaysFor(row)),
      summaryNoteLines(row, attendanceNotes, month).join(' | ') || '-',
      row.overtimeHours ?? '-',
      row.congLamLe ?? row.holidayWorkdays ?? '-',
      row.congLe ?? '-'
    ])

    openAttendancePrintWindow({
      title: `Bảng công tổng hợp tháng ${month}`,
      companyName,
      month,
      filterLabel: 'Tất cả nhân sự',
      exportedAt: new Date().toLocaleString('vi-VN'),
      headers,
      rows: reportRows,
      tableMode: 'list'
    })
  }

  useEffect(() => {
    setExcelPage(1)
  }, [excelSearch, excelPageSize])

  useEffect(() => {
    if (excelPage > excelTotalPages) setExcelPage(excelTotalPages)
  }, [excelPage, excelTotalPages])

  const handleOpenImport = async () => {
    if (!canEditWorkdays) return
    setImportEmployees([])
    setImportLogs([])
    setImportEmployeeMappings({})
    setImportMappingTemplates({})
    try {
      const [empData, logsData, storedSettings, storedMappings, storedMappingTemplates] = await Promise.all([
        fbGetEmployeesDirectory(companyId),
        // Nạp toàn bộ log để chống tạo bản ghi trùng khi file có tháng khác
        // tháng đang chọn trên màn hình (tháng sẽ được nhận diện từ file).
        fbGet('hr/attendanceLogs', companyId),
        fbGet('hr/attendanceSettings/default', companyId),
        fbGet('hr/attendanceEmployeeMappings/default', companyId),
        fbGet('hr/attendanceImportMappingTemplates/default', companyId)
      ])
      setAttendanceSettings(normalizeAttendanceShiftSettings(storedSettings))
      setImportEmployees(
        Array.isArray(empData)
          ? empData
          : Object.entries(empData || {}).map(([id, value]) => ({ ...value, id }))
      )
      setImportLogs(
        Array.isArray(logsData)
          ? logsData
          : Object.entries(logsData || {}).map(([id, value]) => ({ ...value, id }))
      )
      setImportEmployeeMappings(
        storedMappings && typeof storedMappings === 'object' ? storedMappings : {}
      )
      setImportMappingTemplates(
        storedMappingTemplates && typeof storedMappingTemplates === 'object'
          ? storedMappingTemplates
          : {}
      )
    } catch (err) {
      console.warn('Không thể nạp trước dữ liệu nhân sự để import:', err)
      alert('Không tải được đầy đủ danh mục nhân viên. Vui lòng thử mở Import lại. Dữ liệu chưa được phân tích hoặc ghi vào hệ thống.')
      return
    }
    setIsImportOpen(true)
  }

  const saveMonthSummary = useCallback(async (
    targetMonth,
    { silent = false, apply = true } = {}
  ) => {
    const snapshot = await rebuildAttendanceMonthSummary(targetMonth, {
      companyId,
      companyName
    })
    if (apply) {
      const storedSettings = await fbGet('hr/attendanceSettings/default', companyId)
      const storedManuals = await fbGet(`hr/manualWorkdays/${targetMonth}`, companyId)
      setAttendanceSettings(normalizeAttendanceShiftSettings(storedSettings))
      setManualWorkdays(storedManuals || {})
      applySnapshot(snapshot, targetMonth)
    }
    setSummaryMonths(prev => {
      const next = new Set(prev)
      next.add(targetMonth)
      return Array.from(next).sort().reverse()
    })
    if (!silent) {
      alert(
        `Đã lưu bảng công tháng ${targetMonth} (${snapshot.employeeCount || 0} nhân viên). ` +
        'Bảng phạt đã đồng bộ các lỗi muộn/sớm/quên chấm từ bảng công (giữ dòng nhập tay).'
      )
    }
    return snapshot
  }, [applySnapshot, companyId, companyName])

  const handleSaveManualWorkday = async (employeeId, day, rawValue) => {
    if (!canEditWorkdays) return
    const parsed = parseManualWorkdayInput(rawValue)
    if (!parsed.valid) {
      alert(parsed.error)
      return
    }

    const employeeKey = String(employeeId)
    const savingKey = `${employeeKey}:${day}`
    const previous = manualWorkdays
    const next = updateManualWorkdays(previous, employeeKey, day, parsed.value)
    setManualWorkdays(next)
    setManualSavingKey(savingKey)
    setManualNotice('')
    let persisted = false

    try {
      await fbSet(
        `hr/manualWorkdays/${month}/${employeeKey}`,
        next[employeeKey] || {},
        companyId
      )
      persisted = true
      const snapshot = await saveMonthSummary(month, { silent: true })
      const refreshedRows = groupRowsByDepartment(hydrateAttendanceSummaryRows(snapshot.rows || []))
      const refreshedDetail = refreshedRows.find(row => String(row.employeeId) === employeeKey)
      if (refreshedDetail) setDetailRow(refreshedDetail)
      setManualNotice(
        parsed.value === null
          ? 'Đã bỏ chỉnh tay và khôi phục số công tự động.'
          : `Đã lưu ${parsed.value} công cho ngày ${String(day).padStart(2, '0')}/${month}.`
      )
    } catch (requestError) {
      console.error('Không lưu được số công chỉnh tay:', requestError)
      if (!persisted) setManualWorkdays(previous)
      alert(
        persisted
          ? 'Đã lưu số công nhưng chưa tổng hợp lại được bảng: ' + (requestError.message || requestError)
          : 'Không lưu được số công: ' + (requestError.message || requestError)
      )
    } finally {
      setManualSavingKey('')
    }
  }

  const openDetailRow = row => {
    setNoteDrafts({ ...(attendanceNotes[String(row.employeeId)] || {}) })
    setNoteNotice('')
    setManualNotice('')
    setDetailRow(row)
  }

  const closeDetailRow = () => {
    if (noteSaving) return
    if (hasUnsavedNotes && !window.confirm('Ghi chú chưa được lưu. Bạn muốn đóng và bỏ thay đổi?')) return
    setDetailRow(null)
    setNoteNotice('')
  }

  const handleSaveAttendanceNotes = async () => {
    if (!canEditNotes) return
    if (!detailRow || !hasUnsavedNotes || noteSaving) return
    const employeeKey = String(detailRow.employeeId)
    const nextEmployeeNotes = normalizeDailyNotes(noteDrafts)
    setNoteSaving(true)
    setNoteNotice('')
    try {
      await fbSet(`hr/attendanceNotes/${month}/${employeeKey}`, nextEmployeeNotes, companyId)
      setAttendanceNotes(previous => ({ ...previous, [employeeKey]: nextEmployeeNotes }))
      setNoteDrafts(nextEmployeeNotes)
      setNoteNotice('Đã lưu ghi chú. Cột Notes đã được cập nhật.')
    } catch (requestError) {
      setNoteNotice('Không lưu được ghi chú: ' + (requestError.message || requestError))
    } finally {
      setNoteSaving(false)
    }
  }

  const handleImportComplete = async (result = '') => {
    setIsImportOpen(false)
    const primaryMonth = typeof result === 'string'
      ? result
      : result?.primaryMonth
    const targetMonth = primaryMonth || month || currentMonthValue()
    const affectedMonths = Array.from(new Set([
      ...(Array.isArray(result?.affectedMonths) ? result.affectedMonths : []),
      targetMonth
    ])).filter(value => /^\d{4}-\d{2}$/.test(value))
    setSummarizing(true)
    setError('')
    try {
      for (const affectedMonth of affectedMonths) {
        await saveMonthSummary(affectedMonth, {
          silent: true,
          apply: affectedMonth === targetMonth
        })
      }
      await loadSummaryIndex()
      if (isExcelDetailOpen) {
        await handleOpenExcelDetail(targetMonth)
      }
      alert(`Đã đồng bộ Excel và lưu bảng công tháng ${affectedMonths.join(', ')}.`)
      return { summaryStatus: 'complete', affectedMonths }
    } catch (requestError) {
      console.error('Lưu bảng công sau import thất bại:', requestError)
      alert('Import xong nhưng chưa lưu được bảng công: ' + (requestError.message || requestError))
      await loadMonthSnapshot(targetMonth)
      return {
        summaryStatus: 'failed',
        affectedMonths,
        error: requestError.message || String(requestError)
      }
    } finally {
      setSummarizing(false)
    }
  }

  const handleSummarize = async () => {
    if (!canEditWorkdays) return
    const targetMonth = month || currentMonthValue()
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      alert('Tháng không hợp lệ. Dùng định dạng YYYY-MM.')
      return
    }
    if (!confirm(`Tổng hợp lại bảng công tháng ${targetMonth} từ dữ liệu chấm công hiện có?`)) {
      return
    }

    setSummarizing(true)
    setError('')
    try {
      await saveMonthSummary(targetMonth)
    } catch (requestError) {
      console.error('Tổng hợp bảng công thất bại:', requestError)
      alert('Lỗi tổng hợp bảng công: ' + (requestError.message || requestError))
    } finally {
      setSummarizing(false)
    }
  }

  const handleToggleConfirm = async (employeeId, checked) => {
    if (!canEditWorkdays) return
    const targetMonth = month || currentMonthValue()
    const key = String(employeeId)
    const previous = confirmations
    const next = { ...confirmations }
    if (checked) next[key] = true
    else delete next[key]
    setConfirmations(next)
    setConfirmSaving(true)
    try {
      await fbSet(`hr/attendanceMonthConfirmations/${targetMonth}`, next, companyId)
    } catch (requestError) {
      console.error('Không lưu được xác nhận:', requestError)
      setConfirmations(previous)
      alert('Không lưu được xác nhận: ' + (requestError.message || requestError))
    } finally {
      setConfirmSaving(false)
    }
  }

  const allConfirmed = rows.length > 0 && rows.every(row => confirmations[String(row.employeeId)])

  const handleToggleConfirmAll = async (checked) => {
    if (!canEditWorkdays) return
    const targetMonth = month || currentMonthValue()
    const previous = confirmations
    const next = checked
      ? Object.fromEntries(rows.map(row => [String(row.employeeId), true]))
      : {}
    setConfirmations(next)
    setConfirmSaving(true)
    try {
      await fbSet(`hr/attendanceMonthConfirmations/${targetMonth}`, next, companyId)
    } catch (requestError) {
      console.error('Không lưu được xác nhận:', requestError)
      setConfirmations(previous)
      alert('Không lưu được xác nhận: ' + (requestError.message || requestError))
    } finally {
      setConfirmSaving(false)
    }
  }

  const handleResetAttendance = async ({
    scope,
    targetMonth,
    clearConfirmations = true,
    clearManuals = true
  }) => {
    if (!canEditWorkdays) return
    if (scope === 'month') {
      if (!targetMonth) throw new Error('Vui lòng chọn tháng cần xóa.')

      // 1. Xóa các bản ghi attendanceLogs của tháng này trong hr_records
      const { data: logRows, error: logFetchErr } = await supabase
        .from('hr_records')
        .select('id')
        .eq('collection', 'attendanceLogs')
        .gte('data->>date', `${targetMonth}-01`)
        .lte('data->>date', `${targetMonth}-31\uffff`)

      if (logFetchErr) {
        console.error('Lỗi truy vấn attendanceLogs:', logFetchErr)
        throw logFetchErr
      }

      if (logRows?.length) {
        const ids = logRows.map(r => r.id)
        const batchSize = 50
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize)
          const { error: delErr } = await supabase
            .from('hr_records')
            .delete()
            .in('id', batch)
          if (delErr) throw delErr
        }
      }

      // 2. Xóa snapshot tổng hợp tháng
      const { error: sumErr } = await supabase
        .from('hr_records')
        .delete()
        .eq('id', `attendanceMonthSummaries::${targetMonth}`)
      if (sumErr) console.warn('Lỗi xóa snapshot:', sumErr)

      // 3. Xóa điều chỉnh công
      await supabase
        .from('hr_records')
        .delete()
        .eq('id', `attendanceAdjustments::${targetMonth}`)

      // 4. Xóa xác nhận nếu chọn
      if (clearConfirmations) {
        await supabase
          .from('hr_records')
          .delete()
          .eq('id', `attendanceMonthConfirmations::${targetMonth}`)
      }

      // 5. Xóa chỉnh sửa công tay nếu chọn
      if (clearManuals) {
        await supabase
          .from('hr_records')
          .delete()
          .eq('collection', 'manualWorkdays')
          .or(`id.eq.manualWorkdays::${targetMonth},id.like.manualWorkdays::${targetMonth}__%`)
        await supabase
          .from('hr_records')
          .delete()
          .eq('collection', 'attendanceNotes')
          .or(`id.eq.attendanceNotes::${targetMonth},id.like.attendanceNotes::${targetMonth}__%`)
      }

      // 6. Xóa bảng phạt tháng liên quan nếu có
      try {
        await supabase
          .from('hr_records')
          .delete()
          .eq('id', `attendanceMonthPenalties::${targetMonth}`)
      } catch (err) {
        console.warn('Lỗi khi xóa attendanceMonthPenalties:', err)
      }

      try {
        await supabase
          .from('attendance_penalties')
          .delete()
          .eq('month', targetMonth)
      } catch (err) {
        console.warn('Lỗi khi xóa attendance_penalties:', err)
      }

      // Cập nhật state
      setSummaryMonths(prev => prev.filter(m => m !== targetMonth))
      if (month === targetMonth) {
        applySnapshot(null, targetMonth)
        setConfirmations({})
        setManualWorkdays({})
        setAttendanceNotes({})
        setExcelLogs([])
      }

      alert(`Đã xóa toàn bộ bảng công tháng ${targetMonth} thành công (${logRows?.length || 0} bản ghi chấm công chi tiết). Bạn có thể tải lại file Excel mới ngay bây giờ!`)
    } else {
      // Scope === 'all': Xóa toàn bộ dữ liệu bảng công của tất cả các tháng
      const collectionsToDelete = [
        'attendanceLogs',
        'attendanceMonthSummaries',
        'attendanceAdjustments'
      ]
      if (clearConfirmations) collectionsToDelete.push('attendanceMonthConfirmations')
      if (clearManuals) collectionsToDelete.push('manualWorkdays', 'attendanceNotes')
      collectionsToDelete.push('attendanceMonthPenalties')

      const { error: delErr } = await supabase
        .from('hr_records')
        .delete()
        .in('collection', collectionsToDelete)

      if (delErr) {
        console.error('Lỗi khi xóa toàn bộ hr_records:', delErr)
        throw delErr
      }

      try {
        await supabase
          .from('attendance_penalties')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      } catch (err) {
        console.warn('Lỗi khi xóa attendance_penalties:', err)
      }

      // Reset toàn bộ state
      setSummaryMonths([])
      applySnapshot(null, month)
      setConfirmations({})
      setManualWorkdays({})
      setExcelLogs([])

      alert('Đã xóa toàn bộ dữ liệu bảng công của tất cả các tháng thành công! Bạn có thể tải lại file Excel mới ngay bây giờ.')
    }
  }

  const filteredRows = useMemo(() => {
    const term = normalizeSearch(excelSearch)
    return term ? rows.filter(row => [row.employeeName, row.displayEmployeeCode || row.employeeCode, row.displayDepartment || row.department]
      .some(value => normalizeSearch(value).includes(term))) : rows
  }, [rows, excelSearch])
  const departmentRowSpans = useMemo(() => getConsecutiveDepartmentRowSpans(filteredRows), [filteredRows])
  const calendar = useMemo(() => {
    const [year, monthNumber] = String(month || '').split('-').map(Number)
    const daysInMonth = year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 31
    return Array.from({ length: 31 }, (_, index) => {
      const day = index + 1
      const weekday = day <= daysInMonth ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(year, monthNumber - 1, day).getDay()] : ''
      return { day, weekday }
    })
  }, [month])
  const weeklyPeople = useMemo(() => {
    const weekRanges = monthWeeks.filter(week => !activeWeek || week.index === activeWeek.index)
    const checks = [
      ['Đi muộn', day => day?.late],
      ['Không chấm công', day => day?.missingPunch],
      ['Nghỉ không phép', day => day?.unapprovedAbsence]
    ]

    return rows
      .map(row => {
        const days = row.days instanceof Map
          ? row.days
          : new Map(Object.entries(row.days || {}))
        const weeks = weekRanges.map(week => {
          const flags = checks
            .filter(([, predicate]) =>
              Array.from(
                { length: Math.max(0, week.end - week.start + 1) },
                (_, offset) => days.get(`${month}-${String(week.start + offset).padStart(2, '0')}`)
              ).some(predicate)
            )
            .map(([label]) => label)
          return { label: week.label, flags }
        })
        const hasIssue = weeks.some(week => week.flags.length > 0)
        if (!hasIssue) return null
        return {
          employeeId: row.employeeId,
          employeeCode: row.employeeCode || '',
          employeeName: row.employeeName || '',
          weeks
        }
      })
      .filter(Boolean)
  }, [activeWeek, month, monthWeeks, rows])
  const weekLabels = useMemo(
    () => monthWeeks
      .filter(week => !activeWeek || week.index === activeWeek.index)
      .map(week => `${week.label} (${week.rangeLabel})`),
    [activeWeek, monthWeeks]
  )
  const detailDays = useMemo(() => {
    if (!detailRow || !month) return []
    const [year, monthNumber] = String(month).split('-').map(Number)
    const daysInMonth = year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 0
    const fallbackShift = resolveAttendanceShift(
      {
        shift: detailRow.shift,
        ca_lam_viec: detailRow.shift,
        standardCheckIn: detailRow.standardCheckIn,
        standardCheckOut: detailRow.standardCheckOut
      },
      { shiftName: detailRow.shift, tenCa: detailRow.shift },
      attendanceSettings
    )
    const fallbackStandardIn = formatAttendanceTime(fallbackShift?.start || fallbackShift?.standardCheckIn)
    const fallbackStandardOut = formatAttendanceTime(fallbackShift?.end || fallbackShift?.standardCheckOut)

    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1
      const date = `${month}-${String(day).padStart(2, '0')}`
      const dayData = detailRow.days?.get?.(date) || null
      const log = dayData?.logs?.[0] || {}
      const checkIn = formatAttendanceTime(
        dayData?.checkIn || log.checkIn || log.vao || ''
      )
      const checkOut = formatAttendanceTime(
        dayData?.checkOut || log.checkOut || log.ra || ''
      )
      const standardCheckIn = formatAttendanceTime(
        dayData?.standardCheckIn || fallbackStandardIn
      )
      const standardCheckOut = formatAttendanceTime(
        dayData?.standardCheckOut || fallbackStandardOut
      )
      return {
        day,
        date,
        weekday: weekdayText(month, day),
        code: dayCode(dayData),
        workdays: dayData?.workdays ?? '',
        manualWorkday: manualWorkdays[String(detailRow.employeeId)]?.[String(day)],
        hours: dayData?.hours || '',
        overtimeHours: dayData?.overtimeHours || '',
        checkIn,
        checkOut,
        standardCheckIn,
        standardCheckOut,
        notes: dayNotes(dayData),
        manualNote: attendanceNotes[String(detailRow.employeeId)]?.[String(day)] || '',
        hasData: Boolean(dayData)
      }
    })
  }, [attendanceSettings, attendanceNotes, detailRow, manualWorkdays, month])
  const detailStandardLabel = useMemo(() => {
    if (!detailDays.length) return ''
    const sample = detailDays.find(item => item.standardCheckIn && item.standardCheckOut) || detailDays[0]
    if (!sample?.standardCheckIn || !sample?.standardCheckOut) return ''
    return `${sample.standardCheckIn} - ${sample.standardCheckOut}`
  }, [detailDays])

  if (loading || loadedCompanyId !== companyId) return <div className="attendance-preview-state">Đang tải bảng công đã tổng hợp...</div>
  if (error && !hasSnapshot) return <div className="attendance-preview-state is-error">{error}</div>

  return <div className="attendance-preview-page">
    <header>
      <div>
        <h1>Bảng công {month}</h1>
        <p className="attendance-company-context">Công ty: <strong>{companyName}</strong></p>
        <p>
          {hasSnapshot
            ? `Đã lưu lúc ${formatGeneratedAt(generatedAt)}${sourceLogCount ? ` · ${sourceLogCount} bản ghi chấm công` : ''}`
            : 'Chưa có bảng công tháng này · Tải Excel để đồng bộ và lưu'}
        </p>
      </div>
      <div className="attendance-preview-actions">
        <input type="search" aria-label="Tìm nhân viên trong bảng công" placeholder="Tìm tên, mã NV, phòng ban..." value={excelSearch} onChange={event => setExcelSearch(event.target.value)} />
        <label>
          Tháng
          <input
            type="month"
            value={month}
            onChange={event => handleMonthChange(event.target.value)}
            disabled={summarizing}
          />
        </label>
        {summaryMonths.length > 0 && (
          <label>
            Đã lưu
            <select
              value={summaryMonths.includes(month) ? month : ''}
              onChange={event => event.target.value && handleMonthChange(event.target.value)}
              disabled={summarizing}
            >
              {!summaryMonths.includes(month) && <option value="">Chọn tháng đã lưu</option>}
              {summaryMonths.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        {canEditWorkdays && (
          <button
            type="button"
            className="attendance-preview-import-btn"
            onClick={handleOpenImport}
            disabled={summarizing}
          >
            Tải Excel & Lưu bảng công
          </button>
        )}
        <MobileActions>
        <button
          type="button"
          className="attendance-preview-detail-btn"
          onClick={handleOpenExcelDetail}
          disabled={summarizing || excelLogsLoading}
          title="Xem bảng chấm công chi tiết đã tải từ Excel"
        >
          {excelLogsLoading ? 'Đang tải...' : 'Xem bảng chi tiết'}
        </button>
        {hasSnapshot && canEditWorkdays && (
          <button type="button" className="attendance-preview-summarize" onClick={handleSummarize} disabled={summarizing}>
            {summarizing ? 'Đang lưu...' : 'Tổng hợp lại'}
          </button>
        )}
        {hasSnapshot && (
          <button
            type="button"
            className="attendance-preview-pdf-btn"
            onClick={handleDownloadSummaryPdf}
            disabled={summarizing || !rows.length}
            title={`Xuất bảng công tổng hợp tháng ${month} dưới dạng PDF`}
          >
            Tải PDF
          </button>
        )}
        {canEditWorkdays && (
          <button
            type="button"
            className="attendance-preview-reset-btn"
            onClick={() => setIsResetModalOpen(true)}
            disabled={summarizing}
            title="Xóa dữ liệu bảng công để đẩy lại file Excel mới"
          >
            <i className="fas fa-trash-can"></i> Xóa bảng công
          </button>
        )}
        </MobileActions>
      </div>
    </header>

    {!hasSnapshot ? (
      <div className="attendance-preview-empty">
        <p>Tháng {month} chưa có bảng công đã lưu.</p>
        {canEditWorkdays && <p>Bấm <strong>Tải Excel & Lưu bảng công</strong> để đẩy file Excel lên — hệ thống sẽ đồng bộ và lưu bảng công ngay.</p>}
      </div>
    ) : (
      <>
        <div className="attendance-preview-views" role="tablist" aria-label="Loại bảng">
          <button type="button" className={sheet === 'attendance' ? 'is-active' : ''} onClick={() => setSheet('attendance')}>Bảng công</button>
          {canEditWorkdays && <button type="button" className={sheet === 'payroll' ? 'is-active' : ''} onClick={() => setSheet('payroll')}>Bảng lương</button>}
        </div>
        {sheet === 'payroll' ? (
          <PayrollTable
            rows={rows}
            employeesById={payrollEmployees}
            penalties={payrollBundle.penalties}
            leaveSettings={payrollBundle.leave}
            kpiByEmployee={payrollKpis}
            month={month}
          />
        ) : (
        <>
        <div className="attendance-preview-scroll"><table className="attendance-preview-table is-compact">
          <thead>
            <tr className="groups">
              <th>STT</th>
              {canEditWorkdays && <th>
                <label className="attendance-confirm-cell">
                  <input
                    type="checkbox"
                    checked={allConfirmed}
                    disabled={confirmSaving || !rows.length}
                    onChange={event => handleToggleConfirmAll(event.target.checked)}
                    title="Xác nhận tất cả"
                  />
                  <span>Xác nhận</span>
                </label>
              </th>}
              <th>Họ tên</th>
              <th>Công ty</th>
              <th>Bộ phận</th>
              <th>Ca làm</th>
              <th className="workdays-actual-heading">Công thực tế</th>
              <th className="workdays-leave-heading">Phép hưởng lương</th>
              <th className="workdays-payable-heading">Tổng công tính lương</th>
              <th>Notes</th>
              <th>Tăng ca</th>
              <th>Công làm lễ</th>
              <th>Công lễ</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={row.employeeId} className={confirmations[String(row.employeeId)] ? 'is-confirmed' : ''}>
                <td>{index + 1}</td>
                {canEditWorkdays && <td>
                  <input
                    type="checkbox"
                    className="attendance-confirm-check"
                    checked={Boolean(confirmations[String(row.employeeId)])}
                    disabled={confirmSaving}
                    onChange={event => handleToggleConfirm(row.employeeId, event.target.checked)}
                    aria-label={`Xác nhận ${row.employeeName || ''}`}
                  />
                </td>}
                <td
                  className="name is-clickable"
                  onClick={() => openDetailRow(row)}
                  title="Xem chi tiết từng ngày"
                >
                  {row.employeeName}
                </td>
                <td>{companyName}</td>
                {departmentRowSpans[index] > 0 && (
                  <td rowSpan={departmentRowSpans[index]}>{row.displayDepartment}</td>
                )}
                <td>{row.shift}</td>
                <td
                  className={`workdays-actual ${canEditWorkdays ? 'is-clickable workdays-total' : ''}`}
                  onClick={() => canEditWorkdays && openDetailRow(row)}
                  title={canEditWorkdays ? 'Mở chi tiết để chỉnh tay số công từng ngày' : undefined}
                >
                  {formatWorkdays(actualWorkdaysFor(row))}
                  {canEditWorkdays && <i className="fas fa-pen" aria-hidden="true"></i>}
                </td>
                <td className="workdays-leave">{formatWorkdays(paidLeaveWorkdaysFor(row))}</td>
                <td
                  className="workdays-payable"
                  title={`${formatWorkdays(actualWorkdaysFor(row))} công thực tế + ${formatWorkdays(paidLeaveWorkdaysFor(row))} phép hưởng lương`}
                >
                  <strong>{formatWorkdays(payableWorkdaysFor(row))}</strong>
                  <small>{formatWorkdays(actualWorkdaysFor(row))} làm + {formatWorkdays(paidLeaveWorkdaysFor(row))} phép</small>
                </td>
                <td className="attendance-summary-notes">
                  <div className="attendance-summary-notes-content">
                    {summaryNoteLines(row, attendanceNotes, month).map((line, noteIndex) => (
                      <div key={`${noteIndex}-${line}`}>{line}</div>
                    ))}
                  </div>
                </td>
                <td>{row.overtimeHours || ''}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <section className="attendance-preview-mobile" aria-label="Bảng công theo nhân viên">
          {filteredRows.length === 0 ? (
            <p className="attendance-preview-mobile__empty">Tháng này chưa có nhân viên trong bảng công.</p>
          ) : filteredRows.map(row => (
            <article className="attendance-preview-mobile-card" key={row.employeeId}>
              <div className="attendance-preview-mobile-card__head">
                <button type="button" onClick={() => openDetailRow(row)}>
                  {row.employeeName || row.employeeCode || 'Nhân viên'}
                </button>
                {canEditWorkdays && <label>
                  <input
                    type="checkbox"
                    checked={Boolean(confirmations[String(row.employeeId)])}
                    disabled={confirmSaving}
                    onChange={event => handleToggleConfirm(row.employeeId, event.target.checked)}
                    aria-label={`Xác nhận ${row.employeeName || ''}`}
                  />
                  Xác nhận
                </label>}
              </div>
              <p>{row.displayDepartment || row.department || 'Chưa có bộ phận'} · {row.shift || 'Chưa có ca'}</p>
              <div className="attendance-preview-mobile-card__stats">
                <div><span>Công thực tế</span><strong>{formatWorkdays(actualWorkdaysFor(row))}</strong></div>
                <div><span>Phép hưởng lương</span><strong>{formatWorkdays(paidLeaveWorkdaysFor(row))}</strong></div>
                <div><span>Công tính lương</span><strong>{formatWorkdays(payableWorkdaysFor(row))}</strong></div>
                <div><span>Tăng ca</span><strong>{row.overtimeHours || 0}</strong></div>
              </div>
              {summaryNoteLines(row, attendanceNotes, month).length > 0 && (
                <div className="attendance-preview-mobile-card__notes">
                  <strong>Ghi chú</strong>
                  {summaryNoteLines(row, attendanceNotes, month).map((line, index) => (
                    <span key={`${index}-${line}`}>{line}</span>
                  ))}
                </div>
              )}
              <button type="button" className="attendance-preview-mobile-card__detail" onClick={() => openDetailRow(row)}>
                {canEditWorkdays ? 'Xem và chỉnh chi tiết từng ngày' : 'Xem chi tiết từng ngày'}
              </button>
            </article>
          ))}
        </section>
        <section className="attendance-preview-weeks">
          <div className="attendance-preview-weeks__head">
            <h2>Tổng hợp theo tuần</h2>
            <label className="attendance-week-filter">
                Tuần
                <select value={weekFilter} onChange={event => setWeekFilter(event.target.value)}>
                  <option value="">Cả tháng</option>
                  {monthWeeks.map(week => (
                    <option key={week.index} value={week.index}>{week.label} ({week.rangeLabel})</option>
                  ))}
                </select>
              </label>
            <span>{weeklyPeople.length} nhân sự có phát sinh</span>
          </div>
          <div className="attendance-preview-weeks__scroll">
            <table className="attendance-preview-weeks-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã NV</th>
                  <th>Nhân sự</th>
                  <th>Công ty</th>
                  {weekLabels.map(label => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {weeklyPeople.length === 0 ? (
                  <tr>
                    <td colSpan={4 + weekLabels.length} className="weeks-empty">Không có phát sinh theo tuần</td>
                  </tr>
                ) : (
                  weeklyPeople.map((person, index) => (
                    <tr key={person.employeeId || person.employeeName}>
                      <td>{index + 1}</td>
                      <td className="employee-code">{person.employeeCode || '-'}</td>
                      <td className="name">{person.employeeName}</td>
                      <td>{companyName}</td>
                      {person.weeks.map(week => (
                        <td key={week.label} className={week.flags.length ? 'has-issue' : ''}>
                          {week.flags.length ? week.flags.join(' · ') : '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="attendance-preview-legend"><strong>Chú thích:</strong><span>X: Nghỉ theo lịch/không phép theo trạng thái</span><span>P1: Nghỉ phép năm</span><span>1 / 0.5: Công trong ngày</span><span>Lễ: Ngày lễ cấu hình, không tự tính công</span></section>
        </>
        )}
      </>
    )}
    {isImportOpen && (
      <AttendanceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSave={handleImportComplete}
        employees={importEmployees}
        attendanceLogs={importLogs}
        employeeMappings={importEmployeeMappings}
        importMappingTemplates={importMappingTemplates}
        attendanceSettings={attendanceSettings}
        companyId={companyId}
        companyName={companyName}
      />
    )}
    {isResetModalOpen && (
      <ResetAttendanceModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetAttendance}
        currentMonth={month}
        totalEmployees={rows.length}
        sourceLogCount={sourceLogCount}
        hasSnapshot={hasSnapshot}
        allSavedMonths={summaryMonths}
      />
    )}
    {detailRow && (
      <div className="attendance-day-detail-overlay" onClick={closeDetailRow}>
        <div className="attendance-day-detail-modal" onClick={event => event.stopPropagation()}>
          <header>
            <div>
              <h2>{detailRow.employeeName}</h2>
              <p>
                {detailRow.employeeCode ? `${detailRow.employeeCode} · ` : ''}
                {detailRow.displayDepartment || detailRow.department || ''}
                {detailRow.shift ? ` · ${detailRow.shift}` : ''}
                {` · ${companyName}`}
                {` · Tháng ${month}`}
              </p>
            </div>
            <button type="button" onClick={closeDetailRow} disabled={noteSaving}>Đóng</button>
          </header>
          <div className="attendance-day-detail-summary">
            <span>Công thực tế: <strong>{formatWorkdays(actualWorkdaysFor(detailRow))}</strong></span>
            <span>Phép hưởng lương: <strong>{formatWorkdays(paidLeaveWorkdaysFor(detailRow))}</strong></span>
            <span>Tổng công tính lương: <strong>{formatWorkdays(payableWorkdaysFor(detailRow))}</strong></span>
            <span>Tăng ca: <strong>{detailRow.overtimeHours || 0}</strong></span>
            <span>Muộn: <strong>{detailRow.lateCount || 0}</strong></span>
            <span>Quên chấm: <strong>{detailRow.missingPunchCount || 0}</strong></span>
            {detailStandardLabel && (
              <span className="is-standard">Giờ tiêu chuẩn: <strong>{detailStandardLabel}</strong></span>
            )}
          </div>
          {canEditWorkdays && (
            <div className="manual-workday-help">
              <strong>Kế toán/HR chỉnh công:</strong> nhập từ 0 đến 1 tại cột Công. Xóa ô rồi rời khỏi ô để dùng lại kết quả tự động.
              {manualNotice && <span>{manualNotice}</span>}
            </div>
          )}
          <div className="attendance-day-detail-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Thứ</th>
                  <th>Ký hiệu</th>
                  <th>Giờ vào</th>
                  <th>Giờ ra</th>
                  <th>Tiêu chuẩn</th>
                  <th>Công</th>
                  <th>Giờ</th>
                  <th>Tăng ca</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {detailDays.map(item => (
                  <tr key={item.date} className={item.hasData ? '' : 'is-empty'}>
                    <td data-label="Ngày">{dateText(item.date)}</td>
                    <td data-label="Thứ">{item.weekday}</td>
                    <td data-label="Ký hiệu">{item.code || '—'}</td>
                    <td data-label="Giờ vào" className={item.checkIn && item.standardCheckIn && item.checkIn > item.standardCheckIn ? 'is-late' : ''}>
                      {item.checkIn || '—'}
                    </td>
                    <td data-label="Giờ ra" className={item.checkOut && item.standardCheckOut && item.checkOut < item.standardCheckOut ? 'is-early' : ''}>
                      {item.checkOut || '—'}
                    </td>
                    <td data-label="Tiêu chuẩn" className="standard">
                      {item.standardCheckIn && item.standardCheckOut
                        ? `${item.standardCheckIn} - ${item.standardCheckOut}`
                        : '—'}
                    </td>
                    <td data-label="Công" className={item.manualWorkday !== undefined ? 'manual-workday-cell is-manual' : 'manual-workday-cell'}>
                      {canEditNotes ? (
                        <ManualWorkdayInput
                          value={item.manualWorkday !== undefined ? item.manualWorkday : item.workdays}
                          isManual={item.manualWorkday !== undefined}
                          disabled={manualSavingKey === `${String(detailRow.employeeId)}:${item.day}`}
                          employeeName={detailRow.employeeName}
                          date={item.date}
                          onSave={value => handleSaveManualWorkday(detailRow.employeeId, item.day, value)}
                        />
                      ) : (item.workdays !== '' ? item.workdays : '—')}
                    </td>
                    <td data-label="Giờ">{item.hours || '—'}</td>
                    <td data-label="Tăng ca">{item.overtimeHours || '—'}</td>
                    <td data-label="Ghi chú" className="note">
                      {item.notes && <div className="attendance-auto-note">{item.notes}</div>}
                      {canEditWorkdays ? (
                        <textarea
                          value={noteDrafts[String(item.day)] || ''}
                          maxLength={500}
                          rows={2}
                          disabled={noteSaving}
                          placeholder="Nhập ghi chú..."
                          aria-label={`Ghi chú ${detailRow.employeeName || ''} ngày ${item.date}`}
                          onChange={event => {
                            const value = event.target.value
                            setNoteDrafts(previous => ({ ...previous, [String(item.day)]: value }))
                            setNoteNotice('')
                          }}
                        />
                      ) : (item.manualNote || (!item.notes ? '—' : ''))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEditWorkdays && (
            <footer className="attendance-day-detail-footer">
              <span role="status">{noteNotice || (hasUnsavedNotes ? 'Có ghi chú chưa lưu.' : '')}</span>
              <button
                type="button"
                onClick={handleSaveAttendanceNotes}
                disabled={!hasUnsavedNotes || noteSaving}
              >
                {noteSaving ? 'Đang lưu...' : 'Lưu ghi chú'}
              </button>
            </footer>
          )}
        </div>
      </div>
    )}
    {isExcelDetailOpen && (
      <div className="attendance-day-detail-overlay" onClick={() => setIsExcelDetailOpen(false)}>
        <div
          className="attendance-excel-detail-modal"
          onClick={event => event.stopPropagation()}
        >
          <div className="attendance-excel-detail-head">
            <div>
              <h2>Bảng chi tiết từ Excel</h2>
              <div className="attendance-detail-mode-tabs">
                <button
                  type="button"
                  className={detailViewMode === 'matrix' ? 'is-active' : ''}
                  onClick={() => setDetailViewMode('matrix')}
                >
                  Ma trận ngày (01 - 31)
                </button>
                <button
                  type="button"
                  className={detailViewMode === 'list' ? 'is-active' : ''}
                  onClick={() => setDetailViewMode('list')}
                >
                  Nhật ký theo dòng
                </button>
              </div>
              <p>
                Tháng {month}
                {detailViewMode === 'matrix'
                  ? ` · ${matrixRows.length} nhân viên`
                  : excelLogsLoading
                    ? ' · Đang tải...'
                    : ` · ${filteredExcelLogs.length}/${excelLogs.length} dòng`}
              </p>
            </div>
            <div className="attendance-excel-detail-tools">
              <label className="attendance-week-filter">
                Tuần
                <select value={weekFilter} onChange={event => setWeekFilter(event.target.value)}>
                  <option value="">Cả tháng</option>
                  {monthWeeks.map(week => (
                    <option key={week.index} value={week.index}>{week.label} ({week.rangeLabel})</option>
                  ))}
                </select>
              </label>
              <input
                type="search"
                placeholder="Tìm tên, mã NV, phòng ban..."
                value={excelSearch}
                onChange={event => setExcelSearch(event.target.value)}
              />
              <button
                type="button"
                className="attendance-excel-download-btn"
                onClick={handleDownloadExcelDetail}
                disabled={excelLogsLoading || !filteredExcelLogs.length}
                title={`Tải dữ liệu chấm công tháng ${month} của ${companyName} xuống Excel`}
              >
                Tải Excel
              </button>
              <button type="button" onClick={() => setIsExcelDetailOpen(false)}>Đóng</button>
            </div>
          </div>

          {detailViewMode === 'matrix' ? (
            <div className="attendance-excel-detail-scroll attendance-matrix-scroll">
              {canEditWorkdays && (
                <div className="manual-workday-help matrix-edit-help">
                  <strong>Chỉnh công trên ma trận:</strong> bấm vào ô ngày, nhập 0–1 rồi rời ô để lưu. Xóa giá trị để dùng lại công thức tự động.
                  {manualNotice && <span>{manualNotice}</span>}
                </div>
              )}
              {matrixHolidayLegend.length > 0 && (
                <div className="matrix-holiday-legend">
                  <strong>Ngày lễ tháng này:</strong>
                  {matrixHolidayLegend.map(d => (
                    <span key={d.dayStr}>
                      {d.dayStr}/{String(month).slice(5)}
                      {d.holidayName ? ` · ${d.holidayName}` : ''}
                    </span>
                  ))}
                </div>
              )}
              <table className="attendance-matrix-table">
                <thead>
                  <tr className="matrix-group-row">
                    <th rowSpan="2" className="col-stt">STT</th>
                    <th rowSpan="2" className="col-code">Mã nhân viên</th>
                    <th rowSpan="2" className="col-name">Họ và tên</th>
                    <th rowSpan="2" className="col-company">Công ty</th>
                    <th rowSpan="2" className="col-pos">Chức vụ</th>
                    <th colSpan={visibleDays.length} className="matrix-month-title">
                      {activeWeek ? `${activeWeek.label} (${activeWeek.rangeLabel})` : 'Ngày trong tháng'}
                    </th>
                    <th rowSpan="2" className="col-total">Tổng tính lương</th>
                  </tr>
                  <tr className="matrix-days-row">
                    {visibleDays.map(d => (
                      <th
                        key={d.dayStr}
                        className={`day-col ${d.isSunday ? 'is-sunday' : ''} ${d.isSaturday ? 'is-saturday' : ''} ${d.isHoliday ? 'is-holiday' : ''}`}
                        title={d.isHoliday ? (d.holidayName ? `Ngày lễ: ${d.holidayName}` : 'Ngày lễ') : undefined}
                      >
                        <div className="day-number">{d.dayStr}</div>
                        <div className="day-dow">{d.isHoliday ? 'Lễ' : d.dow}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleDays.length + 6} className="empty">
                        Chưa có dữ liệu bảng công cho tháng {month}.
                      </td>
                    </tr>
                  ) : (
                    matrixRows.map((emp, idx) => (
                      <tr key={emp.employeeId || emp.code || idx}>
                        <td className="col-stt">{idx + 1}</td>
                        <td className="col-code font-bold">{emp.code || '-'}</td>
                        <td className="col-name font-semibold">{emp.name || '-'}</td>
                        <td className="col-company">{companyName}</td>
                        <td className="col-pos">{emp.position || '-'}</td>
                        {visibleDays.map(d => {
                          const cell = emp.dailyMap[d.dayStr] || {}
                          const val = cell.code || ''
                          const isOff = val === '0' || (d.isSunday && !val)
                          const isHoliday = Boolean(cell.isHoliday || d.isHoliday)
                          return (
                            <td
                              key={d.dayStr}
                              className={`matrix-cell ${isOff ? 'is-off' : ''} ${val === '1' ? 'is-work' : ''} ${isHoliday ? 'is-holiday' : ''} ${cell.isManual ? 'is-manual' : ''} ${canEditWorkdays ? 'is-editable' : ''}`}
                              title={cell.formula || (isHoliday ? (cell.holidayName || d.holidayName || 'Ngày lễ') : undefined)}
                            >
                              {canEditWorkdays ? (
                                <ManualWorkdayInput
                                  value={cell.isManual ? cell.manualWorkday : (cell.workdays !== '' ? cell.workdays : val)}
                                  isManual={cell.isManual}
                                  disabled={manualSavingKey === `${String(emp.employeeId)}:${d.day}`}
                                  employeeName={emp.name}
                                  date={`${month}-${d.dayStr}`}
                                  onSave={value => handleSaveManualWorkday(emp.employeeId, d.day, value)}
                                />
                              ) : (
                                <>
                                  <span className="matrix-cell-value">{val}</span>
                                  {cell.formula && (
                                    <span className="matrix-cell-formula">{cell.formula}</span>
                                  )}
                                </>
                              )}
                            </td>
                          )
                        })}
                        <td className="col-total font-bold">{emp.totalCong}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="matrix-formula-legend">
                <strong>Công thức công ngày:</strong>
                <span>Có Vào/Ra → phút(Vào→Ra) ÷ 480 (tối đa 1 công)</span>
                <span>P1 = phép 1 công</span>
                <span>Hover ô để xem công thức chi tiết</span>
              </div>
            </div>
          ) : (
            <>
              <div className="attendance-excel-detail-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Mã NV</th>
                      <th>Họ tên</th>
                      <th>Công ty</th>
                      <th>Tên máy CC</th>
                      <th>Phòng ban</th>
                      <th>Ngày</th>
                      <th>Thứ</th>
                      <th>Vào</th>
                      <th>Ra</th>
                      <th>Công</th>
                      <th>Giờ</th>
                      <th>Công+</th>
                      <th>Vào trễ</th>
                      <th>Ra sớm</th>
                      <th>TC1</th>
                      <th>TC2</th>
                      <th>TC3</th>
                      <th>Ca</th>
                      <th>KH</th>
                      <th>KH+</th>
                      <th>Tổng giờ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelLogsLoading ? (
                      <tr>
                        <td colSpan="22" className="empty">Đang tải bảng chi tiết...</td>
                      </tr>
                    ) : visibleExcelLogs.length === 0 ? (
                      <tr>
                        <td colSpan="22" className="empty">
                          Chưa có dữ liệu Excel cho tháng này. Hãy dùng “Tải Excel & Lưu bảng công”.
                        </td>
                      </tr>
                    ) : (
                      visibleExcelLogs.map((log, index) => {
                        const dateStr = log.date ? String(log.date).slice(0, 10) : ''
                        const hours = Number(log.hours ?? log.soGio ?? log.gio ?? 0) || 0
                        const gioPlus = Number(log.gioPlus ?? 0) || 0
                        const tongGio = Number(log.tongGio ?? hours + gioPlus) || 0
                        const late = timingMinutesForLog(log, 'lateMinutes', log.lateMinutes ?? log.vaoTre)
                        const early = timingMinutesForLog(log, 'earlyMinutes', log.earlyMinutes ?? log.raSom)
                        return (
                          <tr key={log.id || `${log.employeeId}-${dateStr}-${index}`}>
                            <td data-label="STT">{excelPageStart + index}</td>
                            <td data-label="Mã NV">{log.displayEmployeeCode || log.sourceEmployeeCode || log.employeeCode || '-'}</td>
                            <td data-label="Họ tên">{log.employeeName || '-'}</td>
                            <td data-label="Công ty">{companyName}</td>
                            <td data-label="Tên máy CC">{log.machineName || log.tenTheoMayChamCong || '-'}</td>
                            <td data-label="Phòng ban">{log.department || log.phongBan || '-'}</td>
                            <td data-label="Ngày">
                              {dateStr
                                ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('vi-VN')
                                : '-'}
                            </td>
                            <td data-label="Thứ">{log.dayOfWeek || log.thu || dayOfWeekFromDate(dateStr) || '-'}</td>
                            <td data-label="Vào">{punchTimesForDisplay(log, 'checkIn')}</td>
                            <td data-label="Ra">{punchTimesForDisplay(log, 'checkOut')}</td>
                            <td data-label="Công">{log.cong ?? '-'}</td>
                            <td data-label="Giờ">{hours ? hours.toFixed(2) : '-'}</td>
                            <td data-label="Công+">{log.congPlus ?? '-'}</td>
                            <td data-label="Vào trễ" className={late > 0 ? 'is-late' : ''}>{late > 0 ? `${late}p` : '-'}</td>
                            <td data-label="Ra sớm" className={early > 0 ? 'is-early' : ''}>{early > 0 ? `${early}p` : '-'}</td>
                            <td data-label="TC1">{log.tc1 ?? '-'}</td>
                            <td data-label="TC2">{log.tc2 ?? '-'}</td>
                            <td data-label="TC3">{log.tc3 ?? '-'}</td>
                            <td data-label="Ca">{log.profileShift || log.shiftName || log.tenCa || '-'}</td>
                            <td data-label="KH">{log.kyHieu || log.status || '-'}</td>
                            <td data-label="KH+">{log.kyHieuPlus || '-'}</td>
                            <td data-label="Tổng giờ"><strong>{tongGio ? tongGio.toFixed(2) : '-'}</strong></td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filteredExcelLogs.length > 0 && (
                <div className="attendance-excel-detail-pager">
                  <div className="attendance-excel-detail-pager__info">
                    Hiển thị {excelPageStart}–{excelPageEnd} / {filteredExcelLogs.length} dòng
                  </div>
                  <div className="attendance-excel-detail-pager__controls">
                    <label>
                      Mỗi trang
                      <select
                        value={excelPageSize}
                        onChange={event => setExcelPageSize(Number(event.target.value) || EXCEL_DETAIL_PAGE_SIZE)}
                      >
                        {EXCEL_DETAIL_PAGE_SIZE_OPTIONS.map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={excelSafePage <= 1}
                      onClick={() => setExcelPage(1)}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      disabled={excelSafePage <= 1}
                      onClick={() => setExcelPage(page => Math.max(1, page - 1))}
                    >
                      Trước
                    </button>
                    <span className="attendance-excel-detail-pager__page">
                      Trang {excelSafePage}/{excelTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={excelSafePage >= excelTotalPages}
                      onClick={() => setExcelPage(page => Math.min(excelTotalPages, page + 1))}
                    >
                      Sau
                    </button>
                    <button
                      type="button"
                      disabled={excelSafePage >= excelTotalPages}
                      onClick={() => setExcelPage(excelTotalPages)}
                    >
                      »
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )}
  </div>
}

export default AttendancePreview
