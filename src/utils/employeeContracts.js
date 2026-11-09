export const employeeContractKey = (companyId, employeeId) =>
  `${String(companyId || 'speego-original')}__${String(employeeId || '')}`

export const withEmployeeContract = (employee, contracts, companyId) => {
  const contract = contracts?.[employeeContractKey(companyId, employee?.id)] || {}
  return {
    ...employee,
    loai_hop_dong: contract.contractType || '',
    ngay_het_han: contract.contractEndDate || ''
  }
}
