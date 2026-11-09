import { formatMoney } from '../utils/helpers'

function KPIDetailModal({ result, employee, kpiTemplates, kpiConversions, isOpen, onClose }) {
  if (!isOpen || !result) return null

  // Calculate conversion percent based on completion rate
  const calculateConversionPercent = (kpiId, completionRate) => {
    if (!completionRate || completionRate <= 0) return 0

    const conversions = kpiConversions.filter(c => c.kpiId === kpiId || c.kpiCode === kpiId)
      .sort((a, b) => (a.fromPercent || 0) - (b.fromPercent || 0))

    for (const conv of conversions) {
      const from = conv.fromPercent || 0
      const to = conv.toPercent === null || conv.toPercent === undefined ? 999 : conv.toPercent

      if (completionRate >= from && completionRate <= to) {
        return conv.conversionPercent || 0
      }
    }

    // Default: if > 100%, use the highest conversion
    if (completionRate > 100 && conversions.length > 0) {
      return conversions[conversions.length - 1]?.conversionPercent || 100
    }

    return 0
  }

  const getKPIDetails = () => {
    const details = []
    const activeTemplates = kpiTemplates.filter(t => t.status === 'Đang áp dụng')

    activeTemplates.forEach(template => {
      const kpiResult = result.kpiResults?.[template.id] || result.kpiResults?.[template.code]
      if (kpiResult) {
        const target = kpiResult.target || 0
        const actual = kpiResult.actual || 0
        const completionRate = target > 0 ? ((actual / target) * 100) : 0
        const conversionPercent = calculateConversionPercent(template.id, completionRate)

        // Simulate Data Source logic based on KPI Name/Code
        let dataSource = 'Hệ thống'
        const lowerName = (template.name || '').toLowerCase()
        if (lowerName.includes('doanh thu')) {
          dataSource = 'Bảng F3'
        } else if (lowerName.includes('ads') || lowerName.includes('mkt') || lowerName.includes('marketing') || lowerName.includes('data')) {
          dataSource = 'Bảng MKT'
        } else if (lowerName.includes('chi phí')) {
          dataSource = 'Bảng Kế toán'
        }

        // infer if it is a "lower is better" or "limit" type KPI for formatting
        // This is a simple heuristic. Ideally KPI template would have a "type" field.
        const isLimitType = lowerName.includes('chi phí') || lowerName.includes('ads') || (template.unit === '%' && target <= 20)

        details.push({
          kpiName: template.name,
          target,
          actual,
          completionRate,
          conversionPercent,
          weight: template.weight || 0,
          unit: template.unit,
          dataSource: dataSource,
          isLimitType: isLimitType
        })
      }
    })

    return details
  }

  const details = getKPIDetails()

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-eye"></i>
            Bảng 2: Kết quả hoàn thành và quy đổi KPI Cá nhân - {employee ? (employee.ho_va_ten || employee.name || 'N/A') : 'N/A'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '20px' }}>
            <p><strong>Tháng:</strong> {result.month || '-'}</p>
            <p><strong>Bộ phận:</strong> {result.department || '-'}</p>
            <p><strong>KPI tổng:</strong> <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
              {(result.totalKPI || result.kpiTong || 0).toFixed(1)}%
            </span></p>
            <p><strong>Trạng thái:</strong>
              <span className={`badge ${(result.totalKPI || result.kpiTong || 0) >= 100 ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: '10px' }}>
                {(result.totalKPI || result.kpiTong || 0) >= 100 ? 'Đạt' : 'Chưa đạt'}
              </span>
            </p>
          </div>

          {details.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Họ và tên</th>
                  <th>KPI</th>
                  <th>Kế hoạch</th>
                  <th>Thực tế</th>
                  <th>Tỷ lệ hoàn thành</th>
                  <th>% Quy đổi KPI</th>
                  <th>Trọng số</th>
                  <th>Nguồn dữ liệu</th>
                </tr>
              </thead>
              <tbody>
                {details.map((detail, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{employee ? (employee.ho_va_ten || employee.name || 'N/A') : 'N/A'}</td>
                    <td>{detail.kpiName}</td>
                    <td>
                      {detail.unit === 'VNĐ' || detail.unit === 'VND'
                        ? formatMoney(detail.target)
                        : detail.isLimitType || (detail.unit === '%' && detail.target <= 100)
                          ? `≤ ${detail.target}%`
                          : detail.target}
                    </td>
                    <td>
                      {detail.unit === 'VNĐ' || detail.unit === 'VND'
                        ? formatMoney(detail.actual)
                        : detail.actual}
                    </td>
                    <td style={{ fontWeight: 'bold', color: detail.completionRate >= 100 ? 'var(--success)' : 'var(--text)' }}>
                      {detail.completionRate.toFixed(1)}%
                    </td>
                    <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                      {detail.conversionPercent}%
                    </td>
                    <td>{detail.weight}%</td>
                    <td>{detail.dataSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Chưa có chi tiết KPI</p>
          )}
        </div>
        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

export default KPIDetailModal

