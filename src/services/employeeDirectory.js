import { supabase } from './supabase'
import {
  mapUserToApp,
  runUsersMutationWithSchemaFallback,
  USERS_DIRECTORY_COLUMNS
} from '../utils/helpers'
import { loadEmployeeDirectoryWithClient } from './employeeDirectoryLoader'

/**
 * Authoritative, paginated employee-directory loader shared by every screen.
 * It only drops optional columns when PostgREST explicitly reports that the
 * deployed schema does not contain them; permission/query errors are surfaced.
 */
export const loadEmployeeDirectory = async ({
  columns = USERS_DIRECTORY_COLUMNS,
  pageSize = 1000,
  schemaFallback = true,
  client = supabase
} = {}) => loadEmployeeDirectoryWithClient({ client, columns, pageSize, schemaFallback })

export const fetchUsersDirectory = async options =>
  (await loadEmployeeDirectory(options)).rows

/** Create a directory profile only. Login credentials/Auth accounts are separate. */
export const createEmployeeDirectoryProfile = async profile => {
  const normalizeIdentity = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '')
  const employeeCode = String(profile?.employeeId || '').trim()
  const employeeName = String(profile?.ho_va_ten || profile?.name || '').trim()
  const { rows: currentDirectory } = await loadEmployeeDirectory()
  const duplicate = currentDirectory.find(row => {
    const currentCode = row.employee_id || row.username || ''
    return (employeeCode && normalizeIdentity(currentCode) === normalizeIdentity(employeeCode)) ||
      (employeeName && normalizeIdentity(row.name) === normalizeIdentity(employeeName))
  })
  if (duplicate) {
    const duplicateCode = normalizeIdentity(duplicate.employee_id || duplicate.username || '')
    const duplicateName = normalizeIdentity(duplicate.name || '')
    if (
      employeeCode && employeeName &&
      duplicateCode === normalizeIdentity(employeeCode) &&
      duplicateName === normalizeIdentity(employeeName)
    ) {
      return { ...mapUserToApp(duplicate), id: duplicate.id, reusedExisting: true }
    }
    throw new Error(
      `Đã có hồ sơ “${duplicate.name || duplicate.employee_id || duplicate.id}”. ` +
      'Hãy quay lại và chọn hồ sơ này thay vì tạo mới.'
    )
  }

  const id = crypto.randomUUID()
  const payload = {
    id,
    employee_id: employeeCode || null,
    username: String(profile?.username || profile?.employeeId || '').trim() || null,
    name: employeeName,
    branch: String(profile?.chi_nhanh || profile?.branch || '').trim(),
    department: String(profile?.bo_phan || profile?.department || '').trim(),
    team: String(profile?.team || '').trim(),
    position: String(profile?.vi_tri || profile?.position || '').trim(),
    shift: String(profile?.ca_lam_viec || profile?.shift || '').trim(),
    employment_status: '',
    status: '',
    role: 'user'
  }
  if (!payload.name) throw new Error('Không thể tạo hồ sơ khi thiếu họ tên.')

  const mutation = await runUsersMutationWithSchemaFallback(
    nextPayload => supabase.from('users').insert([nextPayload]),
    payload
  )
  if (mutation.error) throw mutation.error
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
  if (error) throw error
  return { ...mapUserToApp(data), id: data.id }
}
