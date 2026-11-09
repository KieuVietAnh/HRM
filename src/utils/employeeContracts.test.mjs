import assert from 'node:assert/strict'
import test from 'node:test'
import { employeeContractKey, withEmployeeContract } from './employeeContracts.js'
import { getEmployeeStatRows } from './employeeDirectoryStats.js'

test('saved contract is joined to its employee and drives the expiry card', () => {
  const companyId = 'speego-original'
  const contracts = {
    [employeeContractKey(companyId, 'one')]: {
      contractType: 'Xác định thời hạn',
      contractEndDate: '2026-11-01'
    },
    [employeeContractKey('another-company', 'two')]: {
      contractType: 'Khác',
      contractEndDate: '2026-10-15'
    }
  }
  const employees = [
    withEmployeeContract({ id: 'one', trang_thai: 'Chính thức' }, contracts, companyId),
    withEmployeeContract({ id: 'two', trang_thai: 'Chính thức' }, contracts, companyId)
  ]

  assert.equal(employees[0].loai_hop_dong, 'Xác định thời hạn')
  assert.equal(employees[1].ngay_het_han, '')
  assert.deepEqual(getEmployeeStatRows(employees, 'expiring', {}, new Date(2026, 9, 1)).map(item => item.id), ['one'])
})
