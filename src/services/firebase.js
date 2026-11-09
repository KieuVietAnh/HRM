import { supabase } from './supabase'
import { mapAppToUser, mapUserToApp } from '../utils/helpers'
import { loadEmployeeDirectory } from './employeeDirectory'

/**
 * Supabase-backed storage with the same API as the old Firebase helpers.
 * All former `hr/*` collections live in `public.hr_records`.
 * `employees` maps to `public.users`.
 */

const genId = () =>
  `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`

const rowId = (collection, id) => `${collection}::${id}`

function normalizePath(path = '') {
  return String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function parsePath(path) {
  const parts = normalizePath(path).split('/').filter(Boolean)
  if (!parts.length) return { kind: 'empty' }

  if (parts[0] === 'employees') {
    return { kind: 'employees', id: parts[1] || null }
  }

  if (parts[0] === 'hr') {
    if (parts.length === 1) return { kind: 'hr_root' }
    const collection = parts[1]
    if (parts.length === 2) return { kind: 'collection', collection }

    // Monthly attendance overrides and notes are stored per employee.
    if (['manualWorkdays', 'attendanceNotes'].includes(collection) && parts.length === 3) {
      return {
        kind: 'employee_month_records',
        collection,
        month: parts[2]
      }
    }

    // hr/{collection}/{month}/{empId}
    if (['manualWorkdays', 'attendanceNotes'].includes(collection) && parts.length >= 4) {
      return {
        kind: 'record',
        collection,
        id: `${parts[2]}__${parts[3]}`
      }
    }

    // hr/{collection}/{id...}
    return {
      kind: 'record',
      collection,
      id: parts.slice(2).join('__')
    }
  }

  if (parts.length === 1) return { kind: 'collection', collection: parts[0] }
  return { kind: 'record', collection: parts[0], id: parts.slice(1).join('__') }
}

async function listCollection(collection) {
  // Supabase/PostgREST mặc định max 1000 dòng/request — phải phân trang + order ổn định.
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await supabase
      .from('hr_records')
      .select('id, data', from === 0 ? { count: 'exact' } : undefined)
      .eq('collection', collection)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) {
      if (typeof count === 'number' && rows.length < count) {
        console.warn(
          `[listCollection:${collection}] thiếu dữ liệu: lấy ${rows.length}/${count}`
        )
      }
      break
    }
  }

  if (!rows.length) return null

  const prefix = `${collection}::`
  const out = {}
  rows.forEach((row) => {
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    out[logicalId] = row.data || {}
  })
  return out
}

async function getRecord(collection, id) {
  const { data, error } = await supabase
    .from('hr_records')
    .select('data')
    .eq('id', rowId(collection, id))
    .maybeSingle()

  if (error) throw error
  return data?.data ?? null
}

async function listEmployeeMonthRecords(collection, month) {
  const legacy = (await getRecord(collection, month)) || {}
  const prefix = `${collection}::${month}__`
  const { data, error } = await supabase
    .from('hr_records')
    .select('id, data')
    .eq('collection', collection)
    .like('id', `${prefix}%`)

  if (error) throw error

  const out = { ...legacy }
  ;(data || []).forEach((row) => {
    const employeeId = row.id.slice(prefix.length)
    if (employeeId) out[employeeId] = row.data || {}
  })
  return Object.keys(out).length ? out : null
}

async function upsertRecord(collection, id, data) {
  const { error } = await supabase.from('hr_records').upsert(
    {
      id: rowId(collection, id),
      collection,
      data,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  )
  if (error) throw error
}

async function patchRecord(collection, id, patch) {
  const current = (await getRecord(collection, id)) || {}
  const next = { ...current, ...(patch || {}) }
  await upsertRecord(collection, id, next)
  return next
}

async function deleteRecord(collection, id) {
  const { error } = await supabase
    .from('hr_records')
    .delete()
    .eq('id', rowId(collection, id))
  if (error) throw error
}

async function deleteCollection(collection) {
  const { error } = await supabase
    .from('hr_records')
    .delete()
    .eq('collection', collection)
  if (error) throw error
}

async function listEmployeesAsFirebaseMap(columns = '*') {
  const { data, error } = await supabase.from('users').select(columns)
  if (error) throw error
  if (!data?.length) return null

  const out = {}
  data.forEach((u) => {
    const app = mapUserToApp(u) || {}
    out[u.id] = {
      ...app,
      id: u.id,
      name: app.ho_va_ten || u.name || '',
      status: app.trang_thai || u.employment_status || ''
    }
  })
  return out
}

/** Directory fields only — paginated and shared with the Employees page. */
export const fbGetEmployeesDirectory = async () => {
  const { rows } = await loadEmployeeDirectory()
  if (!rows.length) return null
  return Object.fromEntries(rows.map(row => {
    const app = mapUserToApp(row) || {}
    return [row.id, {
      ...app,
      id: row.id,
      name: app.ho_va_ten || row.name || '',
      status: app.trang_thai || row.employment_status || ''
    }]
  }))
}

async function pushEmployee(payload) {
  const id = crypto.randomUUID()
  const dbPayload = mapAppToUser(payload || {}) || {}
  dbPayload.id = id
  if (!dbPayload.password) dbPayload.password = payload?.password || '123456'
  if (!dbPayload.employee_id && payload?.employeeId) {
    dbPayload.employee_id = payload.employeeId
  }
  if (!dbPayload.role) dbPayload.role = payload?.role || 'user'

  const { error } = await supabase.from('users').insert([dbPayload])
  if (error) throw error
  return { name: id }
}

async function getHrRoot() {
  const { data, error } = await supabase
    .from('hr_records')
    .select('id, collection, data')
  if (error) throw error

  const root = {}
  ;(data || []).forEach((row) => {
    const prefix = `${row.collection}::`
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    if (!root[row.collection]) root[row.collection] = {}
    root[row.collection][logicalId] = row.data || {}
  })
  return Object.keys(root).length ? root : null
}

export const fbGet = async (path) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees') {
    if (parsed.id) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', parsed.id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const app = mapUserToApp(data)
      return { ...app, id: data.id, name: app?.ho_va_ten || data.name }
    }
    return listEmployeesAsFirebaseMap()
  }

  if (parsed.kind === 'hr_root') return getHrRoot()

  if (parsed.kind === 'employee_month_records') {
    return listEmployeeMonthRecords(parsed.collection, parsed.month)
  }

  if (parsed.kind === 'collection') {
    return listCollection(parsed.collection)
  }

  if (parsed.kind === 'record') {
    return getRecord(parsed.collection, parsed.id)
  }

  return null
}

const normalizedAttendanceName = value =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '')

const attendanceNameSimilarity = (left, right) => {
  if (!left || !right) return 0
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length)
}

const matchesAttendanceName = (candidate, profileName) => {
  const target = normalizedAttendanceName(profileName)
  const value = normalizedAttendanceName(candidate)
  if (!target || !value) return false
  if (target === value) return true

  const targetWords = String(profileName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().match(/[a-z0-9]+/g) || []
  const valueWords = String(candidate || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().match(/[a-z0-9]+/g) || []
  const sameNameEnds = targetWords.length > 1 && valueWords.length > 1 &&
    targetWords[0] === valueWords[0] && targetWords.at(-1) === valueWords.at(-1)
  return sameNameEnds && attendanceNameSimilarity(target, value) >= 0.75
}

const listAttendanceNameCandidates = async (field, prefix) => {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('hr_records')
      .select('id, data')
      .eq('collection', 'attendanceLogs')
      .ilike(`data->>${field}`, `%${prefix}%`)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

export const fbGetAttendanceByEmployee = async (employee = {}) => {
  const profile = typeof employee === 'object' && employee !== null
    ? employee
    : { ho_va_ten: employee }
  const employeeName = String(profile.ho_va_ten || profile.name || profile.fullName || '').trim()
  const employeeId = String(profile.id || profile.employeeId || profile.employee_id || '').trim()
  if (!employeeId && !employeeName) return null

  const rows = new Map()
  const addQueryResults = results => results.forEach(({ data, error }) => {
    if (error) throw error
    ;(data || []).forEach(row => {
      const linkedId = String(row.data?.employeeId || '').trim()
      if (!linkedId || !employeeId || linkedId === employeeId) rows.set(row.id, row)
    })
  })
  if (employeeId) {
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('hr_records')
        .select('id, data')
        .eq('collection', 'attendanceLogs')
        .eq('data->>employeeId', employeeId)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      ;(data || []).forEach(row => rows.set(row.id, row))
      if (!data || data.length < pageSize) break
    }
  }
  if (rows.size) {
    const prefix = 'attendanceLogs::'
    return Object.fromEntries([...rows.values()].map(row => [row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id, row.data || {}]))
  }
  if (!employeeName) return null

  const nameFields = ['employeeName', 'sourceEmployeeName', 'machineName', 'tenTheoMayChamCong']
  const nameQueries = nameFields.map(field =>
    supabase
      .from('hr_records')
      .select('id, data')
      .eq('collection', 'attendanceLogs')
      .contains('data', { [field]: employeeName })
  )
  addQueryResults(await Promise.all(nameQueries))

  // Exact name matching can miss spelling/diacritic differences such as
  // "Vinh" vs "Vĩnh". Search by the stable start of the given name, then
  // compare normalized full names before accepting any legacy row.
  if (!rows.size) {
    const givenName = employeeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().match(/[a-z0-9]+/g)?.at(-1) || ''
    const givenNamePrefix = normalizedAttendanceName(givenName).slice(0, 2)
    if (givenNamePrefix.length === 2) {
      const candidateRows = await Promise.all(
        nameFields.map(field => listAttendanceNameCandidates(field, givenNamePrefix))
      )
      candidateRows.flat().forEach(row => {
        const data = row.data || {}
        const candidateNames = nameFields.map(field => data[field])
        if ((!data.employeeId || !employeeId || String(data.employeeId) === employeeId)
          && candidateNames.some(name => matchesAttendanceName(name, employeeName))) {
          rows.set(row.id, row)
        }
      })
    }
  }
  const prefix = 'attendanceLogs::'
  return Object.fromEntries([...rows.values()].map(row => [row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id, row.data || {}]))
}

/**
 * Load attendance logs for one YYYY-MM (filters by data.date prefix).
 * Paginates past Supabase's default 1000-row response cap.
 */
export const fbGetAttendanceLogsByMonth = async (month) => {
  const period = String(month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) return null

  const pageSize = 1000
  const rows = []
  let expectedTotal = null

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await supabase
      .from('hr_records')
      .select('id, data', from === 0 ? { count: 'exact' } : undefined)
      .eq('collection', 'attendanceLogs')
      .gte('data->>date', `${period}-01`)
      .lte('data->>date', `${period}-31`)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (from === 0 && typeof count === 'number') expectedTotal = count
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }

  if (
    typeof expectedTotal === 'number' &&
    expectedTotal > 0 &&
    rows.length < expectedTotal
  ) {
    console.warn(
      `[attendanceLogs:${period}] thiếu dữ liệu: lấy ${rows.length}/${expectedTotal}`
    )
  }

  if (!rows.length) return null

  const prefix = 'attendanceLogs::'
  const out = {}
  rows.forEach((row) => {
    const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
    out[logicalId] = row.data || {}
  })
  return out
}

export const fbGetAttendanceLogsForWorkMonth = async (month) => {
  const period = String(month || '').trim()
  if (!/^\d{4}-\d{2}$/.test(period)) return null

  const [year, monthNumber] = period.split('-').map(Number)
  const previousDate = new Date(Date.UTC(year, monthNumber - 1, 0)).toISOString().slice(0, 10)
  const [monthLogs, previousMonthLogs] = await Promise.all([
    fbGetAttendanceLogsByMonth(period),
    fbGetAttendanceLogsByMonth(previousDate.slice(0, 7))
  ])
  const previousDayLogs = Object.fromEntries(
    Object.entries(previousMonthLogs || {}).filter(([, log]) => String(log.date || '').slice(0, 10) === previousDate)
  )
  return { ...previousDayLogs, ...(monthLogs || {}) }
}

/** List logical ids in a collection without loading full JSON payloads. */
export const fbListCollectionIds = async (collection) => {
  const name = String(collection || '').trim()
  if (!name) return []
  const { data, error } = await supabase
    .from('hr_records')
    .select('id')
    .eq('collection', name)
  if (error) throw error
  const prefix = `${name}::`
  return (data || []).map((row) =>
    row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id
  )
}

export const fbSet = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'record') {
    await upsertRecord(parsed.collection, parsed.id, data || {})
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection)
    const entries = Object.entries(data || {})
    if (!entries.length) return
    const rows = entries.map(([id, value]) => ({
      id: rowId(parsed.collection, id),
      collection: parsed.collection,
      data: value || {},
      updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from('hr_records').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    return
  }

  if (parsed.kind === 'employees' && parsed.id) {
    const dbPayload = mapAppToUser(data || {}) || {}
    const { error } = await supabase.from('users').update(dbPayload).eq('id', parsed.id)
    if (error) throw error
  }
}

export const fbPush = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees') {
    return pushEmployee(data)
  }

  const collection =
    parsed.kind === 'collection'
      ? parsed.collection
      : parsed.kind === 'record'
        ? parsed.collection
        : normalizePath(path).replace(/^hr\//, '') || 'misc'

  const id = genId()
  await upsertRecord(collection, id, data || {})
  return { name: id }
}

export const fbDelete = async (path) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const { error } = await supabase.from('users').delete().eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'collection') {
    await deleteCollection(parsed.collection)
    return
  }

  if (parsed.kind === 'record') {
    await deleteRecord(parsed.collection, parsed.id)
  }
}

export const fbUpdate = async (path, data) => {
  const parsed = parsePath(path)

  if (parsed.kind === 'employees' && parsed.id) {
    const dbPayload = mapAppToUser(data || {}) || {}
    const { error } = await supabase.from('users').update(dbPayload).eq('id', parsed.id)
    if (error) throw error
    return
  }

  if (parsed.kind === 'record') {
    await patchRecord(parsed.collection, parsed.id, data || {})
    return
  }

  if (parsed.kind === 'collection') {
    const entries = Object.entries(data || {})
    for (const [id, value] of entries) {
      await patchRecord(parsed.collection, id, value || {})
    }
  }
}
