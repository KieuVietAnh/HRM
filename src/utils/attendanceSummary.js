import { buildSourceEmployeeKey } from './attendanceMatching.js'
import { departmentForAttendanceSummary } from './attendanceDepartment.js'
import {
  applyCalculatedAttendanceTiming,
  attendanceTimeToMinutes,
  calculateAttendanceTiming,
  formatAttendanceTime,
  resolveAttendanceShift
} from './attendanceShift.js'
import {
  calculateAttendanceMetrics,
  getAttendanceHoliday,
  roundDecimal,
  STANDARD_WORK_MINUTES
} from './attendanceCalculations.js'

const numberValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const attendancePunchPairs = log => {
  if (Array.isArray(log?.punchPairs) && log.punchPairs.length) {
    return log.punchPairs
      .map(pair => ({
        checkIn: formatAttendanceTime(pair?.checkIn),
        checkOut: formatAttendanceTime(pair?.checkOut),
        checkInTimestamp: pair?.checkInTimestamp || pair?.checkInAt || '',
        checkOutTimestamp: pair?.checkOutTimestamp || pair?.checkOutAt || '',
        shiftId: String(pair?.shiftId || log?.shiftId || ''),
        shiftName: String(pair?.shiftName || log?.shiftName || log?.tenCa || ''),
        lateMinutes: pair?.lateMinutes,
        earlyMinutes: pair?.earlyMinutes
      }))
      .filter(pair => pair.checkIn || pair.checkOut)
  }
  const punches = Array.isArray(log?.punches)
    ? log.punches.map(formatAttendanceTime).filter(Boolean)
    : []
  if (punches.length < 4) {
    const checkIn = formatAttendanceTime(log?.checkIn || log?.vao)
    const checkOut = formatAttendanceTime(log?.checkOut || log?.ra)
    return checkIn || checkOut ? [{ checkIn, checkOut }] : []
  }
  const pairs = []
  for (let index = 0; index < punches.length; index += 2) {
    pairs.push({
      checkIn: punches[index] || '',
      checkOut: punches[index + 1] || '',
      shiftId: String(log?.shiftId || ''),
      shiftName: String(log?.shiftName || log?.tenCa || '')
    })
  }
  return pairs
}

export const attendanceDateString = (log) => {
  if (log?.date) return String(log.date).slice(0, 10)
  if (!log?.timestamp) return ''
  const date = new Date(log.timestamp)
  return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

const hasNumericValue = (value) =>
  value !== '' &&
  value !== null &&
  value !== undefined &&
  Number.isFinite(Number(value))

export const summarizeAttendanceDay = (logs, employee = {}, attendanceSettings = {}, date = '') => {
  let hours = 0
  let workdays = 0
  let extraWorkdays = 0
  let overtimeHours = 0
  let paidLeaveWorkdays = 0
  let lateMinutes = 0
  let earlyMinutes = 0
  let onlineWorkdays = 0
  let offlineWorkdays = 0
  let sourceHours = 0
  const actualPunchGroups = new Map()
  const observedPunches = []
  let hasSourceWorkday = false
  let hasPunch = false
  let missingPunch = false
  let unapprovedAbsence = false
  let checkIn = ''
  let checkOut = ''
  let shiftName = ''
  const shiftNames = new Set()
  let calculationMode = 'full-day'
  let splitShiftBreakdown = []
  const sampleLog = logs[0] || {}
  const resolvedShift = resolveAttendanceShift(employee, sampleLog, attendanceSettings)
  const standardCheckIn = formatAttendanceTime(resolvedShift?.start || resolvedShift?.standardCheckIn)
  const standardCheckOut = formatAttendanceTime(resolvedShift?.end || resolvedShift?.standardCheckOut)

  logs.forEach(sourceLog => {
    const preservesSourceValues = ['source-value', 'matrix-value'].includes(sourceLog.calculationMode)
    const log = preservesSourceValues || (Array.isArray(sourceLog.punchPairs) && sourceLog.punchPairs.length)
      ? sourceLog
      : applyCalculatedAttendanceTiming(sourceLog, employee, attendanceSettings)
    const logHours = numberValue(log.hours ?? log.soGio ?? log.gio ?? log.tongGio ?? (
      numberValue(log.hours ?? log.soGio ?? log.gio) +
      numberValue(log.gioPlus)
    ))
    sourceHours += Math.max(0, logHours)
    const isSyntheticPunch = Boolean(log.syntheticPunch || log.isDerivedFromCode)
    const logPairs = isSyntheticPunch ? [] : attendancePunchPairs(log)
    const logCheckIn = logPairs.find(pair => pair.checkIn)?.checkIn || formatAttendanceTime(log.checkIn || log.vao)
    const logCheckOut = [...logPairs].reverse().find(pair => pair.checkOut)?.checkOut || formatAttendanceTime(log.checkOut || log.ra)
    const hasCheckIn = Boolean(logCheckIn)
    const hasCheckOut = Boolean(logCheckOut)
    const useSourceValues = ['source-value', 'matrix-value'].includes(log.calculationMode)
    if (useSourceValues) calculationMode = log.calculationMode
    if (!isSyntheticPunch) {
      if (useSourceValues || !logPairs.length) {
        lateMinutes += numberValue(log.lateMinutes ?? log.vaoTre)
        earlyMinutes += numberValue(log.earlyMinutes ?? log.raSom)
      } else {
        const firstCheckInIndex = logPairs.findIndex(pair => Boolean(pair.checkIn))
        const lastCheckOutIndex = logPairs.reduce((lastIndex, pair, index) => pair.checkOut ? index : lastIndex, -1)
        logPairs.forEach((pair, index) => {
          const timing = () => calculateAttendanceTiming({
            employee,
            log: {
              ...log,
              shiftId: pair.shiftId || log.shiftId,
              shiftName: pair.shiftName || log.shiftName || log.tenCa
            },
            checkIn: pair.checkIn,
            checkOut: pair.checkOut,
            attendanceSettings
          })
          lateMinutes += index === firstCheckInIndex && pair.lateMinutes !== null && pair.lateMinutes !== undefined && pair.lateMinutes !== ''
            ? numberValue(pair.lateMinutes)
            : index === firstCheckInIndex && pair.checkIn ? numberValue(timing().lateMinutes) : 0
          earlyMinutes += index === lastCheckOutIndex && pair.earlyMinutes !== null && pair.earlyMinutes !== undefined && pair.earlyMinutes !== ''
            ? numberValue(pair.earlyMinutes)
            : index === lastCheckOutIndex && pair.checkOut ? numberValue(timing().earlyMinutes) : 0
        })
      }
    }
    if (!isSyntheticPunch && !useSourceValues) {
      const groupsUpdatedFromLog = new Set()
      logPairs.forEach(pair => {
        if (pair.checkIn) observedPunches.push({ time: pair.checkIn, timestamp: pair.checkInTimestamp, action: 'in' })
        if (pair.checkOut) observedPunches.push({ time: pair.checkOut, timestamp: pair.checkOutTimestamp, action: 'out' })
        if (pair.checkIn || pair.checkOut) {
          const groupKey = pair.shiftId || pair.shiftName || log.shiftId || log.shiftName || log.tenCa || '__day__'
          const group = actualPunchGroups.get(groupKey) || {
            pairs: [],
            log: {
              shiftId: pair.shiftId || log.shiftId,
              shiftName: pair.shiftName || log.shiftName || log.tenCa,
              standardCheckIn: log.standardCheckIn,
              standardCheckOut: log.standardCheckOut
            },
            shiftName: pair.shiftName || log.shiftName || log.tenCa
          }
          group.pairs.push(pair)
          if (!groupsUpdatedFromLog.has(groupKey)) {
            group.log.tc1 = numberValue(group.log.tc1) + numberValue(log.tc1)
            group.log.tc2 = numberValue(group.log.tc2) + numberValue(log.tc2)
            group.log.tc3 = numberValue(group.log.tc3) + numberValue(log.tc3)
            group.log.overtimeAutoDisabled = group.log.overtimeAutoDisabled || Boolean(log.overtimeAutoDisabled)
            groupsUpdatedFromLog.add(groupKey)
          }
          actualPunchGroups.set(groupKey, group)
        }
      })
    }
    if (!isSyntheticPunch && logPairs.some(pair => Boolean(pair.checkIn) !== Boolean(pair.checkOut))) missingPunch = true
    const logShiftName = String(log.shiftName || log.tenCa || resolvedShift?.name || '').trim()
    if (logShiftName) shiftNames.add(logShiftName)
    if (!shiftName) shiftName = logShiftName
    const status = String(log.kyHieu || log.status || '').trim().toUpperCase()
    const logWorkdays =
      numberValue(log.cong) + numberValue(log.congPlus)
    const isSourcePaidLeave =
      !hasCheckIn &&
      !hasCheckOut &&
      numberValue(log.congPlus) > 0 &&
      String(log.kyHieuPlus || status).trim().toUpperCase() === 'V'
    const isMatrixPaidLeave =
      !hasCheckIn &&
      !hasCheckOut &&
      ['P1', 'P'].includes(status) &&
      numberValue(log.cong) > 0
    const workMode = String(
      log.workMode || log.workLocation || log.hinhThucLamViec || ''
    ).toLowerCase()

    hasPunch = hasPunch || (!isSyntheticPunch && (hasCheckIn || hasCheckOut))
    missingPunch =
      missingPunch ||
      status === 'KR' ||
      status === 'KV'
    unapprovedAbsence =
      unapprovedAbsence ||
      ['NP', 'VẮNG', 'VANG', 'NGHỈ KHÔNG PHÉP'].includes(status)
    if (isSourcePaidLeave) {
      paidLeaveWorkdays += numberValue(log.congPlus)
    } else if (isMatrixPaidLeave) {
      paidLeaveWorkdays += numberValue(log.cong)
    }

    if (workMode.includes('online') || workMode.includes('remote')) {
      onlineWorkdays += logWorkdays
    } else if (
      workMode.includes('offline') ||
      workMode.includes('onsite') ||
      workMode.includes('tại văn phòng')
    ) {
      offlineWorkdays += logWorkdays
    }

    // Khi có Vào/Ra thật, Công phải được tính lại từ số phút; chỉ giữ cong
    // nguồn cho dòng mã công không có cặp punch.
    if (hasNumericValue(log.cong) && (useSourceValues || !hasCheckIn || !hasCheckOut || isSyntheticPunch)) {
      workdays += numberValue(log.cong)
      hasSourceWorkday = true
    }
    if (hasNumericValue(log.congPlus)) {
      extraWorkdays += numberValue(log.congPlus)
      hasSourceWorkday = true
    }
  })

  const standardMinutes = Number(attendanceSettings.standardWorkMinutes) > 0
    ? Number(attendanceSettings.standardWorkMinutes)
    : STANDARD_WORK_MINUTES
  const breakMinutes = Number(attendanceSettings.unpaidBreakMinutes) >= 0
    ? Number(attendanceSettings.unpaidBreakMinutes)
    : 0
  const autoCalculateOvertime = attendanceSettings?.overtime?.autoCalculate !== false
  if (actualPunchGroups.size > 0) {
    actualPunchGroups.forEach(group => {
      const sortShift = resolveAttendanceShift(employee, {
        ...group.log,
        vao: group.pairs[0]?.checkIn,
        shiftName: group.shiftName || logs[0]?.shiftName,
        shiftId: group.pairs[0]?.shiftId
      }, attendanceSettings)
      const shiftStart = attendanceTimeToMinutes(sortShift.start)
      const shiftEnd = attendanceTimeToMinutes(sortShift.end)
      const overnight = shiftStart !== null && shiftEnd !== null && shiftEnd <= shiftStart
      const orderedPairs = group.pairs.slice().sort((left, right) => {
        const leftAt = Date.parse(left.checkInTimestamp || left.checkOutTimestamp || '')
        const rightAt = Date.parse(right.checkInTimestamp || right.checkOutTimestamp || '')
        if (Number.isFinite(leftAt) && Number.isFinite(rightAt)) return leftAt - rightAt
        const leftTime = attendanceTimeToMinutes(left.checkIn || left.checkOut) ?? 0
        const rightTime = attendanceTimeToMinutes(right.checkIn || right.checkOut) ?? 0
        return (leftTime + (overnight && leftTime < shiftStart ? 1440 : 0)) -
          (rightTime + (overnight && rightTime < shiftStart ? 1440 : 0))
      })
      const firstPunch = orderedPairs.find(pair => pair.checkIn) || orderedPairs[0]
      const lastPunch = [...orderedPairs].reverse().find(pair => pair.checkOut) || orderedPairs[orderedPairs.length - 1]
      const groupShift = resolveAttendanceShift(employee, {
        ...group.log,
        vao: firstPunch.checkIn,
        shiftName: group.shiftName || logs[0]?.shiftName,
        shiftId: group.pairs[0]?.shiftId
      }, attendanceSettings)
      const metrics = calculateAttendanceMetrics({
        log: group.log,
        checkIn: firstPunch.checkIn,
        checkOut: lastPunch.checkOut,
        standardMinutes,
        breakMinutes,
        autoCalculateOvertime,
        punchPairs: orderedPairs,
        splitShift: groupShift?.splitShift
      })
      hours += metrics.hours
      workdays += metrics.regularWorkdays
      overtimeHours += metrics.overtimeHours
      calculationMode = metrics.calculationMode || calculationMode
      if (metrics.splitShiftBreakdown?.length) splitShiftBreakdown.push(...metrics.splitShiftBreakdown)
    })

    const observedWithTimestamp = observedPunches.filter(punch => Number.isFinite(Date.parse(punch.timestamp || '')))
    if (observedWithTimestamp.length) {
      observedWithTimestamp.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
      checkIn = observedWithTimestamp.find(punch => punch.action === 'in')?.time || ''
      checkOut = [...observedWithTimestamp].reverse().find(punch => punch.action === 'out')?.time || ''
    } else {
      checkIn = observedPunches.find(punch => punch.action === 'in')?.time || ''
      checkOut = [...observedPunches].reverse().find(punch => punch.action === 'out')?.time || ''
    }
  } else if (!hasSourceWorkday) {
    const metrics = calculateAttendanceMetrics({
      log: logs[0] || {},
      standardMinutes,
      breakMinutes,
      autoCalculateOvertime,
      fallbackHours: sourceHours
    })
    hours = metrics.hours
    workdays = metrics.regularWorkdays
    overtimeHours = metrics.overtimeHours
  } else {
    hours = sourceHours
    overtimeHours = logs.reduce((sum, log) => sum +
      numberValue(log.tc1) + numberValue(log.tc2) + numberValue(log.tc3), 0)
  }

  const holiday = getAttendanceHoliday(date, attendanceSettings)
  const hoursExact = Math.max(0, hours)
  // Muộn/sớm < 60 phút: chỉ ghi phút để phạt, không trừ công.
  // ≥ 60 phút: giữ công theo giờ thực tế (đã bị giảm do đi muộn/về sớm).
  const lateEarlyTotal = Math.max(0, lateMinutes) + Math.max(0, earlyMinutes)
  const LATE_EARLY_WORKDAY_THRESHOLD = 60
  let regularWorkdaysExact = Math.max(0, workdays)
  if (
    hasPunch &&
    lateEarlyTotal > 0 &&
    lateEarlyTotal < LATE_EARLY_WORKDAY_THRESHOLD &&
    !['source-value', 'matrix-value'].includes(calculationMode)
  ) {
    const standardMinutes = Number(attendanceSettings.standardWorkMinutes) > 0
      ? Number(attendanceSettings.standardWorkMinutes)
      : STANDARD_WORK_MINUTES
    const workedMinutes = Math.max(0, hoursExact * 60)
    const forgivenMinutes = Math.min(workedMinutes + lateEarlyTotal, standardMinutes)
    regularWorkdaysExact = Math.max(regularWorkdaysExact, forgivenMinutes / Math.max(1, standardMinutes))
  }
  const extraWorkdaysExact = Math.max(0, extraWorkdays)
  const dayWorkdaysExact = regularWorkdaysExact + extraWorkdaysExact
  const isOnlineDay = logs.some(log => {
    const mode = String(
      log.workMode || log.workLocation || log.hinhThucLamViec || ''
    ).toLowerCase()
    return mode.includes('online') || mode.includes('remote') || String(log.source || '') === 'employee-online'
  })
  // Online days should count against the recalculated workdays, not only the
  // stored cong field (which stays 0 until check-out completes).
  const resolvedOnlineWorkdays = isOnlineDay
    ? Math.max(onlineWorkdays, dayWorkdaysExact)
    : onlineWorkdays

  return {
    hoursExact,
    workdaysExact: dayWorkdaysExact,
    regularWorkdaysExact,
    extraWorkdaysExact,
    workedMinutes: Math.max(0, hoursExact * 60),
    regularMinutes: Math.min(Math.max(0, hoursExact * 60), standardMinutes),
    hours: roundDecimal(hoursExact),
    workdays: roundDecimal(dayWorkdaysExact),
    regularWorkdays: roundDecimal(regularWorkdaysExact),
    extraWorkdays: roundDecimal(extraWorkdaysExact),
    overtimeHours: roundDecimal(Math.max(0, overtimeHours)),
    paidLeaveWorkdays: roundDecimal(paidLeaveWorkdays),
    lateMinutes,
    earlyMinutes,
    late: lateMinutes > 0,
    early: earlyMinutes > 0,
    missingPunch,
    unapprovedAbsence,
    onlineWorkdays: Math.round(resolvedOnlineWorkdays * 100) / 100,
    offlineWorkdays: Math.round(offlineWorkdays * 100) / 100,
    hasPunch,
    checkIn,
    checkOut,
    standardCheckIn,
    standardCheckOut,
    shiftName: [...shiftNames].join(' / ') || shiftName || resolvedShift?.name || '',
    isHoliday: Boolean(holiday),
    holidayName: holiday?.name || '',
    holidayWorkdays: holiday ? roundDecimal(regularWorkdaysExact + extraWorkdaysExact) : 0,
    calculationMode,
    splitShiftBreakdown,
    logs
  }
}

export const buildDailyAttendanceMap = (
  attendanceLogs,
  month = '',
  employees = [],
  attendanceSettings = {}
) => {
  const grouped = new Map()
  const employeesById = new Map(
    employees.map(employee => [String(employee.id), employee])
  )

  attendanceLogs.forEach(log => {
    const rawEmployeeId = String(log.employeeId || '')
    const employeeId = rawEmployeeId.startsWith('external:')
      ? `external:${buildSourceEmployeeKey(
          log.sourceEmployeeCode || log.employeeCode || '',
          log.sourceEmployeeName || log.employeeName || log.machineName || ''
        )}`
      : rawEmployeeId
    if (!employeeId) return
    const date = attendanceDateString(log)
    if (!date) return
    const shift = resolveAttendanceShift(employeesById.get(employeeId) || {}, log, attendanceSettings)
    const shiftStart = attendanceTimeToMinutes(shift.start)
    const shiftEnd = attendanceTimeToMinutes(shift.end)
    const overnight = shiftStart !== null && shiftEnd !== null && shiftEnd <= shiftStart
    let workDate = date
    if (overnight) {
      const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
      if (dateParts) {
        const [year, monthNumber, day] = dateParts.slice(1).map(Number)
        const nextDate = new Date(Date.UTC(year, monthNumber - 1, day))
        if (nextDate.toISOString().slice(0, 10) === date) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1)
          workDate = nextDate.toISOString().slice(0, 10)
        }
      }
    }
    if (month && !workDate.startsWith(month)) return
    const key = `${employeeId}::${workDate}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(log)
  })

  // Ngày lễ đã cấu hình phải xuất hiện trên ma trận kể cả khi nhân viên
  // không có bản ghi chấm công. Các day summary rỗng này chỉ mang metadata
  // hiển thị, không tự cộng Công/Giờ/Tăng ca.
  const holidayDates = Array.from(new Set(
    (attendanceSettings.holidays || [])
      .map(item => typeof item === 'string' ? item.slice(0, 10) : String(item?.date || item?.day || '').slice(0, 10))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && (!month || date.startsWith(month)))
  ))
  employees.forEach(employee => {
    const employeeId = String(employee?.id || '')
    if (!employeeId) return
    holidayDates.forEach(date => {
      const key = `${employeeId}::${date}`
      if (!grouped.has(key)) grouped.set(key, [])
    })
  })

  return new Map(
    Array.from(grouped.entries()).map(([key, logs]) => [
      key,
      summarizeAttendanceDay(
        logs,
        employeesById.get(String(logs[0]?.employeeId || key.slice(0, key.lastIndexOf('::')))) || {},
        attendanceSettings,
        key.slice(key.lastIndexOf('::') + 2)
      )
    ])
  )
}

export const buildAttendanceSummary = ({
  attendanceLogs,
  employees,
  month,
  attendanceAdjustments = {},
  manualWorkdays = {},
  attendanceSettings = {}
}) => {
  if (!month) return []

  const employeesById = new Map(
    employees.map(employee => [String(employee.id), employee])
  )
  const dailyMap = buildDailyAttendanceMap(
    attendanceLogs,
    month,
    employees,
    attendanceSettings
  )
  const summaryByEmployee = new Map()

  const ensureSummaryRow = (employeeId, log = {}) => {
    if (summaryByEmployee.has(employeeId)) {
      return summaryByEmployee.get(employeeId)
    }
    const employee = employeesById.get(employeeId)
    const row = {
      employeeId,
      employeeCode:
        employee?.employeeId ||
        employee?.username ||
        log.employeeCode ||
        '',
      employeeName:
        employee?.ho_va_ten ||
        employee?.name ||
        log.employeeName ||
        log.sourceEmployeeName ||
        '',
      department:
        departmentForAttendanceSummary(log, employee),
      position:
        employee?.vi_tri ||
        employee?.position ||
        log.position ||
        '',
      branch:
        employee?.chi_nhanh ||
        employee?.branch ||
        '',
      shift:
        employee?.ca_lam_viec ||
        employee?.shift ||
        '',
      employmentStatus:
        employee?.trang_thai ||
        employee?.employmentStatus ||
        employee?.status ||
        '',
      contractType:
        employee?.loai_hop_dong ||
        employee?.contractType ||
        '',
      joinDate:
        employee?.ngay_vao_lam ||
        employee?.joinDate ||
        employee?.join_date ||
        '',
      officialDate:
        employee?.ngay_lam_chinh_thuc ||
        employee?.officialDate ||
        employee?.official_date ||
        '',
      lastWorkingDate:
        employee?.ngay_nghi_viec ||
        employee?.lastWorkingDate ||
        employee?.termination_date ||
        '',
      attendanceDays: 0,
      workdays: 0,
      actualWorkdays: 0,
      totalHours: 0,
      overtimeHours: 0,
      lateCount: 0,
      lateUnder30Count: 0,
      lateOver30Count: 0,
      lateMinutes: 0,
      earlyCount: 0,
      earlyUnder30Count: 0,
      earlyOver30Count: 0,
      earlyMinutes: 0,
      missingPunchCount: 0,
      unapprovedAbsenceCount: 0,
      probationWorkdays: 0,
      officialWorkdays: 0,
      paidLeaveWorkdays: 0,
      onlineWorkdays: 0,
      offlineWorkdays: 0,
      days: new Map()
    }
    summaryByEmployee.set(employeeId, row)
    return row
  }

  // Báo cáo nhân sự phải có cả người chưa phát sinh dữ liệu trong tháng.
  employees.forEach(employee => {
    if (employee?.id !== null && employee?.id !== undefined) {
      ensureSummaryRow(String(employee.id))
    }
  })

  dailyMap.forEach((daySummary, key) => {
    const separatorIndex = key.lastIndexOf('::')
    const employeeId = key.slice(0, separatorIndex)
    const date = key.slice(separatorIndex + 2)
    const log = daySummary.logs[0] || {}
    const row = ensureSummaryRow(employeeId, log)
    const matrixLog = daySummary.logs.find(item =>
      item.monthlyDepartment ||
      (item.importFormat === 'attendance-monthly-matrix' && item.sourceDepartment)
    )
    if (matrixLog) {
      row.department = departmentForAttendanceSummary(matrixLog, employeesById.get(employeeId))
    }
    row.days.set(date, daySummary)
  })

  // Bao phủ cả log của nhân viên ngoài danh sách hồ sơ (nếu có) để holiday
  // vẫn được ghi nhận trong snapshot; nhân viên có hồ sơ đã được xử lý ở
  // buildDailyAttendanceMap.
  const holidayDates = Array.from(new Set(
    (attendanceSettings.holidays || [])
      .map(item => typeof item === 'string' ? item.slice(0, 10) : String(item?.date || item?.day || '').slice(0, 10))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(month))
  ))
  if (holidayDates.length > 0) {
    summaryByEmployee.forEach(row => {
      const employee = employeesById.get(String(row.employeeId)) || {}
      holidayDates.forEach(date => {
        if (!row.days.has(date)) {
          row.days.set(date, summarizeAttendanceDay([], employee, attendanceSettings, date))
        }
      })
    })
  }

  const adjustedEmployeeIds = new Set([
    ...Object.keys(attendanceAdjustments || {}),
    ...Object.keys(manualWorkdays || {})
  ])
  adjustedEmployeeIds.forEach((employeeId) => {
    if (employeesById.has(String(employeeId))) {
      ensureSummaryRow(String(employeeId))
    }
  })

  summaryByEmployee.forEach(row => {
    const employee = employeesById.get(String(row.employeeId))
    // Ca làm luôn lấy từ Hồ sơ nhân sự khi đã ghép được nhân viên.
    if (employee) {
      row.shift = employee.ca_lam_viec || employee.shift || ''
      if (!row.employeeCode) {
        row.employeeCode = employee.employeeId || employee.username || row.employeeCode
      }
      if (!row.employeeName) {
        row.employeeName = employee.ho_va_ten || employee.name || row.employeeName
      }
      if (!row.department) {
        row.department = employee.bo_phan || employee.department || row.department
      }
    }

    const permissionDays = String(attendanceAdjustments[row.employeeId] || '')
      .split(',')
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(Number.isFinite)

    permissionDays.forEach(day => {
      const date = `${month}-${String(day).padStart(2, '0')}`
      const current = row.days.get(date) || summarizeAttendanceDay(
        [],
        employee || {},
        attendanceSettings,
        date
      )
      const paidLeaveWorkdays = numberValue(
        manualWorkdays[row.employeeId]?.[day] ??
        manualWorkdays[row.employeeId]?.[String(day)] ??
        1
      )
      row.days.set(date, {
        ...current,
        workdays: paidLeaveWorkdays,
        workdaysExact: paidLeaveWorkdays,
        regularWorkdays: paidLeaveWorkdays,
        regularWorkdaysExact: paidLeaveWorkdays,
        extraWorkdays: 0,
        extraWorkdaysExact: 0,
        paidLeaveWorkdays,
        unapprovedAbsence: false
      })
    })

    // Override công từng ngày do Kế toán/HR chỉnh tay (không chỉ ngày phép).
    const overrides = manualWorkdays[row.employeeId] || manualWorkdays[String(row.employeeId)] || {}
    Object.entries(overrides).forEach(([dayKey, rawValue]) => {
      const day = Number(dayKey)
      if (!Number.isFinite(day) || day < 1 || day > 31) return
      const date = `${month}-${String(day).padStart(2, '0')}`
      const current = row.days.get(date) || summarizeAttendanceDay(
        [],
        employee || {},
        attendanceSettings,
        date
      )
      const workdays = numberValue(rawValue)
      const isPaidLeaveDay = permissionDays.includes(day)
      row.days.set(date, {
        ...current,
        workdays,
        workdaysExact: workdays,
        regularWorkdays: workdays,
        regularWorkdaysExact: workdays,
        extraWorkdays: 0,
        extraWorkdaysExact: 0,
        paidLeaveWorkdays: isPaidLeaveDay ? workdays : 0,
        manualOverride: true,
        unapprovedAbsence: false
      })
    })

    row.days.forEach((day, date) => {
      const paidLeaveWorkdays = numberValue(day.paidLeaveWorkdays)
      const dayWorkdays = numberValue(day.workdaysExact ?? day.workdays)
      const actualWorkdays = Math.max(0, dayWorkdays - paidLeaveWorkdays)
      const officialDate = String(row.officialDate || '').slice(0, 10)
      const isProbation = officialDate
        ? date < officialDate
        : String(row.employmentStatus || '').toLowerCase().includes('thử việc')
      const explicitOnline = Math.min(actualWorkdays, numberValue(day.onlineWorkdays))
      const explicitOffline = Math.min(
        Math.max(0, actualWorkdays - explicitOnline),
        numberValue(day.offlineWorkdays)
      )

      row.workdays += day.workdaysExact ?? day.workdays
      row.actualWorkdays += actualWorkdays
      row.totalHours += day.hoursExact ?? day.hours
      row.overtimeHours += day.overtimeHours
      row.attendanceDays += day.hasPunch || dayWorkdays > 0 ? 1 : 0
      row.lateCount += day.late ? 1 : 0
      row.lateUnder30Count += day.late && day.lateMinutes < 30 ? 1 : 0
      row.lateOver30Count += day.late && day.lateMinutes >= 30 ? 1 : 0
      row.lateMinutes += day.lateMinutes
      row.earlyCount += day.early ? 1 : 0
      row.earlyUnder30Count += day.early && day.earlyMinutes < 30 ? 1 : 0
      row.earlyOver30Count += day.early && day.earlyMinutes >= 30 ? 1 : 0
      row.earlyMinutes += day.earlyMinutes
      row.missingPunchCount += day.missingPunch ? 1 : 0
      row.unapprovedAbsenceCount += day.unapprovedAbsence ? 1 : 0
      row.paidLeaveWorkdays += paidLeaveWorkdays
      row.probationWorkdays += isProbation ? actualWorkdays : 0
      row.officialWorkdays += isProbation ? 0 : actualWorkdays
      row.onlineWorkdays += explicitOnline
      row.offlineWorkdays +=
        explicitOffline + Math.max(0, actualWorkdays - explicitOnline - explicitOffline)
    })

    row.workdays = Math.round(row.workdays * 100) / 100
    row.actualWorkdays = Math.round(row.actualWorkdays * 100) / 100
    row.totalHours = Math.round(row.totalHours * 100) / 100
    row.overtimeHours = Math.round(row.overtimeHours * 100) / 100
    row.probationWorkdays = Math.round(row.probationWorkdays * 100) / 100
    row.officialWorkdays = Math.round(row.officialWorkdays * 100) / 100
    row.paidLeaveWorkdays = Math.round(row.paidLeaveWorkdays * 100) / 100
    row.onlineWorkdays = Math.round(row.onlineWorkdays * 100) / 100
    row.offlineWorkdays = Math.round(row.offlineWorkdays * 100) / 100
  })

  return Array.from(summaryByEmployee.values()).sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName, 'vi')
  )
}

const slimDayLogs = (logs = []) =>
  logs.map(log => ({
    kyHieu: log.kyHieu || '',
    kyHieuPlus: log.kyHieuPlus || '',
    status: log.status || '',
    checkIn: log.checkIn || log.vao || '',
    checkOut: log.checkOut || log.ra || '',
    vao: log.vao || log.checkIn || '',
    ra: log.ra || log.checkOut || '',
    shiftName: log.shiftName || log.tenCa || '',
    tenCa: log.tenCa || log.shiftName || '',
    punches: Array.isArray(log.punches) ? log.punches : [],
    punchPairs: Array.isArray(log.punchPairs) ? log.punchPairs : []
  }))
/** Persist summary rows to hr_records (Map → plain object, slim logs). */
export const serializeAttendanceSummaryRows = (rows = []) =>
  rows.map(row => ({
    ...row,
    days: Object.fromEntries(
      Array.from(row.days?.entries?.() || []).map(([date, day]) => [
        date,
        {
          hoursExact: day.hoursExact ?? day.hours,
          workdaysExact: day.workdaysExact ?? day.workdays,
          regularWorkdaysExact: day.regularWorkdaysExact ?? day.regularWorkdays,
          extraWorkdaysExact: day.extraWorkdaysExact ?? day.extraWorkdays,
          workedMinutes: day.workedMinutes,
          regularMinutes: day.regularMinutes,
          hours: day.hours,
          workdays: day.workdays,
          regularWorkdays: day.regularWorkdays,
          extraWorkdays: day.extraWorkdays,
          overtimeHours: day.overtimeHours,
          paidLeaveWorkdays: day.paidLeaveWorkdays,
          lateMinutes: day.lateMinutes,
          earlyMinutes: day.earlyMinutes,
          late: Boolean(day.late),
          early: Boolean(day.early),
          missingPunch: Boolean(day.missingPunch),
          unapprovedAbsence: Boolean(day.unapprovedAbsence),
          onlineWorkdays: day.onlineWorkdays,
          offlineWorkdays: day.offlineWorkdays,
          hasPunch: Boolean(day.hasPunch),
          checkIn: day.checkIn || '',
          checkOut: day.checkOut || '',
          standardCheckIn: day.standardCheckIn || '',
          standardCheckOut: day.standardCheckOut || '',
          shiftName: day.shiftName || '',
          isHoliday: Boolean(day.isHoliday),
          holidayName: day.holidayName || '',
          holidayWorkdays: day.holidayWorkdays || 0,
          manualOverride: Boolean(day.manualOverride),
          calculationMode: day.calculationMode || 'full-day',
          splitShiftBreakdown: day.splitShiftBreakdown || [],
          logs: slimDayLogs(day.logs)
        }
      ])
    )
  }))
/** Restore summary rows after loading from snapshot (plain object → Map). */
export const hydrateAttendanceSummaryRows = (rows = []) =>
  (rows || []).map(row => ({
    ...row,
    days: new Map(Object.entries(row.days || {}))
  }))
