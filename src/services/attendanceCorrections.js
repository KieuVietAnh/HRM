import { supabase } from './supabase'

const migrationHint = 'Chưa bật luồng điều chỉnh công. Hãy áp dụng các migration điều chỉnh công trong supabase/migrations.'

const throwCorrectionError = error => {
  if (!error) return
  const message = String(error.message || '')
  if (/attendance_correction|schema cache|could not find the function/i.test(message)) {
    throw new Error(migrationHint)
  }
  throw error
}

export const loadAttendanceCorrectionRequests = async () => {
  const { data, error } = await supabase.rpc('list_attendance_correction_requests')
  throwCorrectionError(error)
  return Array.isArray(data) ? data : []
}

export const submitAttendanceCorrection = async ({
  date,
  attendanceLogId,
  pairIndex = null,
  checkIn,
  checkOut,
  reason,
  evidenceUrl = ''
}) => {
  const missingDay = !attendanceLogId
  const { data, error } = await supabase.rpc(missingDay ? 'submit_missing_attendance_correction' : evidenceUrl ? (pairIndex === null ? 'submit_attendance_correction_with_evidence' : 'submit_attendance_pair_correction_with_evidence') : (pairIndex === null ? 'submit_attendance_correction' : 'submit_attendance_pair_correction'), {
    p_date: date,
    ...(!missingDay && { p_log_id: attendanceLogId }),
    ...(!missingDay && pairIndex !== null && { p_pair_index: pairIndex }),
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_reason: reason,
    ...(missingDay || evidenceUrl ? { p_evidence_url: evidenceUrl || null } : {})
  })
  throwCorrectionError(error)
  return data
}

export const decideAttendanceCorrection = async ({ id, decision, comment = '', pairIndex = null, missingDay = false }) => {
  const { data, error } = await supabase.rpc(missingDay ? 'decide_missing_attendance_correction' : pairIndex === null ? 'decide_attendance_correction' : 'decide_attendance_pair_correction', {
    p_id: id,
    p_decision: decision,
    p_comment: comment
  })
  throwCorrectionError(error)
  return data
}
