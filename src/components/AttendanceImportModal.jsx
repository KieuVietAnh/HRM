import { useMemo, useRef, useState } from 'react'
import XLSX from 'xlsx-js-style'
import { fbGet, fbSet, fbUpdate } from '../services/firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  applyEmployeeToAttendanceLog,
  buildAttendanceMappingKey,
  buildMonthlyAttendanceSourceKey,
  buildSourceEmployeeKey,
  getCanonicalEmployeeCode,
  matchAttendanceEmployee,
  matchDetailedAttendanceEmployee,
  matchMonthlyAttendanceEmployee,
  normalizeEmployeeIdentity,
  scopeAttendanceEmployeesByCompany,
  validateMonthlyAttendanceSelection
} from '../utils/attendanceMatching'
import { createEmployeeDirectoryProfile } from '../services/employeeDirectory'
import {
  planAttendanceImport,
  sanitizeAttendanceImportLog
} from '../services/attendanceImportService'
import {
  analyzeAttendanceSheet,
  buildAttendanceHeaderSignature,
  buildAttendanceTemplateBindings,
  classifyMatrixAttendanceCell,
  collectAttendancePunches,
  expandAttendanceMergedCells,
  findAttendancePunchColumns,
  mapAttendanceColumns,
  normalizeAttendanceHeader,
  parseAttendanceDate,
  parseAttendanceDecimal,
  parseAttendanceTime,
  resolveAttendanceTemplateBindings
} from '../utils/attendanceImport'
import {
  analyzeMonthlyAttendanceSheets,
  extractMonthlyAttendanceMatrix,
  SUPPORTED_ATTENDANCE_IMPORT_MODE
} from '../utils/monthlyAttendanceMatrix'
import { analyzeAttendanceDetailSheets } from '../utils/attendanceDetailList'
import {
  applyCalculatedAttendanceTiming,
  calculateAttendanceTiming,
  formatAttendanceTime,
  resolveAttendanceShift
} from '../utils/attendanceShift'
import {
  calculateAttendanceMetrics,
  STANDARD_WORK_MINUTES
} from '../utils/attendanceCalculations'
import { getCompanyIdForUser } from '../utils/companyContext'

const { read, utils, writeFile } = XLSX

const MANUAL_MAPPING_FIELDS = [
  ['code', 'Mã nhân viên / mã máy', 'Mã NV'],
  ['name', 'Họ và tên', 'Họ tên'],
  ['department', 'Bộ phận', 'Bộ phận'],
  ['position', 'Chức vụ', 'Chức vụ'],
  ['date', 'Ngày chấm công', 'Ngày'],
  ['checkIn', 'Giờ vào', 'Giờ vào'],
  ['checkOut', 'Giờ ra', 'Giờ ra'],
  ['eventTime', 'Thời gian chấm (mỗi dòng một lần)', 'Thời gian chấm'],
  ['workdays', 'Công', 'Công'],
  ['hours', 'Giờ làm', 'Giờ'],
  ['extraWorkdays', 'Công+', 'Công+'],
  ['extraHours', 'Giờ+', 'Giờ+'],
  ['shift', 'Ca làm', 'Ca làm'],
  ['symbol', 'Ký hiệu', 'Ký hiệu'],
  ['extraSymbol', 'Ký hiệu+', 'Ký hiệu+'],
  ['totalHours', 'Tổng giờ', 'Tổng giờ'],
  ['lateMinutes', 'Vào trễ (phút)', 'Vào trễ'],
  ['earlyMinutes', 'Ra sớm (phút)', 'Ra sớm'],
  ['overtime1', 'TC1', 'TC1'],
  ['overtime2', 'TC2', 'TC2'],
  ['overtime3', 'TC3', 'TC3']
]

const excelColumnName = index => {
  let value = Number(index) + 1
  let label = ''
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}

function AttendanceImportModal({
  employees,
  attendanceLogs = [],
  employeeMappings = {},
  importMappingTemplates = {},
  attendanceSettings = {},
  isOpen,
  onClose,
  onSave,
  companyId,
  companyName
}) {
  const { user } = useAuth()
  const activeCompanyId = companyId || getCompanyIdForUser(user)
  const [file, setFile] = useState(null)
  const [referenceImage, setReferenceImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [showAllMatches, setShowAllMatches] = useState(false)
  const [showDailyPreview, setShowDailyPreview] = useState(false)
  const [visibleLogCount, setVisibleLogCount] = useState(30)
  const [manualMapping, setManualMapping] = useState(null)
  const [monthlySheetSelection, setMonthlySheetSelection] = useState(null)
  const [importMonth, setImportMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [calculationPreference, setCalculationPreference] = useState('source')
  const [matrixValuePreference, setMatrixValuePreference] = useState('auto')
  const [matchBranch, setMatchBranch] = useState('')
  const importInProgressRef = useRef(false)
  const canCreateEmployees = String(user?.role || '').toLowerCase() === 'admin'

  const availableBranches = useMemo(
    () => Array.from(new Set(
      employees
        .map(employee => String(employee.chi_nhanh || employee.branch || '').trim())
        .filter(Boolean)
    )).sort((left, right) => left.localeCompare(right, 'vi')),
    [employees]
  )

  const employeesById = useMemo(
    () => new Map(
      scopeAttendanceEmployeesByCompany(employees, activeCompanyId)
        .map(employee => [String(employee.id), employee])
    ),
    [employees, activeCompanyId]
  )

  const companyScopedEmployees = useMemo(
    () => scopeAttendanceEmployeesByCompany(employees, activeCompanyId),
    [employees, activeCompanyId]
  )

  const employeesForMatching = useMemo(() => {
    const normalizedBranch = normalizeEmployeeIdentity(matchBranch)
    const isInPreferredBranch = employee =>
      Boolean(normalizedBranch) &&
      normalizeEmployeeIdentity(employee.chi_nhanh || employee.branch || '') ===
        normalizedBranch

    return companyScopedEmployees
      .slice()
      .sort((left, right) => {
        const branchOrder = Number(isInPreferredBranch(right)) -
          Number(isInPreferredBranch(left))
        if (branchOrder) return branchOrder
        return String(left.ho_va_ten || left.name || '').localeCompare(
          String(right.ho_va_ten || right.name || ''),
          'vi'
        )
      })
  }, [companyScopedEmployees, matchBranch])

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setPreviewData(null)
    setShowAllMatches(false)
    setShowDailyPreview(false)
    setVisibleLogCount(30)
    setManualMapping(null)
    setMonthlySheetSelection(null)
  }

  const parseTime = parseAttendanceTime

  const calculateStats = (timeStrs, employee = {}, log = {}) => {
    if (!timeStrs || timeStrs.length === 0) return null

    const parsed = timeStrs
      .map(t => (typeof t === 'object' && t?.str ? t : parseTime(t)))
      .filter(Boolean)

    if (parsed.length === 0) return null

    // Giữ thứ tự punch từ máy: ca đêm có thể có Vào 22:00 rồi Ra 06:00,
    // không được sort theo đồng hồ vì sẽ đảo ngược ca.
    const checkInStr = parsed[0].str
    const checkOutStr = parsed.length > 1 ? parsed[parsed.length - 1].str : null
    const inTime = parsed[0]
    const outTime = parsed.length > 1 ? parsed[parsed.length - 1] : null

    if (!outTime || parsed.length === 1) {
      return {
        checkIn: checkInStr,
        checkOut: null,
        hours: 0,
        status: 'Thiếu ra',
        lateMinutes: 0,
        earlyMinutes: 0,
        punches: parsed.map(p => p.str)
      }
    }

    const shift = resolveAttendanceShift(employee, log, attendanceSettings)
    const [startHour, startMinute] = shift.start.split(':').map(Number)
    const [endHour, endMinute] = shift.end.split(':').map(Number)
    const STANDARD_START = startHour * 60 + startMinute
    const STANDARD_END = endHour * 60 + endMinute
    const metrics = calculateAttendanceMetrics({
      checkIn: checkInStr,
      checkOut: checkOutStr,
      standardMinutes: Number(attendanceSettings.standardWorkMinutes) || STANDARD_WORK_MINUTES,
      // Ca chia buổi tự loại khoảng giữa hai buổi theo mốc đã cấu hình.
      breakMinutes: Number(attendanceSettings.unpaidBreakMinutes) || 0,
      autoCalculateOvertime: false,
      splitShift: shift?.splitShift
    })
    const hours = metrics.hours

    const isLate = inTime.h * 60 + inTime.m > STANDARD_START
    const isEarly = outTime.h * 60 + outTime.m < STANDARD_END
    let lateMinutes = isLate ? Math.max(0, inTime.h * 60 + inTime.m - STANDARD_START) : 0
    let earlyMinutes = isEarly ? Math.max(0, STANDARD_END - (outTime.h * 60 + outTime.m)) : 0

    let status = 'Đủ'
    const notes = []
    if (isLate) notes.push(`Muộn ${lateMinutes}p`)
    if (isEarly) notes.push(`Sớm ${earlyMinutes}p`)
    if (notes.length > 0) status = notes.join(' & ')
    if (hours <= 0) status = 'Vắng/Nghỉ'

    return {
      checkIn: checkInStr,
      checkOut: checkOutStr,
      hours,
      regularWorkdays: metrics.regularWorkdays,
      overtimeHours: 0,
      status,
      lateMinutes,
      earlyMinutes,
      punches: parsed.map(p => p.str)
    }
  }

  const findEmployee = (code, name) => {
    return matchAttendanceEmployee(code, name, companyScopedEmployees, matchBranch).employee
  }

  const buildFallbackEmployee = (code, name, rowIndex = 0, options = {}) => {
    const codeStr = String(code || '').trim()
    const nameStr = String(name || '').trim()
    const fallbackCode = codeStr || `ROW${rowIndex + 1}`
    const fallbackName = nameStr || `NV ${fallbackCode}`
    const sourceKey = buildSourceEmployeeKey(fallbackCode, fallbackName)
    const profileCode = options.allowGeneratedCode === false ? codeStr : fallbackCode
    return {
      id: `external:${sourceKey}`,
      employeeId: profileCode,
      username: profileCode,
      ho_va_ten: fallbackName,
      name: fallbackName,
      bo_phan: '',
      vi_tri: ''
    }
  }

  const attachSourceIdentity = (employee, code, name) => ({
    ...employee,
    _sourceEmployeeCode: String(code || '').trim(),
    _sourceEmployeeName: String(name || '').replace(/\s+/g, ' ').trim()
  })

  const attachMatchedEmployee = (log, employee) => {
    const matched = applyEmployeeToAttendanceLog(log, employee)
    if (['source-value', 'matrix-value'].includes(log.calculationMode)) return matched

    const timed = applyCalculatedAttendanceTiming(matched, employee, attendanceSettings)
    if (log.importFormat !== 'attendance-detail-list') return timed

    const checkIn = formatAttendanceTime(timed.vao || timed.checkIn)
    const checkOut = formatAttendanceTime(timed.ra || timed.checkOut)
    if (!checkIn || !checkOut) return timed

    const shift = resolveAttendanceShift(employee, timed, attendanceSettings)
    const metrics = calculateAttendanceMetrics({
      log: timed,
      checkIn,
      checkOut,
      standardMinutes: Number(attendanceSettings.standardWorkMinutes) || STANDARD_WORK_MINUTES,
      breakMinutes: Number(attendanceSettings.unpaidBreakMinutes) || 0,
      autoCalculateOvertime: false,
      punchPairs: timed.punchPairs,
      splitShift: shift?.splitShift
    })
    const hours = metrics.hours
    return {
      ...timed,
      cong: metrics.regularWorkdays,
      hours,
      gio: hours,
      tongGio: hours + (Number(timed.gioPlus) || 0),
      workedMinutes: metrics.workedMinutes,
      regularMinutes: metrics.regularMinutes,
      overtimeMinutes: metrics.overtimeMinutes
    }
  }

  const parseDateValue = (value, options = {}) => parseAttendanceDate(value, options)

  const buildLog = (sysEmp, dateStr, stats, extra = {}) => {
    const baseDate = new Date(`${dateStr}T00:00:00`)
    const checkInStr = stats.checkIn || extra.vao || ''
    const checkOutStr = stats.checkOut || extra.ra || ''

    let checkInDate = null
    if (checkInStr) {
      const [inH, inM] = String(checkInStr).split(':')
      checkInDate = new Date(baseDate)
      checkInDate.setHours(Number(inH), Number(inM) || 0, 0, 0)
    }

    let checkOutDate = null
    if (checkOutStr) {
      const [outH, outM] = String(checkOutStr).split(':')
      checkOutDate = new Date(baseDate)
      checkOutDate.setHours(Number(outH), Number(outM) || 0, 0, 0)
    }

    const calculationMode = extra.calculationMode || 'punches'
    const useSourceValues = calculationMode === 'source-value' || calculationMode === 'matrix-value'
    const hasActualPunchPair = Boolean(checkInStr && checkOutStr && !extra.syntheticPunch)
    const resolvedShift = resolveAttendanceShift(sysEmp, extra, attendanceSettings)
    const punchPairs = stats.punchPairs || extra.punchPairs || []
    const metrics = calculateAttendanceMetrics({
      log: extra,
      checkIn: checkInStr,
      checkOut: checkOutStr,
      standardMinutes: Number(attendanceSettings.standardWorkMinutes) || STANDARD_WORK_MINUTES,
      breakMinutes: Number(attendanceSettings.unpaidBreakMinutes) || 0,
      autoCalculateOvertime: false,
      punchPairs,
      splitShift: resolvedShift?.splitShift,
      fallbackHours: Number(extra.hours ?? stats.hours ?? 0) || 0,
      fallbackWorkdays: extra.cong ?? stats.regularWorkdays
    })
    const hours = hasActualPunchPair && !useSourceValues
      ? metrics.hours
      : Number(extra.hours ?? stats.hours ?? 0) || 0
    const gioPlus = Number(extra.gioPlus ?? 0) || 0
    const timing = calculateAttendanceTiming({
      employee: sysEmp,
      log: extra,
      checkIn: checkInStr,
      checkOut: checkOutStr,
      attendanceSettings
    })
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

    return {
      employeeId: sysEmp.id,
      employeeCode:
        extra.employeeCode ||
        sysEmp._sourceEmployeeCode ||
        sysEmp.employeeId ||
        sysEmp.username ||
        '',
      employeeName:
        extra.employeeName ||
        sysEmp._sourceEmployeeName ||
        sysEmp.ho_va_ten ||
        sysEmp.name ||
        '',
      sourceEmployeeCode:
        sysEmp._sourceEmployeeCode ||
        extra.employeeCode ||
        sysEmp.employeeId ||
        '',
      sourceEmployeeName:
        sysEmp._sourceEmployeeName ||
        extra.employeeName ||
        sysEmp.ho_va_ten ||
        sysEmp.name ||
        '',
      machineName:
        extra.machineName ||
        sysEmp._sourceEmployeeName ||
        extra.employeeName ||
        sysEmp.ho_va_ten ||
        sysEmp.name ||
        '',
      tenTheoMayChamCong:
        extra.machineName ||
        sysEmp._sourceEmployeeName ||
        extra.employeeName ||
        sysEmp.ho_va_ten ||
        sysEmp.name ||
        '',
      department: extra.department || sysEmp.bo_phan || '',
      sourceDepartment: extra.department || '',
      monthlyDepartment: extra.importFormat === 'attendance-monthly-matrix'
        ? extra.department || ''
        : '',
      position: extra.position || sysEmp.vi_tri || '',
      employmentType: extra.employmentType || '',
      employeeStatus: extra.employeeStatus || '',
      sourceTotalWork: extra.sourceTotalWork ?? null,
      rawAttendanceValue: extra.rawAttendanceValue ?? extra.sourceSymbol ?? '',
      date: dateStr,
      dayOfWeek: extra.dayOfWeek || dayNames[baseDate.getDay()] || '',
      timestamp: baseDate.getTime(),
      checkIn: checkInDate ? checkInDate.toISOString() : null,
      checkOut: checkOutDate ? checkOutDate.toISOString() : null,
      vao: checkInStr,
      ra: checkOutStr,
      // Có punch thật thì luôn dùng phút thực tế; cong Excel cũ chỉ giữ cho
      // các dòng mã công không có giờ vào/ra.
      cong: Number(hasActualPunchPair && !useSourceValues
        ? metrics.regularWorkdays
        : (extra.cong ?? stats.regularWorkdays ?? (hours >= 8 ? 1 : hours > 0 ? 0.5 : 0))) || 0,
      hours,
      gio: hours,
      congPlus: Number(extra.congPlus ?? 0) || 0,
      gioPlus,
      lateMinutes: extra.lateMinutes ?? timing.lateMinutes ?? 0,
      earlyMinutes: extra.earlyMinutes ?? timing.earlyMinutes ?? 0,
      vaoTre: extra.lateMinutes ?? timing.lateMinutes ?? 0,
      raSom: extra.earlyMinutes ?? timing.earlyMinutes ?? 0,
      tc1: Number(extra.tc1 ?? 0) || 0,
      tc2: Number(extra.tc2 ?? 0) || 0,
      tc3: Number(extra.tc3 ?? 0) || 0,
      shiftName: extra.shiftName || '',
      tenCa: extra.shiftName || '',
      kyHieu: extra.kyHieu || stats.status || '',
      kyHieuPlus: extra.kyHieuPlus || '',
      tongGio: extra.tongGio ?? (hours + gioPlus),
      status: extra.kyHieu || stats.status || '',
      sourceWorkdays: Object.hasOwn(extra, 'sourceWorkdays')
        ? extra.sourceWorkdays
        : (extra.cong ?? null),
      sourceHours: Object.hasOwn(extra, 'sourceHours')
        ? extra.sourceHours
        : (extra.hours ?? null),
      sourceTotalHours: Object.hasOwn(extra, 'sourceTotalHours')
        ? extra.sourceTotalHours
        : (extra.tongGio ?? null),
      sourceSymbol: extra.sourceSymbol ?? extra.kyHieu ?? '',
      derivedHours: Boolean(extra.derivedHours),
      calculationMode,
      ...(extra.importFormat ? { importFormat: extra.importFormat } : {}),
      sourceValues: extra.sourceValues || {
        workdays: extra.sourceWorkdays ?? extra.cong ?? null,
        hours: extra.sourceHours ?? extra.hours ?? null,
        totalHours: extra.sourceTotalHours ?? extra.tongGio ?? null,
        lateMinutes: extra.lateMinutes ?? null,
        earlyMinutes: extra.earlyMinutes ?? null,
        overtime1: extra.tc1 ?? null,
        overtime2: extra.tc2 ?? null,
        overtime3: extra.tc3 ?? null,
        symbol: extra.sourceSymbol ?? extra.kyHieu ?? ''
      },
      provenance: extra.provenance || {},
      workedMinutes: metrics.workedMinutes,
      regularMinutes: metrics.regularMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      overtimeAutoDisabled: extra.overtimeAutoDisabled ?? true,
      syntheticPunch: Boolean(extra.syntheticPunch),
      punches: stats.punches || [],
      punchPairs
    }
  }

  /** Format đầy đủ theo bảng chấm công công ty */
  const processFullAttendanceFormat = (jsonData, headers, headerRowIdx, parserOptions = {}) => {
    const columns = mapAttendanceColumns(headers)
    const codeIdx = columns.code
    const nameIdx = columns.name
    const machineNameIdx = columns.machineName
    const deptIdx = columns.department
    const posIdx = columns.position
    const dateIdx = columns.date
    const thuIdx = columns.weekday
    const punchColumns = findAttendancePunchColumns(headers)
    const congIdx = columns.workdays
    const gioIdx = columns.hours
    const congPlusIdx = columns.extraWorkdays
    const gioPlusIdx = columns.extraHours
    const tc1Idx = columns.overtime1
    const tc2Idx = columns.overtime2
    const tc3Idx = columns.overtime3
    const caIdx = columns.shift
    const kyIdx = columns.symbol
    const kyPlusIdx = columns.extraSymbol
    const tongIdx = columns.totalHours
    const lateIdx = columns.lateMinutes
    const earlyIdx = columns.earlyMinutes

    const logs = []
    const skipped = []
    let rowsWithoutPunches = 0
    const num = (value, fallback = 0) => parseAttendanceDecimal(value) ?? fallback

    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      const empCode = codeIdx >= 0 ? row[codeIdx] : ''
      const empName = nameIdx >= 0 ? row[nameIdx] : ''
      const machineName = machineNameIdx >= 0 ? row[machineNameIdx] : ''
      const dateRaw = dateIdx >= 0 ? row[dateIdx] : ''
      if ((!empCode && !empName) || (dateRaw === '' || dateRaw == null)) continue

      const sysEmp = attachSourceIdentity(
        (parserOptions.deterministicDetail ? null : findEmployee(empCode, empName)) || buildFallbackEmployee(empCode, empName, i),
        empCode,
        empName
      )

      const dateStr = parseDateValue(dateRaw, parserOptions)
      if (!dateStr) {
        skipped.push(`${excelColumnName(dateIdx)}${i + 1}: ngày không hợp lệ (${dateRaw})`)
        continue
      }

      const rowContext = {
        department: deptIdx >= 0 ? String(row[deptIdx] || '') : '',
        position: posIdx >= 0 ? String(row[posIdx] || '') : '',
        shiftName: caIdx >= 0 ? String(row[caIdx] || '') : ''
      }

      const { checkIn: vao, checkOut: ra, punches, punchPairs } =
        collectAttendancePunches(row, punchColumns, parseTime)
      if (parserOptions.deterministicDetail && !vao && !ra) {
        rowsWithoutPunches += 1
      }
      const statsContext = parserOptions.deterministicDetail
        ? { department: rowContext.department, position: rowContext.position }
        : rowContext
      let stats
      if (vao && ra) {
        stats = { ...calculateStats([vao, ra], sysEmp, statsContext), punches, punchPairs }
      } else if (vao) {
        stats = { ...calculateStats([vao], sysEmp, statsContext), punches, punchPairs }
      } else if (ra) {
        stats = {
          checkIn: null,
          checkOut: ra,
          hours: 0,
          status: 'Thiếu vào',
          lateMinutes: 0,
          earlyMinutes: 0,
          punches,
          punchPairs
        }
      } else if (parserOptions.deterministicDetail) {
        stats = {
          checkIn: null,
          checkOut: null,
          hours: 0,
          regularWorkdays: 0,
          status: '',
          lateMinutes: 0,
          earlyMinutes: 0,
          punches: [],
          punchPairs: []
        }
      } else {
        stats = {
          checkIn: null,
          checkOut: null,
          hours: gioIdx >= 0
            ? num(row[gioIdx])
            : (tongIdx >= 0 ? num(row[tongIdx]) - (gioPlusIdx >= 0 ? num(row[gioPlusIdx]) : 0) : 0),
          status: kyIdx >= 0 ? String(row[kyIdx] || '') : 'Đủ',
          lateMinutes: 0,
          earlyMinutes: 0,
          punches: [],
          punchPairs: []
        }
      }

      if (parserOptions.deterministicDetail) {
        // File chi tiết chỉ cung cấp lần chấm giờ. Công, Giờ, Muộn, TC và
        // ký hiệu trong Excel là kết quả tính theo quy tắc của bên xuất file.
        logs.push(buildLog(sysEmp, dateStr, stats, {
          employeeCode: String(empCode || sysEmp.employeeId || ''),
          employeeName: String(empName || sysEmp.ho_va_ten || ''),
          machineName: String(machineName || empName || sysEmp.ho_va_ten || ''),
          department: rowContext.department,
          position: rowContext.position,
          dayOfWeek: thuIdx >= 0 ? String(row[thuIdx] || '') : '',
          vao,
          ra,
          importFormat: 'attendance-detail-list',
          calculationMode: 'punches',
          overtimeAutoDisabled: false,
          provenance: { row: i + 1 }
        }))
        continue
      }

      logs.push(buildLog(sysEmp, dateStr, stats, {
        employeeCode: String(empCode || sysEmp.employeeId || ''),
        employeeName: String(empName || sysEmp.ho_va_ten || ''),
        machineName: String(machineName || empName || sysEmp.ho_va_ten || ''),
        department: rowContext.department,
        position: rowContext.position,
        dayOfWeek: thuIdx >= 0 ? String(row[thuIdx] || '') : '',
        vao,
        ra,
        cong: congIdx >= 0 ? num(row[congIdx]) : undefined,
        hours: gioIdx >= 0 ? num(row[gioIdx]) : undefined,
        congPlus: congPlusIdx >= 0 ? num(row[congPlusIdx]) : 0,
        gioPlus: gioPlusIdx >= 0 ? num(row[gioPlusIdx]) : 0,
        tc1: tc1Idx >= 0 ? num(row[tc1Idx]) : 0,
        tc2: tc2Idx >= 0 ? num(row[tc2Idx]) : 0,
        tc3: tc3Idx >= 0 ? num(row[tc3Idx]) : 0,
        shiftName: rowContext.shiftName,
        kyHieu: kyIdx >= 0 ? String(row[kyIdx] || '') : '',
        kyHieuPlus: kyPlusIdx >= 0 ? String(row[kyPlusIdx] || '') : '',
        tongGio: tongIdx >= 0 ? num(row[tongIdx]) : undefined,
        lateMinutes: lateIdx >= 0 ? num(row[lateIdx]) : undefined,
        earlyMinutes: earlyIdx >= 0 ? num(row[earlyIdx]) : undefined,
        sourceWorkdays: congIdx >= 0 ? num(row[congIdx]) : null,
        rawAttendanceValue: congIdx >= 0 ? row[congIdx] : '',
        sourceHours: gioIdx >= 0 ? num(row[gioIdx]) : null,
        sourceTotalHours: tongIdx >= 0 ? num(row[tongIdx]) : null,
        sourceSymbol: kyIdx >= 0 ? String(row[kyIdx] || '') : '',
        calculationMode: calculationPreference === 'source' && (
          congIdx >= 0 || gioIdx >= 0 || tongIdx >= 0
        ) ? 'source-value' : (vao || ra ? 'punches' : 'source-value'),
        provenance: { row: i + 1 },
        sourceValues: {
          workdays: congIdx >= 0 ? row[congIdx] : null,
          hours: gioIdx >= 0 ? row[gioIdx] : null,
          totalHours: tongIdx >= 0 ? row[tongIdx] : null,
          lateMinutes: lateIdx >= 0 ? row[lateIdx] : null,
          earlyMinutes: earlyIdx >= 0 ? row[earlyIdx] : null,
          overtime1: tc1Idx >= 0 ? row[tc1Idx] : null,
          overtime2: tc2Idx >= 0 ? row[tc2Idx] : null,
          overtime3: tc3Idx >= 0 ? row[tc3Idx] : null,
          symbol: kyIdx >= 0 ? row[kyIdx] : ''
        }
      }))
    }

    return {
      logs,
      skipped,
      warnings: rowsWithoutPunches > 0
        ? [`Có ${rowsWithoutPunches} dòng không có giờ vào/ra: tính 0 công, 0 giờ; không lấy Công/Giờ từ Excel để thay thế.`]
        : []
    }
  }

  /** Format mới: Mã NV | Tên NV | Phòng ban | Ngày | Lần 1 ... Lần 7 */
  const processPunchLogFormat = (jsonData, headers, headerRowIdx, parserOptions = {}) => {
    const columns = mapAttendanceColumns(headers)
    const codeIdx = columns.code
    const nameIdx = columns.name
    const dateIdx = columns.date

    const lanIndexes = []
    headers.forEach((h, idx) => {
      const normalized = normalizeAttendanceHeader(h)
      if (
        /^(?:lan|cham|punch|scan|time)\s*\d+$/i.test(normalized) ||
        /^(?:vao|ra|check in|check out|checkin|checkout|time in|time out)\s*\d*$/i.test(normalized)
      ) {
        lanIndexes.push(idx)
      }
    })

    // Fallback theo dữ liệu: chỉ lấy cột mà phần lớn giá trị thực sự là giờ.
    // Không lấy mọi cột sau Ngày vì file SpeeGo còn có Công, Tổng giờ, TC...
    if (lanIndexes.length === 0 && dateIdx >= 0) {
      for (let i = dateIdx + 1; i < headers.length; i++) {
        const samples = jsonData
          .slice(headerRowIdx + 1, headerRowIdx + 101)
          .map(row => row?.[i])
          .filter(value => value !== '' && value !== null && value !== undefined)
        if (!samples.length) continue
        const timeCount = samples.filter(value => parseTime(value)).length
        if (timeCount >= 2 && timeCount / samples.length >= 0.5) lanIndexes.push(i)
      }
    }

    const logs = []
    const skipped = []

    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || row.length === 0) continue

      const empCode = codeIdx >= 0 ? row[codeIdx] : ''
      const empName = nameIdx >= 0 ? row[nameIdx] : ''
      const dateRaw = dateIdx >= 0 ? row[dateIdx] : ''

      if (!empCode && !empName) continue
      if (!dateRaw && dateRaw !== 0) continue

      const times = []
      lanIndexes.forEach(idx => {
        const parsed = parseTime(row[idx])
        if (parsed) times.push(parsed.str)
      })

      // Row without any punch times = skip (not absent day unless needed)
      if (times.length === 0) continue

      const dateStr = parseDateValue(dateRaw, parserOptions)
      if (!dateStr) {
        skipped.push(`Dòng ${i + 1}: ngày không hợp lệ (${dateRaw})`)
        continue
      }

      const sysEmp = attachSourceIdentity(
        findEmployee(empCode, empName) || buildFallbackEmployee(empCode, empName, i),
        empCode,
        empName
      )

      const stats = calculateStats(times, sysEmp)
      if (stats) {
        logs.push(buildLog(sysEmp, dateStr, stats, {
          employeeCode: String(empCode || sysEmp.employeeId || ''),
          employeeName: String(empName || sysEmp.ho_va_ten || ''),
          machineName: String(empName || sysEmp.ho_va_ten || ''),
          provenance: { row: i + 1 }
        }))
      }
    }

    return { logs, skipped }
  }

  const processMatrixFormat = (jsonData, optionsOrHeaders, headerRowIdx, yearArg, monthArg) => {
    let dateCols = []
    let nameColIdx = -1
    let codeColIdx = -1
    let posColIdx = -1
    let deptColIdx = -1
    let shiftColIdx = -1
    let employmentTypeColIdx = -1
    let employeeStatusColIdx = -1
    let totalWorkColIdx = -1
    let dataStartRow = 0
    let employeeRowIndexes = null
    let worksheet = null
    let matrixValueMode = 'workdays'
    let isMonthlyMatrix = false
    let year = yearArg
    let month = monthArg

    if (optionsOrHeaders && typeof optionsOrHeaders === 'object' && !Array.isArray(optionsOrHeaders)) {
      dateCols = optionsOrHeaders.matrixDayCols || []
      nameColIdx = optionsOrHeaders.nameColIdx ?? -1
      codeColIdx = optionsOrHeaders.codeColIdx ?? -1
      posColIdx = optionsOrHeaders.posColIdx ?? -1
      deptColIdx = optionsOrHeaders.deptColIdx ?? -1
      shiftColIdx = optionsOrHeaders.shiftColIdx ?? -1
      employmentTypeColIdx = optionsOrHeaders.employmentTypeColIdx ?? -1
      employeeStatusColIdx = optionsOrHeaders.employeeStatusColIdx ?? -1
      totalWorkColIdx = optionsOrHeaders.totalWorkColIdx ?? -1
      dataStartRow = optionsOrHeaders.dataStartRow ?? (headerRowIdx + 1)
      employeeRowIndexes = Array.isArray(optionsOrHeaders.employeeRowIndexes)
        ? optionsOrHeaders.employeeRowIndexes
        : null
      worksheet = optionsOrHeaders.worksheet || null
      matrixValueMode = optionsOrHeaders.matrixValueMode === 'hours' ? 'hours' : 'workdays'
      isMonthlyMatrix = Boolean(optionsOrHeaders.isMonthlyMatrix)
      year = optionsOrHeaders.year ?? yearArg
      month = optionsOrHeaders.month ?? monthArg
    } else {
      const headers = optionsOrHeaders || []
      nameColIdx = headers.findIndex(h =>
        String(h).includes('họ tên') || String(h).includes('tên') || String(h).includes('name')
      )
      codeColIdx = headers.findIndex(h =>
        String(h).includes('mã') || String(h).includes('code')
      )
      headers.forEach((h, idx) => {
        const valStr = String(h).trim()
        if (valStr && /^\d{1,2}$/.test(valStr)) {
          const val = Number(valStr)
          if (val >= 1 && val <= 31) dateCols.push({ day: val, idx })
        }
      })
      dataStartRow = (headerRowIdx >= 0 ? headerRowIdx : 0) + 1
      if (dataStartRow < jsonData.length) {
        const nextRow = jsonData[dataStartRow] || []
        const weekdayCount = nextRow.filter(c => /^(t[2-7]|cn|thứ\s*[2-7]|chủ\s*nhật)$/i.test(String(c || '').trim())).length
        if (weekdayCount >= 3) dataStartRow++
      }
    }

    if (!year || !month) {
      const [y, m] = importMonth.split('-').map(Number)
      year = year || y
      month = month || m
    }

    const isHourMode = matrixValueMode === 'hours'

    const mergedData = {}
    const skipped = []
    const warnings = []
    const rowTotals = new Map()
    let expectedAttendanceCount = 0
    const rowsToProcess = employeeRowIndexes ||
      Array.from({ length: Math.max(0, jsonData.length - dataStartRow) }, (_, index) => dataStartRow + index)

    for (const r of rowsToProcess) {
      const row = jsonData[r]
      if (!row || row.length === 0) continue

      const empName = nameColIdx >= 0 ? String(row[nameColIdx] ?? '').trim() : ''
      const empCode = codeColIdx >= 0 ? String(row[codeColIdx] ?? '').trim() : ''
      const empPos = posColIdx >= 0 ? String(row[posColIdx] ?? '').trim() : ''
      const empDept = deptColIdx >= 0 ? String(row[deptColIdx] ?? '').trim() : ''
      const empShift = shiftColIdx >= 0 ? String(row[shiftColIdx] ?? '').trim() : ''
      const employmentType = employmentTypeColIdx >= 0
        ? String(row[employmentTypeColIdx] ?? '').trim()
        : ''
      const employeeStatus = employeeStatusColIdx >= 0
        ? String(row[employeeStatusColIdx] ?? '').trim()
        : ''
      const sourceTotalWork = totalWorkColIdx >= 0 ? row[totalWorkColIdx] : ''

      if (!empName && !empCode) continue

      const lowerName = empName.toLowerCase()
      if (!isMonthlyMatrix && (lowerName.startsWith('tổng') || lowerName.startsWith('cộng') || lowerName.startsWith('bình quân'))) continue

      if (isMonthlyMatrix && !empDept) warnings.push(`Dòng ${r + 1}: thiếu Bộ phận.`)
      if (isMonthlyMatrix && !empShift) warnings.push(`Dòng ${r + 1}: thiếu Ca làm.`)

      // Keep source rows distinct until the preview performs identity matching.
      const matchedEmployee = isMonthlyMatrix
        ? null
        : findEmployee(empCode, empName)
      const currentSysEmp = attachSourceIdentity(
        matchedEmployee || buildFallbackEmployee(
          empCode,
          empName,
          r,
          { allowGeneratedCode: !isMonthlyMatrix }
        ),
        empCode,
        empName
      )

      rowTotals.set(r, {
        employeeName: empName,
        sourceTotal: parseAttendanceDecimal(sourceTotalWork),
        computedTotal: 0,
        comparable: true
      })

      dateCols.forEach(({ day, idx, month: columnMonth, year: columnYear }) => {
        const cellContent = row[idx]
        if (cellContent === undefined || cellContent === null || String(cellContent).trim() === '') return
        expectedAttendanceCount += 1

        const cellStr = String(cellContent).trim()
        const address = utils.encode_cell({ r, c: idx })
        const parsedCell = classifyMatrixAttendanceCell(cellContent, {
          mode: isHourMode ? 'hours' : 'workdays',
          sourceFormat: isMonthlyMatrix ? 'monthly-attendance' : '',
          numberFormat: worksheet?.[address]?.z || '',
          standardMinutes: Number(attendanceSettings.standardWorkMinutes) || STANDARD_WORK_MINUTES
        })
        if (!parsedCell || parsedCell.kind === 'unknown') {
          skipped.push(`${address}: không hiểu giá trị “${cellStr}”`)
          rowTotals.get(r).comparable = false
          return
        }

        if (parsedCell.kind === 'value') {
          rowTotals.get(r).computedTotal += Number(parsedCell.workdays) || 0
        } else {
          rowTotals.get(r).comparable = false
        }

        const resolvedYear = columnYear || year
        const resolvedMonth = columnMonth || month
        const key = `${isMonthlyMatrix ? `row-${r}` : currentSysEmp.id}_${resolvedYear}_${resolvedMonth}_${day}`

        if (parsedCell.kind === 'punch') {
          if (!mergedData[key]) {
            mergedData[key] = {
              emp: currentSysEmp, day, year: resolvedYear, month: resolvedMonth,
              times: [], rawVal: cellStr, rawValue: cellContent, sourceCell: address,
              sourceRow: r + 1, pos: empPos, dept: empDept, shift: empShift,
              employmentType, employeeStatus, sourceTotalWork
            }
          }
          mergedData[key].times.push(...parsedCell.times)
        } else {
          if (!mergedData[key]) {
            mergedData[key] = {
              emp: currentSysEmp,
              day,
              year: resolvedYear,
              month: resolvedMonth,
              times: [],
              rawVal: cellStr,
              sourceCell: address,
              directCong: parsedCell.workdays,
              directHours: parsedCell.hours,
              directStatus: parsedCell.status,
              directSymbol: parsedCell.symbol,
              isCodeOnly: true,
              rawValue: cellContent,
              sourceRow: r + 1,
              pos: empPos,
              dept: empDept,
              shift: empShift,
              employmentType,
              employeeStatus,
              sourceTotalWork
            }
          }
        }
      })
    }

    rowTotals.forEach(item => {
      if (
        item.comparable &&
        item.sourceTotal !== null &&
        Math.abs(item.sourceTotal - item.computedTotal) > 0.01
      ) {
        warnings.push(
          `${item.employeeName}: Tổng công trong file (${item.sourceTotal}) lệch tổng dữ liệu ngày (${Math.round(item.computedTotal * 100) / 100}).`
        )
      }
    })

    const logs = []
    Object.values(mergedData).forEach(item => {
      const { emp, day, times } = item

      const itemYear = item.year || year
      const itemMonth = item.month || month
      const dateObj = new Date(itemYear, itemMonth - 1, day)
      if (dateObj.getFullYear() !== itemYear || dateObj.getMonth() !== itemMonth - 1 || dateObj.getDate() !== day) {
        skipped.push(`${item.sourceCell || 'ô ma trận'}: ngày ${day}/${itemMonth}/${itemYear} không hợp lệ`)
        return
      }
      const dateStr = `${itemYear}-${String(itemMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      if (item.isCodeOnly) {
        const directStats = {
          checkIn: '',
          checkOut: '',
          hours: item.directHours,
          cong: item.directCong,
          status: item.directStatus || item.rawVal,
          kyHieu: item.rawVal,
          lateMinutes: 0,
          earlyMinutes: 0
        }
        logs.push(buildLog(emp, dateStr, directStats, {
          cong: item.directCong,
          hours: item.directHours,
          position: item.pos,
          department: item.dept,
          shiftName: item.shift,
          employmentType: item.employmentType,
          employeeStatus: item.employeeStatus,
          sourceTotalWork: item.sourceTotalWork,
          rawAttendanceValue: item.rawValue,
          kyHieu: item.directSymbol || item.rawVal,
          sourceWorkdays: isHourMode ? null : item.directCong,
          sourceHours: isHourMode ? item.directHours : null,
          sourceSymbol: item.directSymbol || item.rawVal,
          derivedHours: !isHourMode,
          calculationMode: 'matrix-value',
          importFormat: 'attendance-monthly-matrix',
          sourceValues: {
            workdays: isHourMode ? null : item.rawVal,
            hours: isHourMode ? item.rawVal : null,
            symbol: item.directSymbol || item.rawVal
          },
          provenance: { valueCell: item.sourceCell || '', row: item.sourceRow },
          sourceEmployeeCode: emp._sourceEmployeeCode || emp.employeeCode,
          sourceEmployeeName: emp._sourceEmployeeName || emp.employeeName,
          syntheticPunch: true
        }))
        return
      }

      if (!times || times.length === 0) return
      const stats = calculateStats(times, emp)
      if (!stats) return

      logs.push(buildLog(emp, dateStr, stats, {
        position: item.pos,
        department: item.dept,
        shiftName: item.shift,
        employmentType: item.employmentType,
        employeeStatus: item.employeeStatus,
        sourceTotalWork: item.sourceTotalWork,
        rawAttendanceValue: item.rawValue,
        sourceEmployeeCode: emp._sourceEmployeeCode || emp.employeeCode,
        sourceEmployeeName: emp._sourceEmployeeName || emp.employeeName,
        importFormat: 'attendance-monthly-matrix'
      }))
    })

    return {
      logs,
      skipped,
      warnings,
      expectedAttendanceCount,
      employeeCount: employeeRowIndexes?.length || rowTotals.size
    }
  }

  const processListFormat = (jsonData, headers, headerRowIdx, parserOptions = {}) => {
    const columns = mapAttendanceColumns(headers)
    const punchColumns = findAttendancePunchColumns(headers)
    const codeIdx = columns.code
    const nameIdx = columns.name
    const dateIdx = columns.date
    const inIdx = punchColumns.checkInIndexes[0] ?? -1
    const outIdx = punchColumns.checkOutIndexes[punchColumns.checkOutIndexes.length - 1] ?? -1
    const timeIdx = columns.eventTime

    const logs = []
    const groupedData = {}
    const skipped = []

    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      const empCode = codeIdx >= 0 ? row[codeIdx] : ''
      const empName = nameIdx >= 0 ? row[nameIdx] : ''
      const dateRaw = dateIdx >= 0 ? row[dateIdx] : ''
      if ((!empCode && !empName) || (!dateRaw && dateRaw !== 0)) continue

      const key = `${empCode}_${empName}_${dateRaw}`
      if (!groupedData[key]) groupedData[key] = { empCode, empName, dateRaw, times: [], sourceRows: [] }
      groupedData[key].sourceRows.push(i + 1)

      if (inIdx >= 0) {
        const t = parseTime(row[inIdx])
        if (t) groupedData[key].times.push(t.str)
      }
      if (outIdx >= 0) {
        const t = parseTime(row[outIdx])
        if (t) groupedData[key].times.push(t.str)
      }
      if (inIdx < 0 && outIdx < 0 && timeIdx >= 0) {
        const t = parseTime(row[timeIdx])
        if (t) groupedData[key].times.push(t.str)
      }
    }

    for (const key in groupedData) {
      const group = groupedData[key]
      if (group.times.length === 0) continue

      const sysEmp = attachSourceIdentity(
        findEmployee(group.empCode, group.empName) ||
          buildFallbackEmployee(group.empCode, group.empName),
        group.empCode,
        group.empName
      )

      const dateStr = parseDateValue(group.dateRaw, parserOptions)
      if (!dateStr) {
        skipped.push(`${excelColumnName(dateIdx)}${group.sourceRows[0]}: ngày không hợp lệ (${group.dateRaw})`)
        continue
      }

      const stats = calculateStats(group.times, sysEmp)
      if (stats) {
        logs.push(buildLog(sysEmp, dateStr, stats, {
          employeeCode: String(group.empCode || sysEmp.employeeId || ''),
          employeeName: String(group.empName || sysEmp.ho_va_ten || ''),
          machineName: String(group.empName || sysEmp.ho_va_ten || ''),
          provenance: { rows: group.sourceRows }
        }))
      }
    }

    return { logs, skipped }
  }

  const prepareMatchingPreview = (
    logs,
    metadata = {},
    preserveExistingMatches = false
  ) => {
    const groups = new Map()

    logs.forEach(log => {
      const sourceCode =
        log.sourceEmployeeCode ||
        log.employeeCode ||
        ''
      const sourceName =
        log.sourceEmployeeName ||
        log.employeeName ||
        log.machineName ||
        log.tenTheoMayChamCong ||
        ''
      const sourceDepartment = String(log.department || log.phongBan || '').trim()
      const sourceRow = log.provenance?.row || ''
      const sourceKey = metadata.isMonthlyMatrix
        ? buildMonthlyAttendanceSourceKey(sourceName, sourceDepartment, sourceRow)
        : buildSourceEmployeeKey(sourceCode, sourceName)
      const mappingKey = metadata.isMonthlyMatrix
        ? buildAttendanceMappingKey(
            '',
            `${sourceName}::${sourceDepartment}::row-${sourceRow}`,
            `monthly-matrix:${activeCompanyId}`
          )
        : buildAttendanceMappingKey(sourceCode, sourceName)

      if (!groups.has(sourceKey)) {
        // Old manual mappings can link a ROW placeholder to a different person.
        // This format always re-matches against the current employee directory.
        const isDeterministicImport = metadata.isMonthlyMatrix || metadata.isDetailedAttendanceList
        const storedMapping = isDeterministicImport ? null : employeeMappings?.[mappingKey]
        const mappedEmployee = storedMapping?.employeeId
          ? employeesById.get(String(storedMapping.employeeId))
          : null
        const currentEmployee = !isDeterministicImport && preserveExistingMatches
          ? employeesById.get(String(log.employeeId))
          : (mappedEmployee || null)
        const smartMatch = currentEmployee
          ? {
              employee: currentEmployee,
              suggestedEmployee: currentEmployee,
              confidence: 1,
              gap: 1,
              method: mappedEmployee
                ? 'Ánh xạ đã được xác nhận trước đây'
                : 'Đã gắn với hồ sơ Lumi',
              status: 'matched',
              candidates: [{ employee: currentEmployee, score: 1 }]
            }
          : metadata.isMonthlyMatrix
            ? matchMonthlyAttendanceEmployee(
                sourceName,
                sourceDepartment,
                companyScopedEmployees,
                activeCompanyId,
                matchBranch
              )
            : metadata.isDetailedAttendanceList
              ? matchDetailedAttendanceEmployee(
                  sourceCode,
                  sourceName,
                  companyScopedEmployees,
                  activeCompanyId
                )
            : matchAttendanceEmployee(
                sourceCode,
                sourceName,
                companyScopedEmployees,
                matchBranch
              )
        groups.set(sourceKey, {
          key: sourceKey,
          mappingKey,
          sourceCode: String(sourceCode || '').trim(),
          sourceName: String(sourceName || '').replace(/\s+/g, ' ').trim(),
          rowCount: 0,
          selectedEmployeeId: smartMatch.employee?.id || '',
          suggestedEmployeeId: smartMatch.suggestedEmployee?.id || '',
          confidence: smartMatch.confidence,
          gap: smartMatch.gap,
          method: smartMatch.method,
          status: smartMatch.status,
          matchMethod: smartMatch.method,
          matchStatus: smartMatch.status,
          sourceDepartment,
          sourceTotalWork: log.sourceTotalWork,
          sourcePosition: String(log.position || log.chucVu || '').trim(),
          sourceShift: String(log.shiftName || log.tenCa || '').trim(),
          candidates: smartMatch.candidates
        })
      }

      groups.get(sourceKey).rowCount += 1
    })

    const matchGroups = Array.from(groups.values())
    const groupByKey = new Map(matchGroups.map(group => [group.key, group]))
    const matchedLogs = logs.map(log => {
      const sourceCode = log.sourceEmployeeCode || log.employeeCode || ''
      const sourceName =
        log.sourceEmployeeName ||
        log.employeeName ||
        log.machineName ||
        log.tenTheoMayChamCong ||
        ''
      const sourceDepartment = String(log.department || log.phongBan || '').trim()
      const sourceRow = log.provenance?.row || ''
      const sourceKey = metadata.isMonthlyMatrix
        ? buildMonthlyAttendanceSourceKey(sourceName, sourceDepartment, sourceRow)
        : buildSourceEmployeeKey(sourceCode, sourceName)
      const group = groupByKey.get(sourceKey)
      const selectedEmployee = employeesById.get(String(group?.selectedEmployeeId))
      const preparedLog = {
        ...log,
        importJobId: metadata.importJobId || log.importJobId || '',
        sourceEmployeeCode: sourceCode,
        sourceEmployeeName: sourceName,
        _sourceEmployeeKey: sourceKey,
        _originalEmployeeId: log.employeeId || '',
        _sourceDepartment: log.department || log.phongBan || '',
        _sourcePosition: log.position || log.chucVu || ''
      }

      return selectedEmployee
        ? attachMatchedEmployee(preparedLog, selectedEmployee)
        : preparedLog
    })

    return {
      ...metadata,
      count: matchedLogs.length,
      uniqueEmployeeCount: matchGroups.length,
      matchGroups,
      logs: matchedLogs
    }
  }

  const handleMatchChange = (sourceKey, employeeId, method = 'Người dùng xác nhận') => {
    setPreviewData(previous => {
      if (!previous) return previous
      const isSkipped = employeeId === '__skip__'
      const isCreate = employeeId === '__create__'
      const selectedEmployee = employeesById.get(String(employeeId))
      const sourceGroup = previous.matchGroups.find(group => group.key === sourceKey)
      if (previous.isMonthlyMatrix || previous.isDetailedAttendanceList) {
        if (isCreate && !canCreateEmployees) return previous
        if (selectedEmployee && !sourceGroup?.candidates.some(candidate =>
          String(candidate.employee.id) === String(selectedEmployee.id)
        )) return previous
        if (selectedEmployee && sourceGroup?.matchStatus === 'review' && !canCreateEmployees) return previous
      }
      const matchGroups = previous.matchGroups.map(group =>
        group.key === sourceKey
          ? {
              ...group,
              selectedEmployeeId: isSkipped
                ? '__skip__'
                : isCreate
                  ? '__create__'
                  : selectedEmployee?.id || '',
              confidence: selectedEmployee ? 1 : group.confidence,
              method: isSkipped
                ? 'Không có hồ sơ trong Lumi - bỏ qua'
                : isCreate
                  ? 'Người dùng chủ động chọn tạo hồ sơ mới'
                : selectedEmployee
                  ? method
                  : group.matchMethod || group.method,
              status: isSkipped
                ? 'skipped'
                : isCreate
                  ? 'create'
                : selectedEmployee
                  ? 'matched'
                  : group.matchStatus || 'unmatched'
            }
          : group
      )

      const logs = previous.logs.map(log => {
        if (log._sourceEmployeeKey !== sourceKey) return log
        if (selectedEmployee) {
          return attachMatchedEmployee(log, selectedEmployee)
        }

        return {
          ...log,
          employeeId: `external:${sourceKey}`,
          employeeCode: log.sourceEmployeeCode || '',
          employeeName: log.sourceEmployeeName || '',
          department: log._sourceDepartment || '',
          position: log._sourcePosition || ''
        }
      })

      return { ...previous, matchGroups, logs }
    })
  }

  const handleReconcileExisting = () => {
    if (!attendanceLogs.length) {
      alert('Chưa có dữ liệu chấm công trong Lumi để đối soát.')
      return
    }

    setPreviewData(
      prepareMatchingPreview(
        attendanceLogs,
        {
          modeLabel: 'Đối soát dữ liệu đã có trong Lumi',
          isMatrixMode: false,
          detectedDays: [],
          skipped: [],
          isReconcileMode: true
        },
        true
      )
    )
  }

  const readFileAsDataUrl = (imageFile) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Không đọc được ảnh danh sách nhân sự'))
      reader.readAsDataURL(imageFile)
    })

  const handleAiMatch = async () => {
    if (!previewData?.matchGroups?.length) return
    const pendingGroups = previewData.matchGroups.filter(
      group => !group.selectedEmployeeId
    )
    if (!pendingGroups.length) {
      alert('Tất cả nhân viên đã được ghép. Không cần gọi AI.')
      return
    }
    if (!referenceImage) {
      alert('Vui lòng chọn ảnh danh sách nhân sự để AI đọc và đối sánh.')
      return
    }
    if (referenceImage.size > 3 * 1024 * 1024) {
      alert('Ảnh vượt quá 3MB. Vui lòng giảm kích thước ảnh.')
      return
    }

    setAiLoading(true)
    try {
      const imageDataUrl = await readFileAsDataUrl(referenceImage)
      const response = await fetch('/api/attendance-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          branch: matchBranch,
          sourcePeople: pendingGroups.map(group => ({
            sourceKey: group.key,
            sourceCode: group.sourceCode,
            sourceName: group.sourceName
          })),
          employees: employees.map(employee => ({
            id: employee.id,
            employeeCode:
              employee.employeeId ||
              employee.employee_id ||
              employee.username ||
              '',
            name: employee.ho_va_ten || employee.name || '',
            branch: employee.chi_nhanh || employee.branch || '',
            department: employee.bo_phan || employee.department || ''
          }))
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'AI không xử lý được ảnh')
      }

      ;(payload.matches || []).forEach(match => {
        if (
          match?.sourceKey &&
          match?.employeeId &&
          employeesById.has(String(match.employeeId))
        ) {
          handleMatchChange(
            match.sourceKey,
            match.employeeId,
            `AI xác nhận: ${match.reason || 'khớp theo ảnh'}`
          )
        }
      })
    } catch (error) {
      alert(`Không thể dùng AI: ${error.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const guessManualBindings = headers => {
    const mapped = mapAttendanceColumns(headers)
    const punches = findAttendancePunchColumns(headers)
    const bindings = {}
    MANUAL_MAPPING_FIELDS.forEach(([field]) => {
      if (Number.isInteger(mapped[field]) && mapped[field] >= 0) bindings[field] = mapped[field]
    })
    if (punches.checkInIndexes.length) bindings.checkIn = punches.checkInIndexes[0]
    if (punches.checkOutIndexes.length) {
      bindings.checkOut = punches.checkOutIndexes[punches.checkOutIndexes.length - 1]
    }
    return bindings
  }

  const guessManualHeaderRow = rows => {
    let best = { rowIndex: 0, score: -1 }
    const limit = Math.min(rows.length, 500)
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = rows[rowIndex] || []
      const mapped = mapAttendanceColumns(row)
      const punches = findAttendancePunchColumns(row)
      const nonEmpty = row.filter(value => String(value ?? '').trim()).length
      const identity = Number(mapped.code >= 0) + Number(mapped.name >= 0)
      const attendance = Number(mapped.date >= 0) + Number(mapped.workdays >= 0) +
        Number(mapped.hours >= 0) + Number(mapped.eventTime >= 0) +
        punches.allIndexes.length
      const score = identity * 100 + attendance * 80 + Math.min(nonEmpty, 30)
      if (score > best.score) best = { rowIndex, score }
    }
    return best.rowIndex
  }

  const createManualMappingState = (sheets, sheetName, requestedHeaderRow) => {
    const selected = sheets.find(sheet => sheet.sheetName === sheetName) || sheets[0]
    if (!selected) return null
    const headerRow = Math.max(
      0,
      Math.min(
        selected.rows.length - 1,
        Number.isInteger(requestedHeaderRow)
          ? requestedHeaderRow
          : guessManualHeaderRow(selected.rows)
      )
    )
    return {
      sheets: sheets.map(sheet => ({ sheetName: sheet.sheetName, rows: sheet.rows })),
      sheetName: selected.sheetName,
      headerRow,
      bindings: guessManualBindings(selected.rows[headerRow] || [])
    }
  }

  const buildManualSheetAnalysis = (selectedSheet, config) => {
    const headerRow = Number(config.headerRow)
    const columnCount = selectedSheet.rows
      .slice(headerRow, headerRow + 101)
      .reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0)
    const originalHeaders = Array.from(
      { length: columnCount },
      (_, index) => selectedSheet.rows[headerRow]?.[index] ?? ''
    )
    const bindings = Object.fromEntries(
      Object.entries(config.bindings || {})
        .map(([field, index]) => [field, Number(index)])
        .filter(([, index]) => Number.isInteger(index) && index >= 0)
    )
    const usedIndexes = Object.values(bindings)
    if (usedIndexes.length !== new Set(usedIndexes).size) {
      throw new Error('Mỗi cột Excel chỉ được gán cho một cột hệ thống.')
    }
    if (bindings.code == null && bindings.name == null) {
      throw new Error('Cần chọn ít nhất Mã nhân viên hoặc Họ và tên.')
    }
    if (bindings.date == null) throw new Error('Cần chọn cột Ngày chấm công.')
    if (!['checkIn', 'checkOut', 'eventTime', 'workdays', 'hours', 'symbol', 'totalHours']
      .some(field => bindings[field] != null)) {
      throw new Error('Cần chọn ít nhất một cột giờ chấm, Công, Giờ hoặc Ký hiệu.')
    }

    const headers = [...originalHeaders]
    MANUAL_MAPPING_FIELDS.forEach(([field, , canonicalHeader]) => {
      if (bindings[field] != null) headers[bindings[field]] = canonicalHeader
    })
    const rows = [...selectedSheet.rows]
    rows[headerRow] = headers
    const columns = mapAttendanceColumns(headers)
    const punches = findAttendancePunchColumns(headers)
    const hasFullMetrics = [
      'workdays', 'hours', 'extraWorkdays', 'extraHours', 'symbol', 'totalHours',
      'lateMinutes', 'earlyMinutes', 'overtime1', 'overtime2', 'overtime3'
    ].some(field => bindings[field] != null)
    const format = hasFullMetrics ? 'full' : 'list'
    const signature = buildAttendanceHeaderSignature(originalHeaders)

    return {
      ...selectedSheet,
      rows,
      analysis: {
        kind: format,
        score: 20000,
        matrix: null,
        list: {
          rowIndex: headerRow,
          headers,
          columns,
          punches,
          numberedPunches: 0,
          valid: true,
          score: 20000,
          format
        }
      },
      mappingTemplate: signature ? {
        key: signature,
        value: {
          version: 1,
          bindingHeaders: buildAttendanceTemplateBindings(originalHeaders, bindings),
          bindingColumns: bindings,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.id || ''
        }
      } : null
    }
  }

  const findSavedMapping = sheetCandidates => {
    for (const sheet of sheetCandidates) {
      const limit = Math.min(sheet.rows.length, 500)
      for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
        const headers = sheet.rows[rowIndex] || []
        const signature = buildAttendanceHeaderSignature(headers)
        const template = signature ? importMappingTemplates[signature] : null
        const bindings = template
          ? resolveAttendanceTemplateBindings(headers, template)
          : null
        if (bindings) return { sheetName: sheet.sheetName, headerRow: rowIndex, bindings }
      }
    }
    return null
  }

  // Retained for a future explicit re-enable; monthly-only imports never enter here.
  const handleGenericPreview = async (mappingOverride = null) => {
    if (!file) {
      alert('Vui lòng chọn file Excel')
      return
    }

    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = read(data, { type: 'array', cellNF: true, cellDates: false })
      const parserOptions = { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) }

      // Chấm điểm cấu trúc từng sheet thay vì chọn sheet dài nhất hoặc có nhiều ô số nhất.
      const sheetCandidates = workbook.SheetNames.map((sheetName, workbookIndex) => {
        const worksheet = workbook.Sheets[sheetName]
        const rawRows = utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' })
        const rows = expandAttendanceMergedCells(rawRows, worksheet['!merges'] || [])
        return {
          sheetName,
          workbookIndex,
          worksheet,
          rows,
          analysis: analyzeAttendanceSheet(rows, parserOptions)
        }
      }).filter(candidate => candidate.rows.length > 0)

      sheetCandidates.sort((left, right) =>
        right.analysis.score - left.analysis.score ||
        right.rows.length - left.rows.length ||
        left.workbookIndex - right.workbookIndex
      )

      const requestedMapping = mappingOverride && !(mappingOverride?.preventDefault)
        ? mappingOverride
        : null
      const savedMapping = requestedMapping ? null : findSavedMapping(sheetCandidates)
      const selectedConfig = requestedMapping || savedMapping
      let selectedSheet = selectedConfig
        ? sheetCandidates.find(candidate => candidate.sheetName === selectedConfig.sheetName)
        : sheetCandidates[0]

      if (selectedConfig && selectedSheet && !selectedConfig.autoOnly) {
        selectedSheet = buildManualSheetAnalysis(selectedSheet, selectedConfig)
      }

      if (!selectedSheet || selectedSheet.analysis.score <= 0) {
        const setup = createManualMappingState(
          sheetCandidates,
          selectedSheet?.sheetName || sheetCandidates[0]?.sheetName
        )
        if (!setup) throw new Error('File không có sheet dữ liệu để phân tích.')
        setManualMapping(setup)
        setPreviewData(null)
        alert('Chưa nhận diện chắc chắn được cấu trúc. Hãy chọn hàng tiêu đề và ghép các cột bên dưới.')
        return
      }

      const jsonData = selectedSheet.rows
      const selectedSheetName = selectedSheet.sheetName
      const sheetAnalysis = selectedSheet.analysis
      const mappingDescriptor = JSON.stringify({
        sheet: selectedSheetName,
        kind: sheetAnalysis.kind,
        headerRow: sheetAnalysis.list?.rowIndex ?? sheetAnalysis.matrix?.rowIndex ?? -1,
        headers: sheetAnalysis.list?.headers?.map(normalizeAttendanceHeader) || [],
        manualBindings: selectedConfig?.bindings || null
      })
      const mappingBytes = new TextEncoder().encode(mappingDescriptor)
      const fileBytes = new Uint8Array(data)
      const fingerprintInput = new Uint8Array(fileBytes.length + mappingBytes.length)
      fingerprintInput.set(fileBytes)
      fingerprintInput.set(mappingBytes, fileBytes.length)
      const digest = await crypto.subtle.digest('SHA-256', fingerprintInput)
      const importJobId = `excel_${Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')}`
      const bestDayRowIdx = sheetAnalysis.matrix?.rowIndex ?? -1
      const bestDayCols = sheetAnalysis.matrix?.columns ?? []

      let format = ''
      let result = { logs: [], skipped: [] }
      let detectedDays = []
      let modeLabel = 'Danh sách'
      let headerRowIdx = -1
      let headers = []
      let recognizedColumns = []
      let dataStartForValidation = 0
      let usedColumnsForValidation = []

      if (sheetAnalysis.kind === 'matrix' && sheetAnalysis.matrix) {
        format = 'matrix'
        const matrixDayRowIdx = bestDayRowIdx
        const matrixDayCols = bestDayCols
        detectedDays = [...sheetAnalysis.matrix.days].sort((a, b) => a - b)
        usedColumnsForValidation = matrixDayCols.map(column => column.idx)

        // Tự động nhận diện tháng/năm từ date serial trong hàng ngày, hoặc từ tiêu đề file/tên sheet
        let [year, month] = importMonth.split('-').map(Number)
        const datedDayColumn = matrixDayCols.find(column => column.year && column.month)
        if (datedDayColumn?.year) year = datedDayColumn.year
        if (datedDayColumn?.month) month = datedDayColumn.month

        const titleSources = [
          selectedSheetName,
          file.name,
          ...jsonData.slice(0, Math.min(matrixDayRowIdx + 1, 12)).map(r => (r || []).join(' '))
        ]
        for (const text of titleSources) {
          const m = String(text).match(/(?:th[aá]ng|t)\s*(\d{1,2})(?:[\/\-\s]+(\d{4}))?/i)
          if (m) {
            const mVal = Number(m[1])
            if (mVal >= 1 && mVal <= 12) {
              month = mVal
              if (m[2]) year = Number(m[2])
              break
            }
          }
        }
        setImportMonth(`${year}-${String(month).padStart(2, '0')}`)

        // Cột nhân sự có thể nằm ở bất kỳ dòng tiêu đề ghép nào phía trên dãy ngày.
        const metadata = { code: -1, name: -1, position: -1, department: -1, shift: -1 }
        const firstDayColumnIndex = Math.min(...matrixDayCols.map(column => column.idx))
        const metadataStartRow = Math.max(0, matrixDayRowIdx - 5)
        for (let rowIndex = metadataStartRow; rowIndex <= matrixDayRowIdx + 1; rowIndex++) {
          const mapped = mapAttendanceColumns(jsonData[rowIndex] || [])
          Object.keys(metadata).forEach(field => {
            const index = mapped[field]
            if (metadata[field] < 0 && index >= 0 && index < firstDayColumnIndex) {
              metadata[field] = index
            }
          })
        }

        let codeColIdx = metadata.code
        let nameColIdx = metadata.name
        const posColIdx = metadata.position
        const deptColIdx = metadata.department
        const shiftColIdx = metadata.shift

        if (nameColIdx === -1) {
          // Fallback: suy ra cột họ tên từ dữ liệu text trước dãy ngày.
          let bestNameScore = -1
          for (let columnIndex = 0; columnIndex < firstDayColumnIndex; columnIndex++) {
            const samples = jsonData
              .slice(matrixDayRowIdx + 1, matrixDayRowIdx + 31)
              .map(row => String(row?.[columnIndex] ?? '').trim())
              .filter(Boolean)
            const score = samples.filter(value =>
              /[A-Za-zÀ-ỹ]/.test(value) && value.split(/\s+/).length >= 2
            ).length
            if (score > bestNameScore) {
              bestNameScore = score
              nameColIdx = columnIndex
            }
          }
        }

        if (codeColIdx === nameColIdx) codeColIdx = -1

        recognizedColumns = [
          codeColIdx >= 0 ? 'Mã nhân viên' : '',
          nameColIdx >= 0 ? 'Họ tên' : '',
          deptColIdx >= 0 ? 'Bộ phận' : '',
          posColIdx >= 0 ? 'Chức vụ' : '',
          shiftColIdx >= 0 ? 'Ca làm' : '',
          `Ngày ${detectedDays[0]}–${detectedDays[detectedDays.length - 1]}`
        ].filter(Boolean)

        // Bỏ qua dòng thứ trong tuần (T2, T3, T4... CN) hoặc dòng tiêu đề phụ
        let dataStartRow = matrixDayRowIdx + 1
        while (dataStartRow < jsonData.length) {
          const row = jsonData[dataStartRow] || []
          const weekdayCount = row.filter(c => /^(t[2-7]|cn|thứ\s*[2-7]|chủ\s*nhật)$/i.test(String(c || '').trim())).length
          const nameVal = nameColIdx >= 0 ? String(row[nameColIdx] || '').trim() : ''
          const codeVal = codeColIdx >= 0 ? String(row[codeColIdx] || '').trim() : ''
          const lowerName = nameVal.toLowerCase()

          if (
            weekdayCount >= 3 ||
            (!nameVal && !codeVal) ||
            lowerName.includes('họ tên') ||
            lowerName.includes('nhân sự') ||
            lowerName.includes('xác nhận')
          ) {
            dataStartRow++
          } else {
            break
          }
        }
        dataStartForValidation = dataStartRow

        result = processMatrixFormat(jsonData, {
          matrixDayCols,
          codeColIdx,
          nameColIdx,
          posColIdx,
          deptColIdx,
          shiftColIdx,
          dataStartRow,
          year,
          month,
          worksheet: selectedSheet.worksheet,
          matrixValueMode: matrixValuePreference === 'auto'
            ? (/\b(?:so gio|gio lam|hours?)\b/.test(normalizeAttendanceHeader(
                jsonData.slice(Math.max(0, matrixDayRowIdx - 5), matrixDayRowIdx + 1)
                  .flat()
                  .join(' ')
              )) ? 'hours' : 'workdays')
            : matrixValuePreference
        })
        modeLabel = 'Bảng công (Ma trận ngày)'
      } else {
        const headerCandidate = sheetAnalysis.list
        if (!headerCandidate) throw new Error('Không tìm thấy dòng tiêu đề chấm công hợp lệ.')
        headerRowIdx = headerCandidate.rowIndex
        dataStartForValidation = headerRowIdx + 1
        headers = headerCandidate.headers
        format = sheetAnalysis.kind
        const columnLabels = {
          code: 'Mã nhân viên',
          name: 'Họ tên',
          machineName: 'Tên máy',
          department: 'Bộ phận',
          position: 'Chức vụ',
          date: 'Ngày',
          weekday: 'Thứ',
          workdays: 'Công',
          hours: 'Giờ',
          extraWorkdays: 'Công+',
          extraHours: 'Giờ+',
          shift: 'Ca làm',
          symbol: 'Ký hiệu',
          extraSymbol: 'Ký hiệu+',
          totalHours: 'Tổng giờ',
          lateMinutes: 'Vào trễ',
          earlyMinutes: 'Ra sớm',
          overtime1: 'TC1',
          overtime2: 'TC2',
          overtime3: 'TC3',
          eventTime: 'Thời gian chấm'
        }
        recognizedColumns = Object.entries(headerCandidate.columns)
          .filter(([, index]) => index >= 0)
          .map(([field]) => columnLabels[field])
          .filter(Boolean)
        if (headerCandidate.punches.allIndexes.length > 0) recognizedColumns.push('Vào/Ra')
        usedColumnsForValidation = [
          ...Object.values(headerCandidate.columns),
          ...headerCandidate.punches.allIndexes
        ].filter(index => Number.isInteger(index) && index >= 0)

        if (format === 'full') {
          result = processFullAttendanceFormat(jsonData, headers, headerRowIdx, {
            ...parserOptions,
            deterministicDetail: Boolean(selectedConfig?.deterministicDetail)
          })
          modeLabel = 'Bảng chấm công đầy đủ'
        } else if (format === 'punch') {
          result = processPunchLogFormat(jsonData, headers, headerRowIdx, parserOptions)
          modeLabel = 'Nhật ký chấm công (Lần 1–7)'
        } else {
          result = processListFormat(jsonData, headers, headerRowIdx, parserOptions)
          modeLabel = 'Danh sách (Vào/Ra)'
        }
      }

      const usedColumnSet = new Set(usedColumnsForValidation)
      Object.entries(selectedSheet.worksheet || {}).forEach(([address, cell]) => {
        if (address.startsWith('!')) return
        const position = utils.decode_cell(address)
        if (position.r < dataStartForValidation || !usedColumnSet.has(position.c)) return
        if (cell?.t === 'e' || (cell?.f && (cell.v === null || cell.v === undefined || cell.v === ''))) {
          result.skipped.push(
            `${address}: công thức không có kết quả lưu sẵn hoặc đang lỗi (${cell.f || cell.w || cell.v || 'Excel error'})`
          )
        }
      })

      if (result.logs.length === 0) {
        const hint = result.skipped.slice(0, 5).join('\n')
        alert(`Không tìm thấy dữ liệu hợp lệ.\n${hint || 'Vui lòng kiểm tra lại file và mã NV khớp hệ thống.'}`)
        setPreviewData(null)
      } else {
        // Tự nhận diện tháng từ ngày trong mọi định dạng file (không chỉ ma trận).
        // Nhờ đó file tháng 08 không bị lưu nhầm vào tháng đang mở trên màn hình.
        const monthCounts = new Map()
        result.logs.forEach(log => {
          const date = String(log.date || log.ngay || '').slice(0, 10)
          const match = date.match(/^(\d{4})-(\d{2})-/)
          if (match) {
            const value = `${match[1]}-${match[2]}`
            monthCounts.set(value, (monthCounts.get(value) || 0) + 1)
          }
        })
        const detectedImportMonth = Array.from(monthCounts.entries())
          .sort((left, right) => right[1] - left[1])[0]?.[0] || importMonth
        const affectedMonths = Array.from(monthCounts.keys()).sort()
        setImportMonth(detectedImportMonth)
        setPreviewData(
          prepareMatchingPreview(result.logs, {
            modeLabel,
            detectedFormatLabel: selectedConfig?.deterministicDetail
              ? 'Chi tiết chấm công theo ngày'
              : modeLabel,
            isDetailedAttendanceList: Boolean(selectedConfig?.deterministicDetail),
            isMatrixMode: format === 'matrix',
            detectedDays,
            skipped: result.skipped,
            warnings: result.warnings || [],
            blockingIssues: result.skipped,
            isReconcileMode: false,
            importMonth: detectedImportMonth,
            affectedMonths,
            importJobId,
            sourceSheetName: selectedSheetName,
            employeeCount: selectedConfig?.detailDetection?.employeeCount,
            dayCount: selectedConfig?.detailDetection?.dayCount,
            expectedAttendanceCount: result.logs.length,
            availableSheets: sheetCandidates.map(candidate => ({
              name: candidate.sheetName,
              recognized: candidate.analysis.score > 0
            })),
            mappingTemplate: selectedSheet.mappingTemplate || null,
            recognizedColumns: [...new Set(recognizedColumns)]
          })
        )
      }
    } catch (error) {
      alert('Lỗi: ' + error.message)
      console.error(error)
      setPreviewData(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (mappingOverride = null) => {
    if (SUPPORTED_ATTENDANCE_IMPORT_MODE !== 'monthly_matrix_only') {
      return handleGenericPreview(mappingOverride)
    }
    if (!file) {
      alert('Vui lòng chọn file Excel')
      return
    }

    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = read(data, { type: 'array', cellNF: true, cellDates: false })
      const workbookSheets = workbook.SheetNames.map((sheetName, workbookIndex) => {
        const worksheet = workbook.Sheets[sheetName]
        const rawRows = utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' })
        const rows = expandAttendanceMergedCells(rawRows, worksheet['!merges'] || [])
        return {
          sheetName,
          workbookIndex,
          worksheet,
          rows
        }
      }).filter(candidate => candidate.rows.length > 0)

      const requestedConfig = mappingOverride && !mappingOverride?.preventDefault
        ? mappingOverride
        : null
      const requestedSheetName = requestedConfig?.sheetName || ''
      const workbookAnalysis = analyzeMonthlyAttendanceSheets(
        workbookSheets,
        requestedSheetName
      )

      if (workbookAnalysis.candidates.length === 0) {
        const detailAnalysis = analyzeAttendanceDetailSheets(
          workbookSheets,
          requestedSheetName,
          { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) }
        )
        if (detailAnalysis.candidates.length === 0) {
          throw new Error(
            'File Excel chưa đúng định dạng bảng công đang được hỗ trợ.\n' +
            'Với bảng công theo tuần, hãy ghi khoảng ngày trong sheet (ví dụ: 8/10/2026 - 14/10/2026) ' +
            'và đủ cột ngày tương ứng; hệ thống sẽ cập nhật đúng các ngày đó vào bảng công tháng.'
          )
        }
        if (detailAnalysis.requiresSelection) {
          setMonthlySheetSelection({
            kindLabel: 'Chi tiết chấm công',
            selectedSheetName: '',
            candidates: detailAnalysis.candidates.map(candidate => ({
              name: candidate.sheetName,
              yearMonth: candidate.detailDetection.yearMonth,
              employeeCount: candidate.detailDetection.employeeCount
            }))
          })
          setPreviewData(null)
          return
        }
        const detailSheet = detailAnalysis.selected
        if (!detailSheet) throw new Error('Sheet đã chọn không đúng định dạng chi tiết chấm công.')
        if (detailSheet.detailDetection.errors.length) {
          throw new Error(detailSheet.detailDetection.errors.join('\n'))
        }
        setMonthlySheetSelection(null)
        return await handleGenericPreview({
          sheetName: detailSheet.sheetName,
          autoOnly: true,
          deterministicDetail: true,
          detailDetection: detailSheet.detailDetection
        })
      }
      if (workbookAnalysis.requiresSelection) {
        setMonthlySheetSelection({
          kindLabel: 'Bảng công tháng',
          selectedSheetName: '',
          candidates: workbookAnalysis.candidates.map(candidate => ({
            name: candidate.sheetName,
            yearMonth: candidate.detection.yearMonth,
            employeeCount: candidate.detection.employeeCount
          }))
        })
        setManualMapping(null)
        setPreviewData(null)
        return
      }

      const selectedSheet = workbookAnalysis.selected
      if (!selectedSheet) {
        throw new Error('Sheet đã chọn không đúng định dạng bảng công đang được hỗ trợ.')
      }
      const detection = selectedSheet.detection
      if (detection.errors.length > 0) throw new Error(detection.errors.join('\n'))

      const jsonData = selectedSheet.rows
      const selectedSheetName = selectedSheet.sheetName
      const extracted = extractMonthlyAttendanceMatrix(jsonData, detection)
      if (extracted.errors.length > 0) throw new Error(extracted.errors.join('\n'))
      setMonthlySheetSelection(null)
      setManualMapping(null)

      const mappingDescriptor = JSON.stringify({
        sheet: selectedSheetName,
        kind: detection.kind,
        headerRow: detection.headerRowIndex,
        yearMonth: detection.yearMonth,
        mode: SUPPORTED_ATTENDANCE_IMPORT_MODE
      })
      const mappingBytes = new TextEncoder().encode(mappingDescriptor)
      const fileBytes = new Uint8Array(data)
      const fingerprintInput = new Uint8Array(fileBytes.length + mappingBytes.length)
      fingerprintInput.set(fileBytes)
      fingerprintInput.set(mappingBytes, fileBytes.length)
      const digest = await crypto.subtle.digest('SHA-256', fingerprintInput)
      const importJobId = `excel_${Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')}`
      setImportMonth(detection.yearMonth)
      const detectedDays = detection.dayColumns.map(column => column.day)
      const result = processMatrixFormat(jsonData, {
        matrixDayCols: detection.dayColumns,
        codeColIdx: -1,
        nameColIdx: detection.columns.name,
        posColIdx: -1,
        deptColIdx: detection.columns.department,
        shiftColIdx: detection.columns.shift,
        employmentTypeColIdx: detection.columns.employmentType,
        employeeStatusColIdx: detection.columns.employeeStatus,
        totalWorkColIdx: detection.columns.totalWork,
        dataStartRow: detection.headerRowIndex + 1,
        employeeRowIndexes: detection.employeeRowIndexes,
        year: detection.year,
        month: detection.month,
        worksheet: selectedSheet.worksheet,
        matrixValueMode: 'workdays',
        isMonthlyMatrix: true
      })

      const usedColumnSet = new Set(detection.dayColumns.map(column => column.idx))
      const usedRowSet = new Set(detection.employeeRowIndexes)
      Object.entries(selectedSheet.worksheet || {}).forEach(([address, cell]) => {
        if (address.startsWith('!')) return
        const position = utils.decode_cell(address)
        if (!usedRowSet.has(position.r) || !usedColumnSet.has(position.c)) return
        if (cell?.t === 'e' || (cell?.f && (cell.v === null || cell.v === undefined || cell.v === ''))) {
          result.skipped.push(
            `${address}: công thức không có kết quả lưu sẵn hoặc đang lỗi (${cell.f || cell.w || cell.v || 'Excel error'})`
          )
        }
      })

      if (result.logs.length === 0) {
        const hint = result.skipped.slice(0, 5).join('\n')
        alert(`Không tìm thấy dữ liệu hợp lệ.\n${hint || 'Vui lòng kiểm tra các ô công theo ngày trong file.'}`)
        setPreviewData(null)
      } else {
        result.logs = result.logs.map(log => ({
          ...log,
          provenance: { sheet: selectedSheetName, ...(log.provenance || {}) }
        }))
        result.skipped = (result.skipped || []).map(issue =>
          String(issue).startsWith('Sheet ') ? issue : `Sheet ${selectedSheetName}!${issue}`
        )
        const warnings = [...new Set([
          ...(extracted.warnings || []),
          ...(result.warnings || [])
        ])]
        setPreviewData(
          prepareMatchingPreview(result.logs, {
            modeLabel: 'Bảng công tháng',
            detectedFormatLabel: 'Bảng công tháng',
            isMatrixMode: true,
            isMonthlyMatrix: true,
            detectedDays,
            skipped: result.skipped,
            blockingIssues: result.skipped,
            warnings,
            isReconcileMode: false,
            importMonth: detection.yearMonth,
            affectedMonths: [detection.yearMonth],
            importJobId,
            sourceSheetName: selectedSheetName,
            employeeCount: extracted.employees.length,
            dayCount: detection.dayColumns.length,
            expectedAttendanceCount: extracted.attendanceRows.length,
            ignoredDayCount: detection.ignoredDayColumns.length,
            availableSheets: workbookAnalysis.candidates.map(candidate => ({
              name: candidate.sheetName,
              recognized: true
            })),
            mappingTemplate: null,
            recognizedColumns: [
              'Họ tên', 'Bộ phận', 'Ca làm', 'Loại HĐ', 'Trạng thái',
              'Tổng công', `Ngày 1–${detection.dayColumns.length}`
            ]
          })
        )
      }
    } catch (error) {
      alert('Lỗi: ' + error.message)
      console.error(error)
      setPreviewData(null)
    } finally {
      setLoading(false)
    }
  }

  const executeImport = async () => {
    if (!previewData || !previewData.logs) return
    if (importInProgressRef.current) return
    const selectionIssues = validateMonthlyAttendanceSelection(previewData, employees, activeCompanyId)
    if (selectionIssues.length) {
      alert(selectionIssues.join('\n'))
      return
    }
    if (previewData.blockingIssues?.length > 0) {
      alert(
        `Còn ${previewData.blockingIssues.length} ô/dòng dữ liệu chưa hợp lệ. ` +
        `Ví dụ: ${previewData.blockingIssues[0]}. Hãy sửa file hoặc mapping rồi phân tích lại; chưa có dữ liệu nào được ghi.`
      )
      return
    }
    const unresolvedCount = previewData.matchGroups.filter(
      group =>
        !group.selectedEmployeeId &&
        group.status !== 'skipped' &&
        group.status !== 'create'
    ).length
    if (unresolvedCount > 0) {
      alert(
        `Còn ${unresolvedCount} nhân viên chưa được ghép với hồ sơ Lumi.\n` +
        'Vui lòng chọn đúng hồ sơ, hoặc chọn “Không có trong Lumi (bỏ qua)” trước khi import. ' +
        'Dữ liệu chưa được ghi để tránh bảng công không đồng bộ.'
      )
      return
    }

    importInProgressRef.current = true
    setLoading(true)
    try {
      const BATCH_SIZE = 50
      let count = 0
      let skippedCount = 0
      let createdEmployeeCount = 0
      const importJobId = previewData.importJobId || `excel_${Date.now().toString(36)}`
      await fbSet(`hr/attendanceImportJobs/${importJobId}`, {
        id: importJobId,
        status: 'committing',
        sourceFileName: file?.name || '',
        affectedMonths: previewData.affectedMonths || [],
        startedAt: new Date().toISOString(),
        startedBy: user?.id || ''
      })

      const groupsToCreate = previewData.matchGroups.filter(
        group => group.status === 'create' && group.selectedEmployeeId === '__create__'
      )
      const createSourceKeys = new Set(groupsToCreate.map(group => group.key))
      const skippedSourceKeys = new Set(
        previewData.matchGroups
          .filter(group => group.status === 'skipped')
          .map(group => group.key)
      )
      let latestAttendanceLogs = []
      if (!previewData.isReconcileMode) {
        const latestLogsData = await fbGet('hr/attendanceLogs', activeCompanyId)
        latestAttendanceLogs = Array.isArray(latestLogsData)
          ? latestLogsData
          : Object.entries(latestLogsData || {}).map(([id, value]) => ({ ...value, id }))
        const preflightPlan = planAttendanceImport({
          incomingLogs: previewData.logs.filter(
            log => !createSourceKeys.has(log._sourceEmployeeKey)
          ),
          existingLogs: latestAttendanceLogs,
          skippedSourceKeys
        })
        if (preflightPlan.conflicts.length > 0) {
          throw new Error(
            `Có ${preflightPlan.conflicts.length} dòng xung đột với dữ liệu chấm công đang có. ` +
            `${preflightPlan.conflicts[0].reason} Chưa ghi dữ liệu nào.`
          )
        }
      }

      const createdEmployeesBySourceKey = new Map()
      const usedEmployeeCodes = new Set(
        employees
          .flatMap(employee => [
            employee.employeeId,
            employee.employee_id,
            employee.username,
            employee.code
          ])
          .map(normalizeEmployeeIdentity)
          .filter(Boolean)
      )
      const stableCodeForGroup = group => {
        const input = String(group.mappingKey || group.key || group.sourceName || '')
        let hash = 2166136261
        for (let offset = 0; offset < input.length; offset += 1) {
          hash ^= input.charCodeAt(offset)
          hash = Math.imul(hash, 16777619)
        }
        return `CC${(hash >>> 0).toString(36).toUpperCase()}`
      }

      for (let index = 0; index < groupsToCreate.length; index += 1) {
        const group = groupsToCreate[index]
        const sourceCode = String(group.sourceCode || '').trim()
        const normalizedSourceCode = normalizeEmployeeIdentity(sourceCode)
        const canUseSourceCode =
          normalizedSourceCode &&
          !/^row\d+$/i.test(sourceCode) &&
          !usedEmployeeCodes.has(normalizedSourceCode)
        let codeSequence = 1
        const stableCode = stableCodeForGroup(group)
        let employeeCode = canUseSourceCode
          ? sourceCode
          : stableCode

        while (usedEmployeeCodes.has(normalizeEmployeeIdentity(employeeCode))) {
          codeSequence += 1
          employeeCode = `${stableCode}${codeSequence}`
        }
        usedEmployeeCodes.add(normalizeEmployeeIdentity(employeeCode))

        const newEmployee = {
          employeeId: employeeCode,
          ho_va_ten: group.sourceName,
          bo_phan: group.sourceDepartment || '',
          vi_tri: group.sourcePosition || '',
          ca_lam_viec: group.sourceShift || '',
          role: 'user'
        }
        const created = await createEmployeeDirectoryProfile(newEmployee)
        const employeeWithId = { ...newEmployee, ...created, id: created.id }
        createdEmployeesBySourceKey.set(group.key, employeeWithId)
        if (!created.reusedExisting) createdEmployeeCount += 1
      }

      const logsForImport = previewData.logs.map(log => {
        const createdEmployee = createdEmployeesBySourceKey.get(log._sourceEmployeeKey)
        if (!createdEmployee) return log
        return attachMatchedEmployee(log, createdEmployee)
      })

      if (previewData.isReconcileMode) {
        const changedLogs = logsForImport.filter(
          log =>
            log.id &&
            String(log.employeeId || '') !== String(log._originalEmployeeId || '')
        )

        for (let i = 0; i < changedLogs.length; i += BATCH_SIZE) {
          const chunk = changedLogs.slice(i, i + BATCH_SIZE)
          await Promise.all(
            chunk.map(log =>
              fbUpdate(`hr/attendanceLogs/${log.id}`, sanitizeAttendanceImportLog(log), activeCompanyId)
            )
          )
          count += chunk.length
        }
      } else {
        const latestLogsData = await fbGet('hr/attendanceLogs', activeCompanyId)
        latestAttendanceLogs = Array.isArray(latestLogsData)
          ? latestLogsData
          : Object.entries(latestLogsData || {}).map(([id, value]) => ({ ...value, id }))
        const writePlan = planAttendanceImport({
          incomingLogs: logsForImport,
          existingLogs: latestAttendanceLogs,
          skippedSourceKeys
        })
        if (writePlan.conflicts.length > 0) {
          throw new Error(
            `Có ${writePlan.conflicts.length} dòng xung đột với dữ liệu vừa được cập nhật. ` +
            `${writePlan.conflicts[0].reason} Chưa ghi log chấm công.`
          )
        }
        skippedCount = writePlan.unchanged.length + writePlan.skipped.length

        for (let i = 0; i < writePlan.updates.length; i += BATCH_SIZE) {
          const chunk = writePlan.updates.slice(i, i + BATCH_SIZE)
          await Promise.all(
            chunk.map(item => fbUpdate(`hr/attendanceLogs/${item.id}`, item.data, activeCompanyId))
          )
        }

        for (let i = 0; i < writePlan.inserts.length; i += BATCH_SIZE) {
          const chunk = writePlan.inserts.slice(i, i + BATCH_SIZE)
          await Promise.all(
            chunk.map(item => fbSet(
              `hr/attendanceLogs/${item.id}`,
              item.data,
              activeCompanyId
            ))
          )
          count += chunk.length
        }

        // Bản SpeeGo gốc lưu chấm công trong hr_records. Không đồng bộ sang
        // các bảng multi-company để giữ nguyên schema và dữ liệu hiện có.

        const updateMsg = writePlan.updates.length ? ` Cập nhật lại ${writePlan.updates.length} dòng.` : ''
        alert(
          `Đã import ${count} dòng mới.${updateMsg}` +
          `${createdEmployeeCount ? ` Đã tạo ${createdEmployeeCount} hồ sơ nhân viên mới từ file.` : ''}` +
          `${skippedCount ? ` Bỏ qua ${skippedCount} dòng đã có.` : ''}`
        )
      }

      const confirmedMappings = Object.fromEntries(
        previewData.matchGroups
          .map(group => {
            const createdEmployee = createdEmployeesBySourceKey.get(group.key)
            const employeeId = createdEmployee?.id || group.selectedEmployeeId
            if (
              !group.mappingKey || !employeeId ||
              employeeId === '__skip__' || employeeId === '__create__'
            ) return null
            return [group.mappingKey, {
            employeeId,
            sourceCode: group.sourceCode || '',
            sourceName: group.sourceName || '',
            confirmedAt: new Date().toISOString(),
            confirmedBy: user?.id || ''
          }]
          })
          .filter(Boolean)
      )
      if (Object.keys(confirmedMappings).length > 0) {
        await fbUpdate('hr/attendanceEmployeeMappings/default', confirmedMappings)
      }
      if (previewData.mappingTemplate?.key && previewData.mappingTemplate?.value) {
        await fbUpdate('hr/attendanceImportMappingTemplates/default', {
          [previewData.mappingTemplate.key]: previewData.mappingTemplate.value
        })
      }
      await fbUpdate(`hr/attendanceImportJobs/${importJobId}`, {
        status: 'attendance-committed',
        insertedCount: count,
        skippedCount,
        createdEmployeeCount,
        attendanceCommittedAt: new Date().toISOString()
      })
      const synchronization = await onSave({
        primaryMonth: previewData.importMonth || importMonth,
        affectedMonths: previewData.affectedMonths || [previewData.importMonth || importMonth]
      })
      await fbUpdate(`hr/attendanceImportJobs/${importJobId}`, synchronization?.summaryStatus === 'failed'
        ? {
            status: 'attendance-committed',
            summaryStatus: 'failed',
            summaryError: synchronization.error || 'Không tổng hợp được bảng công'
          }
        : {
            status: 'complete',
            summaryStatus: 'complete',
            completedAt: new Date().toISOString()
          })
      onClose()
      setFile(null)
      setReferenceImage(null)
      setPreviewData(null)
      setManualMapping(null)
      setMonthlySheetSelection(null)
    } catch (error) {
      const failedJobId = previewData?.importJobId
      if (failedJobId) {
        try {
          await fbUpdate(`hr/attendanceImportJobs/${failedJobId}`, {
            status: 'failed',
            error: error.message || String(error),
            failedAt: new Date().toISOString()
          })
        } catch (jobError) {
          console.warn('Không cập nhật được trạng thái phiên import:', jobError)
        }
      }
      alert('Lỗi khi lưu dữ liệu: ' + error.message)
    } finally {
      importInProgressRef.current = false
      setLoading(false)
    }
  }

  const formatExportTime = value => formatAttendanceTime(value) || String(value || '')

  const downloadMatchedExcel = () => {
    if (!previewData?.logs?.length) return
    const groupByKey = new Map(
      previewData.matchGroups.map(group => [group.key, group])
    )
    const skippedSourceKeys = new Set(
      previewData.matchGroups
        .filter(group => group.status === 'skipped')
        .map(group => group.key)
    )
    const rows = previewData.logs
      .filter(log => !skippedSourceKeys.has(log._sourceEmployeeKey))
      .map((log, index) => {
      const group = groupByKey.get(log._sourceEmployeeKey)
      return {
        STT: index + 1,
        'Công ty': companyName || 'Công ty chưa khai báo',
        'Mã nguồn': log.sourceEmployeeCode || '',
        'Tên nguồn': log.sourceEmployeeName || '',
        'Mã N.Viên Lumi': log.employeeCode || '',
        'Tên nhân viên Lumi': log.employeeName || '',
        'Tên theo máy chấm công':
          log.machineName || log.tenTheoMayChamCong || '',
        'Phòng ban': log.department || '',
        'Chức vụ': log.position || '',
        'Ngày': String(log.date || '').slice(0, 10),
        'Thứ': log.dayOfWeek || '',
        'Vào': formatExportTime(log.vao || log.checkIn),
        'Ra': formatExportTime(log.ra || log.checkOut),
        'Công': log.cong ?? '',
        'Giờ': log.hours ?? log.gio ?? '',
        'Công+': log.congPlus ?? '',
        'Giờ+': log.gioPlus ?? '',
        'Vào trễ': log.lateMinutes ?? log.vaoTre ?? '',
        'Ra sớm': log.earlyMinutes ?? log.raSom ?? '',
        TC1: log.tc1 ?? '',
        TC2: log.tc2 ?? '',
        TC3: log.tc3 ?? '',
        'Tên ca': log.shiftName || log.tenCa || '',
        'Kí hiệu': log.kyHieu || log.status || '',
        'Kí hiệu+': log.kyHieuPlus || '',
        'Tổng giờ': log.tongGio ?? '',
        'Độ giống tên/mã': group ? `${Math.round(group.confidence * 100)}%` : '',
        'Cách đối sánh': group?.method || ''
      }
      })
    const worksheet = utils.json_to_sheet(rows)
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, worksheet, 'ChamCongDaKhop')
    writeFile(
      workbook,
      `Cham_cong_da_khop_${importMonth || new Date().toISOString().slice(0, 7)}.xlsx`
    )
  }

  const downloadNewTemplate = () => {
    const headers = [
      'Mã N.Viên', 'Tên nhân viên', 'Tên theo máy chấm công', 'Phòng ban', 'Chức vụ', 'Ngày', 'Thứ',
      'Vào', 'Ra', 'Công', 'Giờ', 'Công+', 'Giờ+', 'Vào trễ', 'Ra sớm',
      'TC1', 'TC2', 'TC3', 'Tên ca', 'Kí hiệu', 'Kí hiệu+', 'Tổng giờ'
    ]
    const sample = [
      ['NV001', 'Nguyễn Văn A', 'Nguyen Van A', 'Kế toán', 'Nhân viên', '2026-05-01', 'Thứ 6', '08:00', '17:30', 1, 8, 0, 0, 0, 0, 0, 0, 0, 'Ca full', 'X', '', 8],
      ['NV001', 'Nguyễn Văn A', 'Nguyen Van A', 'Kế toán', 'Nhân viên', '2026-05-02', 'Thứ 7', '07:55', '17:35', 1, 8, 0.5, 1, 0, 0, 0, 0, 0, 'Ca full', 'X', 'TC', 9]
    ]
    const ws = utils.aoa_to_sheet([headers, ...sample])
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'ChamCong')
    writeFile(wb, 'Mau_nhap_cham_cong.xlsx')
  }

  const handleClose = () => {
    setFile(null)
    setReferenceImage(null)
    setPreviewData(null)
    setShowAllMatches(false)
    setShowDailyPreview(false)
    setVisibleLogCount(30)
    setManualMapping(null)
    setMonthlySheetSelection(null)
    onClose()
  }

  if (!isOpen) return null

  const matchedEmployeeCount =
    previewData?.matchGroups?.filter(
      group =>
        group.selectedEmployeeId &&
        group.status !== 'skipped' &&
        group.status !== 'create'
    ).length || 0
  const newEmployeeCount =
    previewData?.matchGroups?.filter(group => group.status === 'create').length || 0
  const skippedEmployeeCount =
    previewData?.matchGroups?.filter(group => group.status === 'skipped').length || 0
  const unresolvedEmployeeCount =
    (previewData?.matchGroups?.length || 0) -
    matchedEmployeeCount -
    newEmployeeCount -
    skippedEmployeeCount
  const selectionIssues = validateMonthlyAttendanceSelection(previewData, employees, activeCompanyId)
  const selectedManualSheet = manualMapping?.sheets?.find(
    sheet => sheet.sheetName === manualMapping.sheetName
  )
  const manualColumnCount = selectedManualSheet?.rows
    ?.slice(manualMapping?.headerRow || 0, (manualMapping?.headerRow || 0) + 101)
    .reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0) || 0
  const manualHeaders = Array.from(
    { length: manualColumnCount },
    (_, index) => selectedManualSheet?.rows?.[manualMapping?.headerRow]?.[index] ?? ''
  )
  const manualSampleRows = selectedManualSheet?.rows?.slice(
    (manualMapping?.headerRow || 0) + 1,
    (manualMapping?.headerRow || 0) + 4
  ) || []
  const previewGroupByKey = new Map(
    (previewData?.matchGroups || []).map(group => [group.key, group])
  )
  const groupsNeedingReview = (previewData?.matchGroups || []).filter(group =>
    (group.status === 'review' || !group.selectedEmployeeId) &&
    group.status !== 'create' && group.status !== 'skipped'
  )
  const displayedMatchGroups = showAllMatches
    ? (previewData?.matchGroups || [])
    : groupsNeedingReview
  const previewDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '-'
  }

  return (
    <div className="modal show" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-file-excel"></i>
            {' Import bảng công tháng'}
          </h3>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>
        <div className="modal-body">
          {!previewData ? (
            <>
              <div style={{ padding: '10px 12px', marginBottom: '12px', background: '#eff6ff', borderRadius: '6px', color: '#1e40af' }}>
                Hỗ trợ Excel “Bảng công tháng” hoặc “Chi tiết chấm công”. Với file chi tiết, chỉ giờ vào/ra được dùng để tính công; không lấy số Công, Giờ, Muộn hay TC trong Excel.
              </div>
              {SUPPORTED_ATTENDANCE_IMPORT_MODE !== 'monthly_matrix_only' && <div className="form-group">
                <label>Chi nhánh ưu tiên khi trùng tên</label>
                <select
                  value={matchBranch}
                  onChange={(e) => setMatchBranch(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
                >
                  <option value="">Tất cả chi nhánh</option>
                  {availableBranches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>}
              <div className="form-group">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    minHeight: '62px',
                    padding: '16px 18px',
                    border: '2px dashed #f59e0b',
                    borderRadius: '12px',
                    background: '#fffaf0',
                    cursor: 'pointer',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: '#b45309',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <span>
                    <i className="fas fa-file-excel" style={{ marginRight: '10px' }}></i>
                    Tải Excel lên
                  </span>
                </label>
                {file && <div style={{ marginTop: '6px', color: '#475569' }}>Đã chọn: {file.name}</div>}
              </div>
              {monthlySheetSelection && (
                <div style={{ marginTop: '14px', padding: '14px', border: '1px solid #60a5fa', borderRadius: '8px', background: '#eff6ff' }}>
                  <strong>Đã nhận diện nhiều sheet {monthlySheetSelection.kindLabel || 'Bảng công'} — hãy chọn sheet cần import</strong>
                  <select
                    value={monthlySheetSelection.selectedSheetName}
                    onChange={event => setMonthlySheetSelection(previous => ({
                      ...previous,
                      selectedSheetName: event.target.value
                    }))}
                    style={{ width: '100%', padding: '9px', marginTop: '10px' }}
                  >
                    <option value="">-- Chọn sheet --</option>
                    {monthlySheetSelection.candidates.map(candidate => (
                      <option key={candidate.name} value={candidate.name}>
                        {candidate.name} — {candidate.yearMonth || 'chưa rõ tháng'} — {candidate.employeeCount} nhân viên
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              <h4>Đã nhận diện: {previewData.detectedFormatLabel || 'Bảng công tháng'}</h4>
              <ul>
                <li>
                  <strong>Sheet:</strong>{' '}
                  {previewData.availableSheets?.length > 1 ? (
                    <select
                      value={previewData.sourceSheetName || ''}
                      disabled={loading}
                      onChange={event => {
                        const sheetName = event.target.value
                        setPreviewData(null)
                        handlePreview({ sheetName, autoOnly: true })
                      }}
                      style={{ padding: '4px 8px' }}
                    >
                      {previewData.availableSheets.map(sheet => (
                        <option key={sheet.name} value={sheet.name}>
                          {sheet.name}
                        </option>
                      ))}
                    </select>
                  ) : (previewData.sourceSheetName || '-')}
                </li>
                <li><strong>Tháng/Năm:</strong> {previewData.importMonth?.split('-').reverse().join('/') || '-'}</li>
                <li><strong>Số nhân viên trong file:</strong> {previewData.employeeCount}</li>
                <li><strong>Số ngày:</strong> {previewData.dayCount}</li>
                <li><strong>Số dòng attendance dự kiến:</strong> {previewData.expectedAttendanceCount}</li>
                {previewData.ignoredDayCount > 0 && (
                  <li style={{ color: '#475569' }}>
                    <strong>Cột ngoài tháng đã bỏ qua:</strong> {previewData.ignoredDayCount}
                  </li>
                )}
                <li style={{ color: '#15803d' }}>
                  <strong>Đã ghép nhân viên:</strong> {matchedEmployeeCount}
                </li>
                {newEmployeeCount > 0 && (
                  <li style={{ color: '#0369a1' }}>
                    <strong>Sẽ tạo hồ sơ mới từ file:</strong> {newEmployeeCount}
                  </li>
                )}
                <li style={{ color: unresolvedEmployeeCount ? '#b91c1c' : '#15803d' }}>
                  <strong>Cần kiểm tra:</strong> {unresolvedEmployeeCount}
                </li>
                {skippedEmployeeCount > 0 && (
                  <li style={{ color: '#6b7280' }}>
                    <strong>Chủ động bỏ qua:</strong> {skippedEmployeeCount}
                  </li>
                )}
                {previewData.warnings?.length > 0 && (
                  <li style={{ color: '#b45309' }}>
                    <strong>Cảnh báo:</strong> {previewData.warnings.length}
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      {previewData.warnings.slice(0, 5).map((warning, index) => <div key={index}>{warning}</div>)}
                    </div>
                  </li>
                )}
                {previewData.skipped?.length > 0 && (
                  <li style={{ color: '#b45309' }}>
                    <strong>Lỗi dữ liệu cần sửa:</strong> {previewData.skipped.length} ô/dòng
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      {previewData.skipped.slice(0, 5).map((s, i) => <div key={i}>{s}</div>)}
                    </div>
                  </li>
                )}
              </ul>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '10px'
                }}
              >
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={downloadMatchedExcel}
                  disabled={unresolvedEmployeeCount > 0}
                >
                  <i className="fas fa-file-excel"></i>
                  {' Xuất Excel đã khớp'}
                </button>
              </div>

              <div style={{ marginTop: '10px' }}>
                <strong>{previewData.isDetailedAttendanceList
                  ? 'Khớp nhân viên theo Mã + Họ tên:'
                  : 'Khớp nhân viên theo Họ tên + Bộ phận:'}</strong>
                <span style={{ marginLeft: 8, color: '#475569' }}>
                  {groupsNeedingReview.length
                    ? `${groupsNeedingReview.length} nhân viên cần chọn thủ công`
                    : `Đã xử lý ${previewData.matchGroups.length} nhân viên`}
                </span>
                <button type="button" className="btn" style={{ marginLeft: 8, padding: '4px 8px' }} onClick={() => setShowAllMatches(value => !value)}>
                  {showAllMatches ? 'Chỉ xem cần kiểm tra' : 'Xem tất cả nhân viên'}
                </button>
                {selectionIssues.length > 0 && (
                  <div role="alert" style={{ color: '#b91c1c', marginTop: '6px' }}>
                    {selectionIssues.slice(0, 5).map((issue, index) => <div key={index}>{issue}</div>)}
                  </div>
                )}
              </div>
              {displayedMatchGroups.length > 0 && <div
                style={{
                  maxHeight: '300px',
                  overflow: 'auto',
                  marginTop: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: '#fff'
                }}
              >
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#eee', position: 'sticky', top: 0, zIndex: 2 }}>
                      <th style={{ padding: '6px' }}>Tên trong file</th>
                      <th style={{ padding: '6px' }}>Bộ phận trong file</th>
                      <th style={{ padding: '6px' }}>Hồ sơ SpeeGo</th>
                      <th style={{ padding: '6px' }}>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedMatchGroups.map(group => {
                      const suggestedEmployee = employeesById.get(String(group.suggestedEmployeeId))
                      const selectedEmployee = employeesById.get(String(group.selectedEmployeeId))
                      const statusColor = group.status === 'skipped'
                        ? '#6b7280'
                        : group.status === 'create'
                          ? '#0369a1'
                        : group.selectedEmployeeId
                          ? '#15803d'
                        : group.status === 'review'
                          ? '#b45309'
                          : '#b91c1c'
                      return (
                        <tr key={group.key} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '6px' }}>
                            <strong>{group.sourceName || '-'}</strong>
                            <div style={{ color: '#6b7280' }}>{group.rowCount} ngày có dữ liệu</div>
                          </td>
                          <td style={{ padding: '6px' }}>{group.sourceDepartment || '-'}</td>
                          <td style={{ padding: '6px', minWidth: '260px' }}>
                            <select
                              value={group.selectedEmployeeId}
                              onChange={(e) => handleMatchChange(group.key, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '7px',
                                borderColor: group.selectedEmployeeId ? '#86efac' : '#fca5a5'
                              }}
                            >
                              <option value="">-- Chọn nhân viên SpeeGo --</option>
                              {canCreateEmployees && (
                                (!previewData.isMonthlyMatrix && !previewData.isDetailedAttendanceList) ||
                                group.candidates.length === 0
                              ) && (
                                <option value="__create__">-- Tạo hồ sơ mới từ tên trong file --</option>
                              )}
                              <option value="__skip__">-- Không có trong SpeeGo (bỏ qua) --</option>
                              {(previewData.isMonthlyMatrix || previewData.isDetailedAttendanceList
                                ? group.candidates.map(candidate => candidate.employee)
                                : employeesForMatching).map(employee => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.ho_va_ten || employee.name || employee.id}
                                  {employee.employeeId || employee.username
                                    ? ` (${employee.employeeId || employee.username})`
                                    : ''}
                                  {employee.bo_phan || employee.department ? ` — ${employee.bo_phan || employee.department}` : ''}
                                </option>
                              ))}
                            </select>
                            {!previewData.isMonthlyMatrix && !previewData.isDetailedAttendanceList && (!group.selectedEmployeeId || group.status === 'create') && suggestedEmployee && (
                              <div style={{ color: '#b45309', marginTop: '3px' }}>
                                Gợi ý gần nhất: {suggestedEmployee.ho_va_ten || suggestedEmployee.name}
                                {group.status === 'create' ? ' (chọn nếu đây là cùng một người)' : ''}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '6px', color: statusColor }}>
                            <strong>
                              {group.status === 'skipped'
                                ? 'Sẽ bỏ qua'
                                : group.status === 'create'
                                  ? 'Sẽ tạo mới'
                                : group.selectedEmployeeId
                                  ? 'Đã ghép'
                                  : 'Cần chọn'}
                            </strong>
                            <div style={{ fontSize: '0.78rem' }}>{group.method}</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>}
              <div style={{ marginTop: '12px' }}>
                <button type="button" className="btn" onClick={() => setShowDailyPreview(value => !value)}>
                  {showDailyPreview ? 'Ẩn chi tiết theo ngày' : `Xem chi tiết theo ngày (${previewData.logs.length} dòng)`}
                </button>
              </div>
              {showDailyPreview && <div style={{ maxHeight: '260px', overflowY: 'auto', marginTop: '8px', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: '6px' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#eee' }}>
                      <th style={{ padding: '5px' }}>STT</th>
                      <th style={{ padding: '5px' }}>Tên nhân viên</th>
                      <th style={{ padding: '5px' }}>Bộ phận</th>
                      <th style={{ padding: '5px' }}>Ca</th>
                      <th style={{ padding: '5px' }}>Ngày</th>
                      {previewData.isDetailedAttendanceList ? (
                        <>
                          <th style={{ padding: '5px' }}>Giờ vào</th>
                          <th style={{ padding: '5px' }}>Giờ ra</th>
                        </>
                      ) : <th style={{ padding: '5px' }}>Giá trị công</th>}
                      <th style={{ padding: '5px' }}>Công</th>
                      <th style={{ padding: '5px' }}>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.logs.slice(0, visibleLogCount).map((log, index) => {
                      const group = previewGroupByKey.get(log._sourceEmployeeKey)
                      const matchStatus = group?.status === 'skipped'
                        ? 'Bỏ qua'
                        : group?.status === 'create'
                          ? 'Tạo mới'
                          : group?.selectedEmployeeId
                            ? 'Đã ghép'
                            : group?.status === 'review'
                              ? 'Cần kiểm tra'
                              : 'Chưa ghép'
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: '5px', textAlign: 'center' }}>{index + 1}</td>
                          <td style={{ padding: '5px' }}>{log.sourceEmployeeName || log.employeeName || '-'}</td>
                          <td style={{ padding: '5px' }}>{(log._sourceDepartment ?? log.department) || '-'}</td>
                          <td style={{ padding: '5px' }}>{log.shiftName || '-'}</td>
                          <td style={{ padding: '5px' }}>{previewDate(log.date)}</td>
                          {previewData.isDetailedAttendanceList ? (
                            <>
                              <td style={{ padding: '5px', textAlign: 'center' }}>{log.vao || '-'}</td>
                              <td style={{ padding: '5px', textAlign: 'center' }}>{log.ra || '-'}</td>
                            </>
                          ) : <td style={{ padding: '5px', textAlign: 'center' }}>{String(log.rawAttendanceValue ?? log.sourceSymbol ?? '')}</td>}
                          <td style={{ padding: '5px', textAlign: 'center' }}>{log.cong ?? '-'}</td>
                          <td style={{ padding: '5px' }}>{matchStatus}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>}
              {showDailyPreview && visibleLogCount < previewData.logs.length && (
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setVisibleLogCount(count => count + 100)}>
                  Xem thêm 100 dòng
                </button>
              )}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={handleClose}>Đóng</button>

            {!previewData ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handlePreview(
                  monthlySheetSelection?.selectedSheetName
                    ? { sheetName: monthlySheetSelection.selectedSheetName }
                    : null
                )}
                disabled={
                  loading ||
                  !file ||
                  Boolean(monthlySheetSelection && !monthlySheetSelection.selectedSheetName)
                }
              >
                {loading
                  ? <><i className="fas fa-spinner fa-spin"></i> Đang đọc file...</>
                  : monthlySheetSelection ? 'Phân tích sheet đã chọn >' : 'Phân tích & khớp dữ liệu >'}
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setPreviewData(null)}>{'< Quay lại'}</button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={executeImport}
                  disabled={loading || unresolvedEmployeeCount > 0 || selectionIssues.length > 0 || previewData.blockingIssues?.length > 0}
                  title={
                    unresolvedEmployeeCount > 0
                      ? 'Cần ghép, tạo mới hoặc bỏ qua toàn bộ nhân viên trước khi ghi CSDL'
                      : ''
                  }
                >
                  {loading
                    ? <><i className="fas fa-spinner fa-spin"></i> Đang lưu...</>
                    : <><i className="fas fa-check"></i> {previewData.isReconcileMode ? 'Cập nhật CSDL Lumi' : 'Xác nhận Import'}</>}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AttendanceImportModal
