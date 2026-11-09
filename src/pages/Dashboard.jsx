import { useEffect, useState } from 'react'
import SeedAllDataButton from '../components/SeedAllDataButton'
import { fbGet } from '../services/firebase'

function Dashboard() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    hcmCount: 0,
    hanoiCount: 0,
    activeTasks: 0
  })
  const [recentEmployees, setRecentEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const empData = await fbGet('employees')
      let employees = []

      if (empData === null || empData === undefined) {
        employees = []
      } else if (Array.isArray(empData)) {
        employees = empData.filter(item => item !== null && item !== undefined)
      } else if (typeof empData === "object") {
        employees = Object.entries(empData)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
      }

      const hcmCount = employees.filter(e => {
        const branch = e.chi_nhanh || e.branch || ''
        return branch === 'HCM' || branch === 'Hồ Chí Minh' || branch === 'TP. Hồ Chí Minh'
      }).length

      const hanoiCount = employees.filter(e => {
        const branch = e.chi_nhanh || e.branch || ''
        return branch === 'Hà Nội' || branch === 'Hanoi' || branch === 'HN'
      }).length

      // Load tasks
      let tasks = []
      try {
        const tasksData = await fbGet('hr/tasks')
        tasks = tasksData ? Object.entries(tasksData).map(([k, v]) => ({ ...v, id: k })) : []
      } catch (e) {
        console.warn('Tasks not found')
      }

      const activeTasks = tasks.filter(t => t.status === 'Đang làm').length

      setStats({
        totalEmployees: employees.length,
        hcmCount,
        hanoiCount,
        activeTasks
      })

      setRecentEmployees(employees.slice(-5).reverse())
      setLoading(false)
    } catch (e) {
      console.error('Error loading dashboard:', e)
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-home"></i>
          Tổng quan hệ thống
        </h1>
        <SeedAllDataButton onComplete={loadData} />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <i className="fas fa-users"></i>
          </div>
          <div className="stat-info">
            <h3 id="total-employees">{stats.totalEmployees}</h3>
            <p>Tổng nhân viên</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <span>🏙️</span>
          </div>
          <div className="stat-info">
            <h3 id="total-sg">{stats.hcmCount}</h3>
            <p>Chi nhánh HCM</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <span>🏛️</span>
          </div>
          <div className="stat-info">
            <h3 id="total-hn">{stats.hanoiCount}</h3>
            <p>Chi nhánh Hà Nội</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <i className="fas fa-tasks"></i>
          </div>
          <div className="stat-info">
            <h3 id="total-tasks">{stats.activeTasks}</h3>
            <p>Task đang làm</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Nhân viên mới nhất</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ảnh</th>
              <th>Họ và tên</th>
              <th>Vị trí</th>
              <th>Chi nhánh</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody id="recent-employees">
            {recentEmployees.length > 0 ? (
              recentEmployees.map((e, idx) => {
                const name = e.ho_va_ten || e.name || e.Tên || 'N/A'
                const position = e.vi_tri || e.position || '-'
                const branch = e.chi_nhanh || e.branch || '-'
                const avatar = e.avatarDataUrl || e.avatarUrl || e.avatar || ''
                return (
                  <tr key={idx}>
                    <td>
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={name}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            objectFit: 'cover'
                          }}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ) : (
                        <span style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          display: 'inline-block'
                        }}></span>
                      )}
                    </td>
                    <td>{name}</td>
                    <td>{position}</td>
                    <td>
                      <span className={`badge ${branch === 'Hà Nội' ? 'badge-hn' : 'badge-sg'}`}>
                        {branch}
                      </span>
                    </td>
                    <td>-</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan="5" className="empty-state">Chưa có dữ liệu</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Dashboard

