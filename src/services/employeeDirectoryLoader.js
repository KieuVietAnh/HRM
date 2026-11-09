const DEFAULT_PAGE_SIZE = 1000
const MAX_SCHEMA_RETRIES = 20

const normalizeColumns = columns => {
  if (Array.isArray(columns)) return columns.map(String).map(value => value.trim()).filter(Boolean)
  return String(columns || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

const missingColumnFromError = error => {
  const message = String(error?.message || '')
  const cacheMatch = message.match(/Could not find the '([^']+)' column of 'users' in the schema cache/i)
  if (cacheMatch) return cacheMatch[1]
  // PostgreSQL returns 42703 for a SELECT that names a column absent from an
  // older users schema (for example, users.company_id).
  if (error?.code && error.code !== '42703') return ''
  return message.match(/column (?:"?users"?\.)?"?([a-z_][a-z0-9_]*)"? does not exist/i)?.[1] || ''
}

/** Pure paginated loader; optional missing columns are removed after an explicit schema error. */
export const loadEmployeeDirectoryWithClient = async ({
  client,
  columns,
  pageSize = DEFAULT_PAGE_SIZE,
  schemaFallback = true
}) => {
  if (!client) throw new Error('Thiếu kết nối dữ liệu nhân viên.')
  let selectedColumns = normalizeColumns(columns)
  if (!selectedColumns.includes('id')) selectedColumns.unshift('id')

  for (let attempt = 0; attempt < MAX_SCHEMA_RETRIES; attempt += 1) {
    const loadPage = from => client
      .from('users')
      .select(selectedColumns.join(','))
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    const first = await loadPage(0)
    if (first.error) {
      const missing = schemaFallback ? missingColumnFromError(first.error) : ''
      if (!missing || missing === 'id' || !selectedColumns.includes(missing)) throw first.error
      selectedColumns = selectedColumns.filter(column => column !== missing)
      continue
    }

    const rows = [...(first.data || [])]
    for (let from = pageSize; rows.length >= from; from += pageSize) {
      const next = await loadPage(from)
      if (next.error) throw next.error
      rows.push(...(next.data || []))
      if (!next.data || next.data.length < pageSize) break
    }

    const invalidRow = rows.find(row =>
      !row?.id || !String(row.name || row.employee_id || row.username || '').trim()
    )
    if (invalidRow) {
      throw new Error(
        `Danh mục nhân viên có hồ sơ thiếu ID hoặc cả tên/mã (${invalidRow.id || 'không rõ ID'}).`
      )
    }

    return {
      rows,
      count: rows.length,
      loadedAt: new Date().toISOString(),
      complete: true,
      columns: [...selectedColumns]
    }
  }

  throw new Error('Không thể tải danh mục nhân viên với schema hiện tại.')
}
