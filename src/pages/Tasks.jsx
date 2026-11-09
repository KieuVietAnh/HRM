import React, { useEffect, useState } from 'react'
import SeedTaskDataButton from '../components/SeedTaskDataButton'
import TaskDetailModal from '../components/TaskDetailModal'
import TaskModal from '../components/TaskModal'
import { fbDelete, fbGet } from '../services/firebase'
import { normalizeString } from '../utils/helpers'

function Tasks() {
  const [tasks, setTasks] = useState([])
  const [taskLogs, setTaskLogs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false)

  // Selected items
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null)

  // Filters
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterAssigneeSearch, setFilterAssigneeSearch] = useState('') // NEW
  const [showFilterAssigneeDropdown, setShowFilterAssigneeDropdown] = useState(false) // NEW
  const [filterPriority, setFilterPriority] = useState('')

  // Excel Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState([])
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      const [empData, tasksData, logsData] = await Promise.all([
        fbGet('employees'),
        fbGet('hr/tasks'),
        fbGet('hr/taskLogs')
      ])

      // Process Employees
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

      // Process Tasks
      const tasksList = tasksData ? Object.entries(tasksData).map(([k, v]) => ({ ...v, id: k })) : []
      setTasks(tasksList)

      // Process Task Logs
      const logsList = logsData ? Object.entries(logsData).map(([k, v]) => ({ ...v, id: k })) : []
      setTaskLogs(logsList)

      setLoading(false)
    } catch (error) {
      console.error('Error loading task data:', error)
      setLoading(false)
    }
  }

  const handleDeleteTask = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa công việc này?')) return
    try {
      await fbDelete(`hr/tasks/${id}`)
      setTasks(prev => prev.filter(t => t.id !== id))
      alert('Đã xóa công việc')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  // --- Task Excel Functions ---
  const exportTasksToExcel = () => {
    if (filteredTasks.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }
    const data = filteredTasks.map((t, idx) => ({
      'STT': idx + 1,
      'Mã CV': t.code || t.id || '',
      'Tên công việc': t.name || t.title || '',
      'Bộ phận': t.department || '',
      'Người giao': t.assignerName || getEmployeeName(t.assignerId),
      'Người nhận': getEmployeeName(t.assigneeId),
      'Mức ưu tiên': t.priority || '',
      'Ngày bắt đầu': t.startDate || '',
      'Deadline': t.deadline || '',
      'Trạng thái': t.status || '',
      'Link kết quả': t.resultFileLink || '',
      'Mô tả': t.description || ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachCongViec')
    XLSX.writeFile(wb, `DanhSachCongViec_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const downloadTaskTemplate = () => {
    const data = [
      ['Tên công việc', 'Bộ phận', 'Người giao (Họ tên)', 'Người nhận (Họ tên)', 'Mức ưu tiên', 'Ngày bắt đầu (YYYY-MM-DD)', 'Deadline (YYYY-MM-DD)', 'Mô tả'],
      ['Lập kế hoạch nội dung tuần 1', 'Marketing', 'Nguyễn Văn A', 'Trần Thị B', 'Cao', '2024-11-01', '2024-11-07', 'Mô tả chi tiết công việc...'],
      ['Kiểm tra kho hàng', 'Kho', 'Nguyễn Văn A', 'Lê Văn C', 'Trung bình', '2024-11-01', '2024-11-05', '']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'MauImportTask')
    XLSX.writeFile(wb, 'Mau_import_cong_viec.xlsx')
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsImporting(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      const parsed = jsonData.map(row => {
        const getName = (val) => String(val || '').trim()
        const assignerName = getName(row['Người giao (Họ tên)'] || row['Người giao'])
        const assigneeName = getName(row['Người nhận (Họ tên)'] || row['Người nhận'])

        const assigner = employees.find(emp =>
          normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(assignerName))
        )
        const assignee = employees.find(emp =>
          normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(assigneeName))
        )

        return {
          name: row['Tên công việc'] || '',
          department: row['Bộ phận'] || '',
          assignerId: assigner ? assigner.id : '',
          assignerName: assigner ? (assigner.ho_va_ten || assigner.name) : assignerName,
          assigneeId: assignee ? assignee.id : '',
          priority: row['Mức ưu tiên'] || 'Trung bình',
          startDate: row['Ngày bắt đầu (YYYY-MM-DD)'] || row['Ngày bắt đầu'] || new Date().toISOString().split('T')[0],
          deadline: row['Deadline (YYYY-MM-DD)'] || row['Deadline'] || '',
          description: row['Mô tả'] || '',
          status: 'Chưa bắt đầu',
          isValid: !!(row['Tên công việc'] && assigner && assignee && row['Deadline (YYYY-MM-DD)'] || row['Deadline'])
        }
      })

      setImportPreviewData(parsed)
    } catch (error) {
      alert('Lỗi đọc file: ' + error.message)
    } finally {
      setIsImporting(false)
    }
  }

  const handleConfirmImport = async () => {
    const validData = importPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ để import!')
      return
    }

    setIsImporting(true)
    try {
      for (const taskData of validData) {
        const { isValid, ...cleanData } = taskData
        const now = new Date()
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
        const code = `T-${String(now.getMonth() + 1).padStart(2, '0')}-${random}`

        const finalData = { ...cleanData, code }
        await fbPush('hr/tasks', finalData)

        // Create log
        await fbPush('hr/taskLogs', {
          taskId: code,
          action: 'Tạo công việc',
          description: `Công việc "${finalData.name}" đã được tạo qua Import Excel`,
          createdBy: finalData.assignerId,
          createdAt: now.toISOString()
        })
      }
      alert(`Đã import thành công ${validData.length} công việc`)
      setIsImportModalOpen(false)
      setImportPreviewData([])
      loadData()
    } catch (error) {
      alert('Lỗi import: ' + error.message)
    } finally {
      setIsImporting(false)
    }
  }

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filterDept && task.department !== filterDept) return false
    if (filterStatus && task.status !== filterStatus) return false
    if (filterAssignee && task.assigneeId !== filterAssignee) return false
    if (filterPriority && task.priority !== filterPriority) return false
    return true
  })

  // Get task logs for a task
  const getTaskLogs = (taskId) => {
    return taskLogs.filter(log => log.taskId === taskId)
      .sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0))
  }

  // Get employee name
  const getEmployeeName = (employeeId) => {
    const emp = employees.find(e => e.id === employeeId)
    return emp ? (emp.ho_va_ten || emp.name || 'N/A') : employeeId || 'N/A'
  }

  // Check if task is overdue
  const isOverdue = (task) => {
    if (!task.deadline || task.status === 'Đã xong' || task.status === 'Đã hoàn thành') return false
    const deadline = new Date(task.deadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    deadline.setHours(0, 0, 0, 0)
    return deadline < today
  }

  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-clipboard-list"></i>
          Quản trị Giao việc
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSelectedTask(null)
              setIsTaskModalOpen(true)
            }}
          >
            <i className="fas fa-plus"></i>
            Tạo Task mới
          </button>
          <button
            className="btn"
            onClick={exportTasksToExcel}
            style={{
              background: '#28a745',
              borderColor: '#28a745',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i className="fas fa-file-excel"></i> Xuất Excel
          </button>
          <button
            className="btn btn-info"
            onClick={downloadTaskTemplate}
          >
            <i className="fas fa-download"></i> Tải mẫu
          </button>
          <button
            className="btn"
            onClick={() => setIsImportModalOpen(true)}
            style={{
              background: '#6f42c1',
              borderColor: '#6f42c1',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i className="fas fa-file-import"></i> Import Excel
          </button>
          <SeedTaskDataButton employees={employees} onComplete={loadData} />
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="search-box" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">Tất cả bộ phận</option>
            {[...new Set(tasks.map(t => t.department).filter(Boolean))].sort().map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Chưa bắt đầu">Chưa bắt đầu</option>
            <option value="Đang làm">Đang làm</option>
            <option value="Đã xong">Đã xong</option>
            <option value="Đã hoàn thành">Đã hoàn thành</option>
            <option value="Quá hạn">Quá hạn</option>
            <option value="Tạm dừng">Tạm dừng</option>
          </select>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Tất cả người nhận"
              value={filterAssigneeSearch}
              onChange={(e) => {
                setFilterAssigneeSearch(e.target.value)
                setShowFilterAssigneeDropdown(true)
                if (filterAssignee) setFilterAssignee('') // Clear filter if typing
              }}
              onFocus={() => setShowFilterAssigneeDropdown(true)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '200px' }}
            />
            {showFilterAssigneeDropdown && (
              <React.Fragment>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                  onClick={() => setShowFilterAssigneeDropdown(false)}
                />
                <ul style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: '100%',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 999,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                  <li
                    onClick={() => {
                      setFilterAssignee('')
                      setFilterAssigneeSearch('')
                      setShowFilterAssigneeDropdown(false)
                    }}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#666' }}
                    onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.background = '#fff'}
                  >
                    Tất cả người nhận
                  </li>
                  {employees
                    .filter(emp => {
                      const name = emp.ho_va_ten || emp.name || ''
                      return normalizeString(name).includes(normalizeString(filterAssigneeSearch))
                    })
                    .map(emp => (
                      <li
                        key={emp.id}
                        onClick={() => {
                          setFilterAssignee(emp.id)
                          setFilterAssigneeSearch(emp.ho_va_ten || emp.name || '')
                          setShowFilterAssigneeDropdown(false)
                        }}
                        style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.target.style.background = '#fff'}
                      >
                        {emp.ho_va_ten || emp.name || 'N/A'}
                      </li>
                    ))}
                  {employees.filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(filterAssigneeSearch))).length === 0 && (
                    <li style={{ padding: '10px', color: '#999', textAlign: 'center' }}>Không tìm thấy</li>
                  )}
                </ul>
              </React.Fragment>
            )}
          </div>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">Tất cả mức ưu tiên</option>
            <option value="Cao">Cao</option>
            <option value="Trung bình">Trung bình</option>
            <option value="Thấp">Thấp</option>
          </select>

          <button
            className="btn btn-sm"
            onClick={() => {
              setFilterDept('')
              setFilterStatus('')
              setFilterAssignee('')
              setFilterAssigneeSearch('')
              setFilterPriority('')
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="card">
        <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
          <table style={{ minWidth: '101%', marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã công việc</th>
                <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tên công việc</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Người giao</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Người nhận</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mức ưu tiên</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ngày bắt đầu</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Deadline</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Trạng thái</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Link file kết quả</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task, idx) => {
                  const overdue = isOverdue(task)
                  const status = overdue && task.status !== 'Đã xong' && task.status !== 'Đã hoàn thành'
                    ? 'Quá hạn'
                    : task.status

                  return (
                    <tr key={task.id} style={overdue ? { backgroundColor: '#fff3cd' } : {}}>
                      <td>{idx + 1}</td>
                      <td>{task.code || task.id || '-'}</td>
                      <td>{task.name || task.title || '-'}</td>
                      <td>{task.department || '-'}</td>
                      <td>{task.assignerName || getEmployeeName(task.assignerId) || '-'}</td>
                      <td>{getEmployeeName(task.assigneeId) || '-'}</td>
                      <td>
                        <span className={`badge ${task.priority === 'Cao' ? 'badge-danger' :
                          task.priority === 'Trung bình' ? 'badge-warning' :
                            'badge-info'
                          }`}>
                          {task.priority || '-'}
                        </span>
                      </td>
                      <td>{task.startDate ? new Date(task.startDate).toLocaleDateString('vi-VN') : '-'}</td>
                      <td style={overdue ? { color: 'var(--danger)', fontWeight: 'bold' } : {}}>
                        {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td>
                        <span className={`badge ${status === 'Đã xong' || status === 'Đã hoàn thành' ? 'badge-success' :
                          status === 'Đang làm' ? 'badge-info' :
                            status === 'Quá hạn' ? 'badge-danger' :
                              status === 'Tạm dừng' ? 'badge-warning' :
                                'badge-secondary'
                          }`}>
                          {status || '-'}
                        </span>
                      </td>
                      <td>
                        {task.resultFileLink ? (
                          <a
                            href={task.resultFileLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary)' }}
                          >
                            <i className="fas fa-link"></i> Link
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="edit"
                            onClick={() => {
                              setSelectedTask(task)
                              setIsTaskModalOpen(true)
                            }}
                            title="Sửa"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            className="view"
                            onClick={() => {
                              setSelectedTaskForDetail(task)
                              setIsTaskDetailModalOpen(true)
                            }}
                            title="Xem chi tiết"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            className="delete"
                            onClick={() => handleDeleteTask(task.id)}
                            title="Xóa"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="12" className="empty-state">Chưa có công việc nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Modals */}
      <TaskModal
        task={selectedTask}
        employees={employees}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false)
          setSelectedTask(null)
        }}
        onSave={loadData}
      />

      <TaskDetailModal
        task={selectedTaskForDetail}
        employees={employees}
        taskLogs={getTaskLogs(selectedTaskForDetail?.id)}
        isOpen={isTaskDetailModalOpen}
        onClose={() => {
          setIsTaskDetailModalOpen(false)
          setSelectedTaskForDetail(null)
        }}
        onSave={loadData}
      />

      {/* Import Modal */}
      {
        isImportModalOpen && (
          <div className="modal show" onClick={() => { setIsImportModalOpen(false); setImportPreviewData([]) }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
              <div className="modal-header">
                <h3><i className="fas fa-file-import"></i> Import Danh sách Công việc</h3>
                <button className="modal-close" onClick={() => { setIsImportModalOpen(false); setImportPreviewData([]) }}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Chọn file Excel</label>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
                </div>
                <div style={{ marginTop: '10px', padding: '10px', background: '#e7f3ff', borderRadius: '4px', fontSize: '0.9rem' }}>
                  <strong>Lưu ý:</strong> Cần các cột: Tên công việc, Bộ phận, Người giao (Họ tên), Người nhận (Họ tên), Deadline.
                </div>

                {importPreviewData.length > 0 && (
                  <div style={{ marginTop: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5' }}>
                        <tr>
                          <th>Tên công việc</th>
                          <th>Người giao</th>
                          <th>Người nhận</th>
                          <th>Deadline</th>
                          <th>Trạng thái dữ liệu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.map((d, i) => (
                          <tr key={i}>
                            <td>{d.name}</td>
                            <td style={{ color: d.assignerId ? 'inherit' : 'red' }}>{d.assignerName}</td>
                            <td style={{ color: d.assigneeId ? 'inherit' : 'red' }}>{getEmployeeName(d.assigneeId) || 'Không tìm thấy'}</td>
                            <td>{d.deadline}</td>
                            <td>
                              <span className={`badge ${d.isValid ? 'badge-success' : 'badge-danger'}`}>
                                {d.isValid ? 'Hợp lệ' : 'Thiếu dữ liệu/NV không tồn tại'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => { setIsImportModalOpen(false); setImportPreviewData([]) }}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={isImporting || importPreviewData.filter(d => d.isValid).length === 0}
                  >
                    {isImporting ? 'Đang xử lý...' : `Xác nhận Import (${importPreviewData.filter(d => d.isValid).length})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}

export default Tasks
