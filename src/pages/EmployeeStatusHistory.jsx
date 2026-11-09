import { useEffect, useState } from 'react'
import SeedEmployeeStatusButton from '../components/SeedEmployeeStatusButton'
import { fbGet } from '../services/firebase'

function EmployeeStatusHistory() {
  const [logs, setLogs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load employees
      const empData = await fbGet('employees')
      let empList = []
      if (empData) {
        if (Array.isArray(empData)) {
          empList = empData.filter(item => item !== null && item !== undefined)
        } else if (typeof empData === "object") {
          empList = Object.entries(empData)
            .filter(([k, v]) => v !== null && v !== undefined)
            .map(([k, v]) => ({ ...v, id: k }))
        }
      }
      setEmployees(empList)

      const hrData = await fbGet('hr')
      const rawLogs = hrData?.employee_status_history
        ? Object.entries(hrData.employee_status_history)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
        : []
      // Sắp xếp mới nhất lên trên
      rawLogs.sort((a, b) => new Date(b.effectiveDate || b.createdAt || 0) - new Date(a.effectiveDate || a.createdAt || 0))
      setLogs(rawLogs)
      setLoading(false)
    } catch (error) {
      console.error('Error loading status history:', error)
      setLogs([])
      setLoading(false)
    }
  }

  const filterByDate = (items) => {
    if (!fromDate && !toDate) return items
    return items.filter(item => {
      // Lấy ngày log (cắt lấy yyyy-mm-dd)
      const rawDate = item.effectiveDate || item.createdAt
      if (!rawDate) return false

      // Chuyển về YYYY-MM-DD (nếu là ISO string thì cắt 10 ký tự đầu)
      const dateStr = rawDate.substring(0, 10)

      if (fromDate && dateStr < fromDate) return false
      if (toDate && dateStr > toDate) return false

      return true
    })
  }

  const [activeTab, setActiveTab] = useState('detail') // 'detail' or 'summary'

  const filteredLogs = filterByDate(logs)

  const summaryStats = {
    thuViec: filteredLogs.filter(l => l.newStatus === 'Thử việc').length,
    chinhThuc: filteredLogs.filter(l => l.newStatus === 'Chính thức').length,
    nghiViec: filteredLogs.filter(l => l.newStatus === 'Nghỉ việc').length
  }

  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-history"></i>
          Lịch sử trạng thái nhân sự
        </h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: '4px' }}
          />
          <span>-</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: '4px' }}
          />
          <button className="btn btn-primary" onClick={loadData}>
            <i className="fas fa-sync"></i>
            Làm mới
          </button>
          <SeedEmployeeStatusButton employees={employees} onComplete={loadData} />
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '20px' }}>
        <button
          className={`tab ${activeTab === 'detail' ? 'active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          <i className="fas fa-list-alt" style={{ marginRight: '8px' }}></i>
          Chi tiết lịch sử thay đổi
        </button>
        <button
          className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          <i className="fas fa-chart-pie" style={{ marginRight: '8px' }}></i>
          Bảng tổng hợp số liệu
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Summary Table */}
        {activeTab === 'summary' && (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #eee', background: '#e3f2fd' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0d47a1' }}>
                <i className="fas fa-chart-pie" style={{ marginRight: '8px' }}></i>
                Bảng tổng hợp số liệu
              </h4>
            </div>
            <table className="table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Chỉ tiêu</th>
                  <th style={{ width: '50%', textAlign: 'center' }}>Số lượng</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tổng nhân viên Thử việc</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#1976d2', fontSize: '1.2rem' }}>{summaryStats.thuViec}</td>
                </tr>
                <tr>
                  <td>Tổng nhân viên Chính thức</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#388e3c', fontSize: '1.2rem' }}>{summaryStats.chinhThuc}</td>
                </tr>
                <tr>
                  <td>Tổng nhân viên Nghỉ việc</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#d32f2f', fontSize: '1.2rem' }}>{summaryStats.nghiViec}</td>
                </tr>
                <tr style={{ background: '#f8f9fa' }}>
                  <td style={{ fontWeight: 'bold' }}>Tổng lượt biến động</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#333', fontSize: '1.2rem' }}>{filteredLogs.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Detailed History Table */}
        {activeTab === 'detail' && (
          <div className="card">
            <div style={{ padding: '15px', borderBottom: '1px solid #eee', marginBottom: '15px' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>
                <i className="fas fa-list-alt" style={{ marginRight: '8px' }}></i>
                Chi tiết lịch sử thay đổi
              </h4>
            </div>
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã nhân viên</th>
                  <th>Tên nhân viên</th>
                  <th>Trạng thái mới</th>
                  <th>Ngày hiệu lực</th>
                  <th>Người thực hiện</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, idx) => (
                    <tr key={log.id || idx}>
                      <td>{idx + 1}</td>
                      <td>{log.employeeCode || log.employeeId || ''}</td>
                      <td>{log.employeeName || ''}</td>
                      <td>{log.newStatus || ''}</td>
                      <td>{log.effectiveDate ? new Date(log.effectiveDate).toLocaleDateString('vi-VN') : ''}</td>
                      <td>{log.actor || 'HR'}</td>
                      <td>{log.note || ''}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">Không có thay đổi trạng thái trong kỳ</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default EmployeeStatusHistory


