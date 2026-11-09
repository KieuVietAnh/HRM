// One atomic write per month, with revision checking for concurrent editors.
export async function loadPayrollSummary(client, companyId, month) {
  const id = `payrollSummaries::${encodeURIComponent(companyId)}__${month}`
  const { data, error } = await client.from('hr_records').select('data, updated_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function savePayrollSummary(client, companyId, month, previous, records, savedBy) {
  const payload = {
    id: `payrollSummaries::${encodeURIComponent(companyId)}__${month}`, collection: 'payrollSummaries',
    data: { month, companyId, records, savedBy }, updated_at: new Date().toISOString()
  }
  const query = previous
    ? client.from('hr_records').update(payload).eq('id', payload.id).eq('updated_at', previous.updated_at)
    : client.from('hr_records').insert(payload)
  const { data, error } = await query.select('data, updated_at').maybeSingle()
  if (error?.code === '23505' || (!error && !data)) {
    throw new Error('Có người vừa cập nhật bảng lương. Các ô đang nhập được giữ nguyên; xuất Excel để giữ số liệu rồi tải lại đối chiếu.')
  }
  if (error) throw error
  return data
}
