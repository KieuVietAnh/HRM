import { normalizeString } from './helpers.js'
import { LEGACY_COMPANY_ID } from './companyContext.js'

const COMMON_MIDDLE_NAMES = new Set(['thi', 'van'])
const MIN_NAME_SCORE_FOR_EXACT_CODE_MATCH = 0.9

export const normalizeEmployeeIdentity = (value) =>
  normalizeString(value)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export const compactEmployeeIdentity = (value) =>
  normalizeEmployeeIdentity(value).replace(/\s+/g, '')

const compactWithoutCommonMiddleNames = (value) => {
  const tokens = normalizeEmployeeIdentity(value).split(' ').filter(Boolean)
  if (tokens.length <= 2) return tokens.join('')

  return tokens
    .filter((token, index) =>
      index === 0 ||
      index === tokens.length - 1 ||
      !COMMON_MIDDLE_NAMES.has(token)
    )
    .join('')
}
const levenshteinDistance = (left, right) => {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      )
    }
    previous = current
  }

  return previous[right.length]
}
const similarity = (left, right) => {
  if (!left || !right) return 0
  return 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length)
}

const employeeName = (employee) =>
  employee?.ho_va_ten || employee?.name || employee?.fullName || ''

const employeeDepartment = employee =>
  employee?.bo_phan || employee?.department || employee?.phong_ban || employee?.team || ''

const employeeCompanyId = employee =>
  employee?.companyId || employee?.company_id || employee?.tenantId || employee?.tenant_id || ''

const givenName = (value) => {
  const tokens = normalizeEmployeeIdentity(value).split(' ').filter(Boolean)
  return tokens[tokens.length - 1] || ''
}

export const getCanonicalEmployeeCode = (employee) =>
  employee?.employeeId ||
  employee?.employee_id ||
  employee?.username ||
  employee?.code ||
  ''

const employeeCodes = (employee) =>
  [
    employee?.employeeId,
    employee?.employee_id,
    employee?.username,
    employee?.code
  ]
    .map(compactEmployeeIdentity)
    .filter(Boolean)

export const buildSourceEmployeeKey = (code, name) => {
  const normalizedName = compactEmployeeIdentity(name)
  const normalizedCode = compactEmployeeIdentity(code)
  return `${normalizedCode || 'no-code'}::${normalizedName || 'no-name'}`
}

export const buildMonthlyAttendanceSourceKey = (name, department = '', sourceRow = '') =>
  [
    'monthly-matrix',
    compactEmployeeIdentity(name) || 'no-name',
    compactEmployeeIdentity(department) || 'no-department',
    compactEmployeeIdentity(String(sourceRow ?? '')) || 'no-row'
  ].join('::')

/**
 * The employee list supplied by legacy SpeeGo is already company-scoped. When
 * company metadata is present, explicitly exclude records from other tenants.
 */
export const scopeAttendanceEmployeesByCompany = (employees = [], companyId = '') => {
  const normalizedCompanyId = String(companyId || '').trim()
  if (!normalizedCompanyId) return []
  return employees.filter(employee => {
    const candidateCompanyId = String(employeeCompanyId(employee) || '').trim()
    return candidateCompanyId
      ? candidateCompanyId === normalizedCompanyId
      : normalizedCompanyId === LEGACY_COMPANY_ID
  })
}

export const buildAttendanceMappingKey = (code, name, namespace = 'excel') => {
  const normalizedCode = compactEmployeeIdentity(code)
  const normalizedName = compactEmployeeIdentity(name)
  const stableCode = normalizedCode && !/^row\d+$/i.test(normalizedCode)
    ? normalizedCode
    : ''
  return [compactEmployeeIdentity(namespace) || 'excel', stableCode || 'no-code', normalizedName || 'no-name']
    .join('::')
}

const scoreCandidate = (sourceCode, sourceName, employee) => {
  const sourceNameCompact = compactEmployeeIdentity(sourceName)
  const candidateNameCompact = compactEmployeeIdentity(employeeName(employee))
  const sourceWithoutMiddle = compactWithoutCommonMiddleNames(sourceName)
  const candidateWithoutMiddle = compactWithoutCommonMiddleNames(employeeName(employee))
  const sourceCodeCompact = compactEmployeeIdentity(sourceCode)
  const candidateCodes = employeeCodes(employee)
  const sourceGivenName = givenName(sourceName)
  const candidateGivenName = givenName(employeeName(employee))
  const givenNameCompatible =
    Boolean(sourceGivenName) &&
    Boolean(candidateGivenName) &&
    similarity(sourceGivenName, candidateGivenName) >= 0.85

  const exactName =
    Boolean(sourceNameCompact) &&
    Boolean(candidateNameCompact) &&
    sourceNameCompact === candidateNameCompact
  const exactCode =
    Boolean(sourceCodeCompact) &&
    candidateCodes.includes(sourceCodeCompact)
  const fullNameScore = similarity(sourceNameCompact, candidateNameCompact)
  const withoutMiddleScore = similarity(sourceWithoutMiddle, candidateWithoutMiddle) * 0.96
  let score = Math.max(fullNameScore, withoutMiddleScore)
  let method = withoutMiddleScore > fullNameScore ? 'Bỏ qua tên đệm phổ biến' : 'Tên gần giống'

  const isPlaceholderName =
    !sourceNameCompact ||
    sourceNameCompact === `nv${sourceCodeCompact}` ||
    sourceNameCompact === sourceCodeCompact ||
    /^nv\d+$/i.test(sourceNameCompact)

  if (exactCode && exactName) {
    score = 1
    method = 'Mã và tên trùng hồ sơ'
  } else if (exactCode && isPlaceholderName) {
    score = 1
    method = 'Mã nhân viên trùng'
  } else if (
    exactCode &&
    givenNameCompatible &&
    score >= MIN_NAME_SCORE_FOR_EXACT_CODE_MATCH
  ) {
    score = Math.max(score, 0.99)
    method = 'Mã trùng, tên tương thích'
  } else if (exactCode) {
    // A machine code can coincidentally equal a Lumi code belonging to another
    // employee. Keep this conflict for manual review instead of linking it.
    score = Math.max(score, 0.59)
    method = 'Mã trùng nhưng tên không khớp'
  } else if (exactName) {
    score = 1
    method = 'Tên trùng → gán mã nhân viên Lumi'
  }

  return {
    employee,
    employeeCode: getCanonicalEmployeeCode(employee),
    score: Math.max(0, Math.min(1, score)),
    method,
    exactName,
    exactCode,
    hasSourceName: Boolean(sourceNameCompact),
    isPlaceholderName,
    givenNameCompatible
  }
}

export const rankEmployeeMatches = (
  sourceCode,
  sourceName,
  employees,
  branch = ''
) => {
  const normalizedBranch = normalizeEmployeeIdentity(branch)
  return employees
    .map(employee => ({
      ...scoreCandidate(sourceCode, sourceName, employee),
      // Chi nhánh chỉ là tiêu chí ưu tiên. Không được loại hồ sơ ở chi nhánh
      // khác/rỗng vì dữ liệu danh mục và file máy chấm công thường không đồng bộ
      // cách ghi chi nhánh.
      branchMatch: Boolean(normalizedBranch) &&
        normalizeEmployeeIdentity(employee.chi_nhanh || employee.branch || '') ===
          normalizedBranch
    }))
    .sort((left, right) =>
      right.score - left.score ||
      Number(right.exactCode && right.exactName) -
        Number(left.exactCode && left.exactName) ||
      Number(right.exactName) - Number(left.exactName) ||
      Number(right.exactCode) - Number(left.exactCode) ||
      Number(right.branchMatch) - Number(left.branchMatch) ||
      Number(right.givenNameCompatible) - Number(left.givenNameCompatible)
    )
}

export const matchAttendanceEmployee = (
  sourceCode,
  sourceName,
  employees,
  branch = ''
) => {
  const ranked = rankEmployeeMatches(sourceCode, sourceName, employees, branch)
  const best = ranked[0] || null
  const second = ranked[1] || null
  const confidence = best?.score || 0
  const gap = best ? Math.max(0, confidence - (second?.score || 0)) : 0
  const exactNameCandidates = ranked.filter(candidate => candidate.exactName)
  const exactNameCandidatesInBranch = exactNameCandidates.filter(
    candidate => candidate.branchMatch
  )
  const uniqueExactName = Boolean(best?.exactName) && (
    exactNameCandidates.length === 1 ||
    (best.branchMatch && exactNameCandidatesInBranch.length === 1)
  )
  const autoMatched =
    Boolean(best) &&
    (
      uniqueExactName ||
      (best.exactCode && (
        best.exactName ||
        !best.hasSourceName ||
        best.isPlaceholderName ||
        (best.givenNameCompatible && confidence >= 0.9)
      )) ||
      (best.givenNameCompatible && confidence >= 0.9 && gap >= 0.08)
    )

  return {
    employee: autoMatched ? best.employee : null,
    suggestedEmployee: best?.employee || null,
    confidence,
    gap,
    method: best?.method || 'Không tìm thấy',
    status: autoMatched ? 'matched' : confidence >= 0.6 ? 'review' : 'unmatched',
    candidates: ranked.slice(0, 5)
  }
}

/**
 * Deterministic matcher for the supported monthly matrix, which has no
 * employee code. Exact name wins only when unique; department resolves exact
 * duplicate names. Never suggest a different person's similar name.
 */
export const matchMonthlyAttendanceEmployee = (
  sourceName,
  sourceDepartment,
  employees,
  companyId,
  branch = ''
) => {
  const scopedEmployees = scopeAttendanceEmployeesByCompany(employees, companyId)
  const normalizedName = normalizeEmployeeIdentity(sourceName)
  const normalizedDepartment = normalizeEmployeeIdentity(sourceDepartment)
  const exactNameCandidates = scopedEmployees.filter(employee =>
    normalizedName && normalizeEmployeeIdentity(employeeName(employee)) === normalizedName
  )

  if (exactNameCandidates.length === 1) {
    const employee = exactNameCandidates[0]
    return {
      employee,
      suggestedEmployee: employee,
      confidence: 1,
      gap: 1,
      method: 'Tên nhân viên duy nhất trong công ty',
      status: 'matched',
      candidates: [{ employee, score: 1 }]
    }
  }

  if (exactNameCandidates.length > 1 && normalizedDepartment) {
    const exactDepartmentCandidates = exactNameCandidates.filter(employee =>
      normalizeEmployeeIdentity(employeeDepartment(employee)) === normalizedDepartment
    )
    if (exactDepartmentCandidates.length === 1) {
      const employee = exactDepartmentCandidates[0]
      return {
        employee,
        suggestedEmployee: employee,
        confidence: 1,
        gap: 1,
        method: 'Tên và bộ phận trùng hồ sơ',
        status: 'matched',
        candidates: exactNameCandidates.map(candidate => ({
          employee: candidate,
          score: candidate === employee ? 1 : 0.9
        }))
      }
    }
  }

  if (exactNameCandidates.length > 1) {
    return {
      employee: null,
      suggestedEmployee: null,
      confidence: 1,
      gap: 0,
      method: 'Trùng tên, chưa phân biệt được bằng bộ phận — cần admin chọn',
      status: 'review',
      candidates: exactNameCandidates.map(employee => ({ employee, score: 1 }))
    }
  }

  return {
    employee: null,
    suggestedEmployee: null,
    confidence: 0,
    gap: 0,
    method: 'Chưa có hồ sơ trùng họ tên trong công ty',
    status: 'unmatched',
    candidates: []
  }
}

/** Exact-only matcher for detailed attendance exports that include employee code. */
export const matchDetailedAttendanceEmployee = (
  sourceCode,
  sourceName,
  employees,
  companyId
) => {
  const scoped = scopeAttendanceEmployeesByCompany(employees, companyId)
  const code = compactEmployeeIdentity(sourceCode)
  const name = normalizeEmployeeIdentity(sourceName)
  const exactCode = scoped.filter(employee => code && employeeCodes(employee).includes(code))
  const exactName = scoped.filter(employee => name && normalizeEmployeeIdentity(employeeName(employee)) === name)
  const exactBoth = exactCode.filter(employee => normalizeEmployeeIdentity(employeeName(employee)) === name)
  const matched = exactBoth.length === 1
    ? exactBoth[0]
    : exactCode.length === 1 && !name
      ? exactCode[0]
      : !exactCode.length && exactName.length === 1
        ? exactName[0]
        : null
  const candidates = exactBoth.length ? exactBoth : exactCode.length ? exactCode : exactName
  return {
    employee: matched,
    suggestedEmployee: matched,
    confidence: matched ? 1 : candidates.length ? 1 : 0,
    gap: matched ? 1 : 0,
    method: matched
      ? (exactBoth.length ? 'Mã và tên trùng hồ sơ' : 'Tên nhân viên duy nhất trong công ty')
      : exactCode.length
        ? 'Mã nhân viên trùng nhưng tên không khớp — cần kiểm tra'
        : exactName.length > 1
          ? 'Có nhiều hồ sơ trùng tên — cần kiểm tra'
          : 'Chưa có hồ sơ trùng mã hoặc họ tên trong công ty',
    status: matched ? 'matched' : candidates.length ? 'review' : 'unmatched',
    candidates: candidates.map(employee => ({ employee, score: 1 }))
  }
}

/** Guard the monthly preview again before any writes, including manual choices. */
export const validateMonthlyAttendanceSelection = (preview, employees, companyId) => {
  if (!preview?.isMonthlyMatrix && !preview?.isDetailedAttendanceList) return []
  const issues = []
  const groups = new Map((preview.matchGroups || []).map(group => [group.key, group]))
  const seen = new Set()
  for (const group of groups.values()) {
    if (group.status === 'skipped' || group.status === 'create') continue
    const match = preview.isMonthlyMatrix
      ? matchMonthlyAttendanceEmployee(group.sourceName, group.sourceDepartment, employees, companyId)
      : matchDetailedAttendanceEmployee(group.sourceCode, group.sourceName, employees, companyId)
    if (!group.selectedEmployeeId || !match.candidates.some(candidate =>
      String(candidate.employee.id) === String(group.selectedEmployeeId)
    )) issues.push(`${group.sourceName}: chưa chọn được hồ sơ trùng họ tên trong công ty.`)
  }
  for (const log of preview.logs || []) {
    const group = groups.get(log._sourceEmployeeKey)
    if (!group?.selectedEmployeeId || ['skipped', 'create'].includes(group.status)) continue
    const key = buildAttendanceRecordKey(log)
    if (seen.has(key)) {
      issues.push(`${group.sourceName}: nhiều dòng cùng nhân viên, ngày ${log.date}, ca ${log.shiftName || '-'}. Hãy kiểm tra dòng trùng trong file.`)
      break
    }
    seen.add(key)
  }
  return issues
}

export const applyEmployeeToAttendanceLog = (log, employee) => {
  const canonicalName = employeeName(employee)
  const canonicalCode = getCanonicalEmployeeCode(employee)
  const sourceName =
    log.sourceEmployeeName ||
    log.employeeName ||
    log.machineName ||
    log.tenTheoMayChamCong ||
    ''
  const sourceCode = log.sourceEmployeeCode || log.employeeCode || ''
  const sourceDepartment =
    log.sourceDepartment ||
    log._sourceDepartment ||
    log.department ||
    log.phongBan ||
    ''

  return {
    ...log,
    sourceEmployeeName: sourceName,
    sourceEmployeeCode: sourceCode,
    sourceDepartment,
    employeeId: employee.id,
    employeeCode: canonicalCode || sourceCode,
    employeeName: canonicalName || sourceName,
    machineName:
      log.machineName ||
      log.tenTheoMayChamCong ||
      sourceName ||
      canonicalName,
    tenTheoMayChamCong:
      log.tenTheoMayChamCong ||
      log.machineName ||
      sourceName ||
      canonicalName,
    department:
      employee.bo_phan ||
      employee.department ||
      log.department ||
      log.phongBan ||
      '',
    position:
      employee.vi_tri ||
      employee.position ||
      log.position ||
      log.chucVu ||
      ''
  }
}

export const buildAttendanceRecordKey = (log) => {
  const sourceCode = log.sourceEmployeeCode || log.employeeCode || ''
  const sourceName =
    log.sourceEmployeeName ||
    log.employeeName ||
    log.machineName ||
    log.tenTheoMayChamCong ||
    ''
  const linkedEmployeeId = String(log.employeeId || '').trim()
  const employeeIdentity = linkedEmployeeId && !linkedEmployeeId.startsWith('external:')
    ? `employee:${linkedEmployeeId}`
    : `source:${buildSourceEmployeeKey(sourceCode, sourceName)}`
  const date = String(log.date || '').slice(0, 10)
  const shift = String(log.shiftName || log.tenCa || log.importEventKey || 'day')

  return [employeeIdentity, date, shift]
    .map(value => normalizeEmployeeIdentity(value))
    .join('|')
}

export const buildAttendanceStorageId = log => {
  const input = buildAttendanceRecordKey(log)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `excel_${(hash >>> 0).toString(36)}`
}
