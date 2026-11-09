import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPayrollSummary, savePayrollSummary } from './payrollSummary.js'

function fakeClient(result) {
  const calls = []
  const query = Object.fromEntries(['from', 'select', 'eq', 'insert', 'update'].map(name => [name, (...args) => { calls.push([name, ...args]); return query }]))
  query.maybeSingle = async () => result
  return { query, calls }
}

test('lưu mới nguyên tháng một lần, giữ đúng công ty và kỳ lương', async () => {
  const { query, calls } = fakeClient({ data: { data: { records: {} }, updated_at: 'new' } })
  await savePayrollSummary(query, 'company/a', '2026-11', null, { a: { advance: 100 } }, 'hr')
  const payload = calls.find(([name]) => name === 'insert')[1]
  assert.equal(payload.id, 'payrollSummaries::company%2Fa__2026-11')
  assert.equal(payload.data.savedBy, 'hr')
  assert.deepEqual(payload.data.records, { a: { advance: 100 } })
})

test('chặn ghi đè phiên bản mới hơn và báo lỗi trùng lúc tạo', async () => {
  const { query, calls } = fakeClient({ data: null, error: null })
  await assert.rejects(savePayrollSummary(query, 'a', '2026-11', { updated_at: 'old' }, {}), /Có người vừa cập nhật/)
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === 'old'))
  const duplicate = fakeClient({ error: { code: '23505' } })
  await assert.rejects(savePayrollSummary(duplicate.query, 'a', '2026-11', null, {}), /Có người vừa cập nhật/)
})

test('đọc lỗi không giả vờ thành bảng rỗng; lỗi ghi phải báo về giao diện', async () => {
  const { query } = fakeClient({ error: new Error('permission denied') })
  await assert.rejects(loadPayrollSummary(query, 'a', '2026-11'), /permission denied/)
  await assert.rejects(savePayrollSummary(query, 'a', '2026-11', null, {}), /permission denied/)
})
