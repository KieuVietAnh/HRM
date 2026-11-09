import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEmployeeDirectoryWithClient } from './employeeDirectoryLoader.js'

const createClient = handler => ({
  from: table => ({
    select: columns => ({
      order: () => ({
        range: (from, to) => handler({ table, columns, from, to })
      })
    })
  })
})

test('loads the complete employee directory beyond 1000 rows in stable pages', async () => {
  const allRows = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index + 1).padStart(4, '0'),
    name: `Employee ${index + 1}`
  }))
  const requests = []
  const client = createClient(({ from, to }) => {
    requests.push([from, to])
    return Promise.resolve({ data: allRows.slice(from, to + 1), error: null })
  })

  const result = await loadEmployeeDirectoryWithClient({ columns: 'id,name', client })
  assert.equal(result.count, 1001)
  assert.equal(result.complete, true)
  assert.deepEqual(requests, [[0, 999], [1000, 1999]])
})

test('retries after removing only an explicitly missing optional column', async () => {
  const requestedColumns = []
  const client = createClient(({ columns }) => {
    requestedColumns.push(columns)
    if (columns.includes('nickname')) {
      return Promise.resolve({
        data: null,
        error: { message: "Could not find the 'nickname' column of 'users' in the schema cache" }
      })
    }
    return Promise.resolve({ data: [{ id: '1', name: 'A' }], error: null })
  })

  const result = await loadEmployeeDirectoryWithClient({ columns: 'id,name,nickname', client })
  assert.deepEqual(result.columns, ['id', 'name'])
  assert.deepEqual(requestedColumns, ['id,name,nickname', 'id,name'])
})

test('retries when PostgreSQL reports a selected users column is absent', async () => {
  const requestedColumns = []
  const client = createClient(({ columns }) => {
    requestedColumns.push(columns)
    if (columns.includes('company_id')) {
      return Promise.resolve({
        data: null,
        error: { code: '42703', message: 'column users.company_id does not exist' }
      })
    }
    return Promise.resolve({ data: [{ id: '1', name: 'A' }], error: null })
  })

  const result = await loadEmployeeDirectoryWithClient({
    columns: 'id, employee_id, name, company_id', client
  })
  assert.deepEqual(result.columns, ['id', 'employee_id', 'name'])
  assert.deepEqual(requestedColumns, [
    'id,employee_id,name,company_id',
    'id,employee_id,name'
  ])
})

test('surfaces permission errors instead of returning a partial or empty directory', async () => {
  const client = createClient(() => Promise.resolve({
    data: null,
    error: { message: 'permission denied for table users' }
  }))

  await assert.rejects(
    loadEmployeeDirectoryWithClient({ columns: 'id,name', client }),
    error => /permission denied/.test(error?.message || '')
  )
})
