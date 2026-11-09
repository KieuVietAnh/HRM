import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// Chạy với PGLITE_MODULE_PATH trỏ tới bản PGlite tạm, không thêm dependency ứng dụng.
test('PostgreSQL: lịch sử lương nguyên tử và bảng lương đã chốt bất biến', {
  skip: !process.env.PGLITE_MODULE_PATH
}, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.users (id uuid primary key, total_salary text, name text);
      create table public.hr_records (id text primary key, collection text not null, data jsonb not null default '{}');
      insert into public.users values ('00000000-0000-4000-8000-000000000001', '12000000', 'Cũ');
    `)
    await db.exec(await readFile(new URL('../migrations/20261109120000_salary_history_and_payroll_lock.sql', import.meta.url), 'utf8'))
    const id = '00000000-0000-4000-8000-000000000001'
    const history = async () => (await db.query("select data from hr_records where id = $1", [`employeeSalaryHistory::${id}`])).rows[0].data.entries
    assert.equal((await history())[0].legacy, true)
    await db.query(`update users set total_salary = '12.000.000', salary_change_effective_date = '2026-09-01' where id = $1`, [id])
    await db.query(`update users set total_salary = '13000000', probation_salary_percent = 80,
      salary_change_effective_date = '2026-10-01' where id = $1`, [id])
    assert.deepEqual((await history()).map(r => [r.effectiveDate, r.amount]), [
      ['0001-01-01', '12000000'], ['2026-09-01', '12000000'], ['2026-10-01', '13000000']
    ])
    // Sửa lại cùng một mốc chưa chốt được phép, kể cả mốc tương lai.
    await db.query(`update users set total_salary = '14000000', salary_change_effective_date = '2026-10-01' where id = $1`, [id])
    assert.equal((await history()).find(r => r.effectiveDate === '2026-10-01').amount, '14000000')
    assert.equal((await db.query('select salary_change_effective_date from users where id = $1', [id])).rows[0].salary_change_effective_date, null)
    await db.query(`update users set total_salary = '11000000', salary_change_effective_date = '2026-08-01' where id = $1`, [id])
    assert.equal((await db.query('select total_salary from users where id = $1', [id])).rows[0].total_salary, '14000000')

    // Ghi hồ sơ không lương và import cũ thiếu ngày không được làm mất lịch sử.
    await db.exec(`insert into users(id, name) values ('00000000-0000-4000-8000-000000000002', 'Chưa có lương');
      update users set name = 'Đổi tên' where id = '00000000-0000-4000-8000-000000000002';`)
    const before = await history()
    await assert.rejects(db.query("update users set total_salary = '12tr' where id = $1", [id]), /VNĐ/)
    await assert.rejects(db.query("update users set total_salary = '' where id = $1", [id]), /VNĐ/)
    assert.deepEqual(await history(), before)
    await assert.rejects(db.exec("update hr_records set data = '{}' where collection = 'employeeSalaryHistory'"), /hồ sơ nhân sự/)
    await assert.rejects(db.exec("delete from hr_records where collection = 'employeeSalaryHistory'"), /hồ sơ nhân sự/)

    const salaryHistory = async () => (await db.query(`select coalesce(jsonb_object_agg(data->>'employeeId', data->'entries'), '{}') as value
      from hr_records where collection = 'employeeSalaryHistory'`)).rows[0].value
    const snapshot = { month: '2026-09', lockedAt: '2026-10-02T00:00:00Z', standardWorkdays: 26,
      salaryHistory: await salaryHistory(), rows: [{ employeeId: id, payroll: { amount: 12000000, error: '' } }] }
    const allocations = { month: '2026-09', companyId: 'speego-original', records: { [id]: { mainPay: 12000000, insurance: 100000 } } }
    await db.query("insert into hr_records values ('payrollSummaries::speego-original__2026-09', 'payrollSummaries', $1)", [allocations])
    await assert.rejects(db.query("insert into hr_records values ('payrollMonthSnapshots::2026-09', 'payrollMonthSnapshots', $1)", [snapshot]), /Phân bổ lương vừa thay đổi/)
    snapshot.payrollSummary = allocations
    await db.query("insert into hr_records values ('payrollMonthSnapshots::2026-09', 'payrollMonthSnapshots', $1)", [snapshot])
    await assert.rejects(db.exec("update hr_records set data = '{}' where collection = 'payrollSummaries'"), /kỳ đã chốt/)
    await assert.rejects(db.exec("delete from hr_records where collection = 'payrollSummaries'"), /kỳ đã chốt/)
    await assert.rejects(db.exec("update hr_records set data = '{}' where collection = 'payrollMonthSnapshots'"), /đã chốt/)
    await assert.rejects(db.exec("delete from hr_records where collection = 'payrollMonthSnapshots'"), /đã chốt/)
    await assert.rejects(db.query("update users set total_salary = '99000000', salary_change_effective_date = '2026-09-15' where id = $1", [id]), /kỳ lương đã chốt/)
    assert.deepEqual(await history(), before)
    // Đổi lương sau kỳ chốt hợp lệ; bản tính đang mở trước thay đổi phải tải lại.
    await db.query("update users set total_salary = '15000000', salary_change_effective_date = '2026-11-01' where id = $1", [id])
    const stale = { ...snapshot, month: '2026-10', payrollSummary: { records: {} } }
    await assert.rejects(db.query("insert into hr_records values ('payrollMonthSnapshots::2026-10', 'payrollMonthSnapshots', $1)", [stale]), /vừa thay đổi/)
    const invalid = { ...stale, salaryHistory: await salaryHistory(), rows: [{ payroll: { amount: null } }] }
    await assert.rejects(db.query("insert into hr_records values ('payrollMonthSnapshots::2026-10', 'payrollMonthSnapshots', $1)", [invalid]), /thiếu mức lương/)
    const unverified = { ...stale, salaryHistory: await salaryHistory(), rows: [{ payroll: { amount: 1, legacy: true } }] }
    await assert.rejects(db.query("insert into hr_records values ('payrollMonthSnapshots::2026-10', 'payrollMonthSnapshots', $1)", [unverified]), /đối chiếu/)
    const frozen = (await db.query("select data from hr_records where id = 'payrollMonthSnapshots::2026-09'")).rows[0].data
    assert.equal(frozen.rows[0].payroll.amount, 12000000)
  } finally {
    await db.close()
  }
})
