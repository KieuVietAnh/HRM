import { formatMoney } from '../utils/helpers'

function PayslipModal({ payroll, employee, isOpen, onClose }) {
  if (!isOpen || !payroll) return null

  const totalIncome = (payroll.luong3P || 0) + (payroll.luongNgayCong || 0) + (payroll.thuongNong || 0)
  const totalDeductions = (payroll.bhxh || 0) + (payroll.thueTNCN || 0) + (payroll.tamUng || 0) + (payroll.khac || 0)
  const netSalary = totalIncome - totalDeductions

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-file-invoice-dollar"></i>
            Phiếu lương - {employee ? (employee.ho_va_ten || employee.name || 'N/A') : 'N/A'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* 1. Thông tin chung */}
          <div style={{ marginBottom: '30px' }}>
            <h4 style={{ marginBottom: '15px', borderBottom: '2px solid var(--primary)', paddingBottom: '10px' }}>
              1. Thông tin chung
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <strong>Họ tên:</strong> {employee ? (employee.ho_va_ten || employee.name || '-') : '-'}
              </div>
              <div>
                <strong>Mã nhân sự:</strong> {payroll.employeeId || '-'}
              </div>
              <div>
                <strong>Bộ phận:</strong> {payroll.department || employee?.bo_phan || '-'}
              </div>
              <div>
                <strong>Vị trí:</strong> {employee ? (employee.vi_tri || '-') : '-'}
              </div>
              <div>
                <strong>Kỳ lương:</strong> {payroll.period || '-'}
              </div>
            </div>
          </div>

          {/* 2. Thu nhập */}
          <div style={{ marginBottom: '30px' }}>
            <h4 style={{ marginBottom: '15px', borderBottom: '2px solid var(--primary)', paddingBottom: '10px' }}>
              2. Thu nhập
            </h4>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Khoản mục</th>
                  <th style={{ textAlign: 'right' }}>Số tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Lương bậc P1</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(payroll.luongP1 || 0)}</td>
                </tr>
                <tr>
                  <td>Kết quả P3 (KPI)</td>
                  <td style={{ textAlign: 'right' }}>{payroll.ketQuaP3 || payroll.p3 || '100%'}</td>
                </tr>
                <tr>
                  <td>Lương 3P</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatMoney(payroll.luong3P || 0)}</td>
                </tr>
                <tr>
                  <td>Thưởng nóng</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(payroll.thuongNong || 0)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                  <td>Tổng thu nhập</td>
                  <td style={{ textAlign: 'right', color: 'var(--primary)' }}>{formatMoney(totalIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Khấu trừ */}
          <div style={{ marginBottom: '30px' }}>
            <h4 style={{ marginBottom: '15px', borderBottom: '2px solid var(--primary)', paddingBottom: '10px' }}>
              3. Khấu trừ
            </h4>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Khoản khấu trừ</th>
                  <th style={{ textAlign: 'right' }}>Số tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>BHXH</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(payroll.bhxh || 0)}</td>
                </tr>
                <tr>
                  <td>Thuế TNCN</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(payroll.thueTNCN || 0)}</td>
                </tr>
                {payroll.tamUng > 0 && (
                  <tr>
                    <td>Tạm ứng</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(payroll.tamUng || 0)}</td>
                  </tr>
                )}
                {payroll.khac > 0 && (
                  <tr>
                    <td>Khác</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(payroll.khac || 0)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                  <td>Tổng khấu trừ</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatMoney(totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. Thực lĩnh */}
          <div style={{ padding: '20px', background: '#f0f8ff', borderRadius: '4px', textAlign: 'center' }}>
            <h4 style={{ marginBottom: '10px' }}>4. Thực lĩnh</h4>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: 'var(--success)' }}>
              {formatMoney(netSalary)}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
          <button
            className="btn btn-primary"
            onClick={() => window.print()}
            style={{ marginLeft: '10px' }}
          >
            <i className="fas fa-print"></i>
            In phiếu lương
          </button>
        </div>
      </div>
    </div>
  )
}

export default PayslipModal

