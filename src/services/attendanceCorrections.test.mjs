import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (await readFile(new URL('./attendanceCorrections.js', import.meta.url), 'utf8'))
  .replace("import { supabase } from './supabase'", 'const supabase = globalThis.__attendanceTestSupabase')
const calls = []
globalThis.__attendanceTestSupabase = { rpc: async (name, args) => {
  calls.push({ name, args })
  return { data: {}, error: null }
} }
const { submitAttendanceCorrection, decideAttendanceCorrection } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('routes missing days and image evidence through the matching RPCs', async () => {
  await submitAttendanceCorrection({ date: '2026-11-01', attendanceLogId: null, checkIn: '08:30', checkOut: '17:30', reason: 'Quên chấm công' })
  assert.equal(calls.at(-1).name, 'submit_missing_attendance_correction')
  assert.equal(calls.at(-1).args.p_log_id, undefined)

  await submitAttendanceCorrection({ date: '2026-11-01', attendanceLogId: 'log-1', pairIndex: 0, checkIn: '08:30', reason: 'Sai giờ vào', evidenceUrl: 'https://res.cloudinary.com/example/image/upload/a.jpg' })
  assert.equal(calls.at(-1).name, 'submit_attendance_pair_correction_with_evidence')
  assert.equal(calls.at(-1).args.p_pair_index, 0)

  await decideAttendanceCorrection({ id: 'request-1', decision: 'approved', missingDay: true })
  assert.equal(calls.at(-1).name, 'decide_missing_attendance_correction')
})
