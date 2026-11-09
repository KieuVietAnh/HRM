import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { normalizeString } from '../utils/helpers'

function EmployeeKPIModal({ employeeKPI, employees, kpiTemplates, existingKPIs, targetedKPIId, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    month: '',
    status: 'Chưa chốt',
    kpiValues: {}
  })

  // Searchable Select State
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // UI Rows State
  const [uiRows, setUiRows] = useState([])

  // Sync search term with formData.employeeId
  useEffect(() => {
    if (formData.employeeId) {
      const emp = employees.find(e => e.id === formData.employeeId)
      if (emp) {
        setSearchTerm(emp.ho_va_ten || emp.name || '')
      }
    } else {
      setSearchTerm('')
    }
  }, [formData.employeeId, employees])

  useEffect(() => {
    if (employeeKPI) {
      const values = employeeKPI.kpiValues || {}
      setFormData({
        employeeId: employeeKPI.employeeId || '',
        month: employeeKPI.month || '',
        status: employeeKPI.status || 'Chưa chốt',
        kpiValues: values
      })
      // Init UI Rows
      setUiRows(Object.entries(values).map(([kId, val]) => ({
        tempId: kId,
        kpiId: kId,
        target: val.target
      })))
    } else {
      resetForm()
    }
  }, [employeeKPI, isOpen])

  const resetForm = () => {
    const today = new Date()
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    setFormData({
      employeeId: '',
      month: monthStr,
      status: 'Chưa chốt',
      kpiValues: {}
    })
    setUiRows([])
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleRowChange = (index, field, value) => {
    const newRows = [...uiRows]
    newRows[index] = { ...newRows[index], [field]: value }
    setUiRows(newRows)

    // Sync to formData
    const newKpiValues = {}
    newRows.forEach(row => {
      if (row.kpiId) {
        const t = kpiTemplates.find(tpl => tpl.id === row.kpiId || tpl.code === row.kpiId)
        newKpiValues[row.kpiId] = {
          kpiId: row.kpiId,
          target: row.target,
          weight: t?.weight || 0
        }
      }
    })
    setFormData(prev => ({ ...prev, kpiValues: newKpiValues }))
  }

  const calculateTotalWeight = () => {
    return Object.values(formData.kpiValues).reduce((sum, kpi) => {
      const template = kpiTemplates.find(t => t.id === kpi.kpiId || t.code === kpi.kpiId)
      const weight = template?.weight ? Number(template.weight) : 0
      return sum + weight
    }, 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('Starting Save...', formData)
    try {
      // DUPLICATE CHECK
      if (existingKPIs && existingKPIs.length > 0) {
        const isDuplicate = existingKPIs.some(item =>
          item.employeeId === formData.employeeId &&
          item.month === formData.month &&
          (!employeeKPI || item.id !== employeeKPI.id) // If editing, exclude self
        )

        if (isDuplicate) {
          alert(`Nhân viên này đã được gán KPI trong tháng ${formData.month}. Vui lòng kiểm tra lại hoặc sửa bản ghi cũ.`)
          return
        }
      }

      const totalWeight = calculateTotalWeight()
      if (totalWeight !== 100 && !targetedKPIId) {
        if (!confirm(`Tổng trọng số hiện tại là ${totalWeight}%. Bạn có muốn tiếp tục?`)) {
          return
        }
      }

      if (employeeKPI) {
        if (!employeeKPI.id) {
          alert('Lỗi hệ thống: Không tìm thấy ID bản ghi để cập nhật!')
          return
        }
        console.log('Updating KPI:', employeeKPI.id)
        await fbUpdate(`hr/employeeKPIs/${employeeKPI.id}`, formData)
      } else {
        console.log('Creating new KPI')
        await fbPush('hr/employeeKPIs', formData)
      }
      onSave()
      onClose()
      resetForm()
      alert('Đã lưu thành công!') // Feedback for user
    } catch (error) {
      console.error('Save error:', error)
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  // Filter templates: Distinct by Code, prioritizing the one matching the selected month
  // 1. Get all active templates
  // 2. Group by Code
  // 3. For each group, find the one with `month` <= selectedMonth (closest)
  const getRelevantTemplates = () => {
    const active = kpiTemplates.filter(t => t.status === 'Đang áp dụng')

    // Detailed specific target override - look in ALL templates, ignore status
    if (targetedKPIId) {
      return kpiTemplates.filter(t => t.id === targetedKPIId || t.code === targetedKPIId)
    }

    const uniqueMap = new Map()
    const selectedDate = new Date(formData.month)

    active.forEach(t => {
      const currentBest = uniqueMap.get(t.code)
      const tDate = t.month ? new Date(t.month) : new Date(0) // Default to old date if no month

      if (!currentBest) {
        uniqueMap.set(t.code, t)
      } else {
        const bestDate = currentBest.month ? new Date(currentBest.month) : new Date(0)

        // Logic: prefer dates that are <= selectedDate
        // If both are <= selectedDate, pick the later one (closest to assignment)
        // If one is <= and one is >, pick the <= one

        const tValid = tDate <= selectedDate
        const bestValid = bestDate <= selectedDate

        if (tValid && !bestValid) {
          uniqueMap.set(t.code, t)
        } else if (tValid && bestValid) {
          if (tDate > bestDate) uniqueMap.set(t.code, t)
        } else if (!tValid && !bestValid) {
          // Both in future? Pick earlier one? Or just keep current?
          // Usually ideally shouldn't happen if we only assign valid ones.
          // Fallback: pick the one closest to now (earlier)
          if (tDate < bestDate) uniqueMap.set(t.code, t)
        }
      }
    })

    return Array.from(uniqueMap.values())
  }

  const activeTemplates = getRelevantTemplates()

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-user-check"></i>
            {targetedKPIId ? 'Nhập kết quả KPI chi tiết' : (employeeKPI ? 'Sửa KPI nhân viên' : 'Gán KPI cho nhân viên')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {!targetedKPIId && (
              <div className="form-row">
                <div className="form-group">
                  <label>Nhân viên *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Tìm kiếm nhân viên..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value)
                        setShowDropdown(true)
                        // Clear ID if text changes (force re-select)
                        if (formData.employeeId) {
                          handleChange({ target: { name: 'employeeId', value: '' } })
                        }
                      }}
                      onFocus={() => setShowDropdown(true)}
                      style={{ width: '100%', padding: '8px' }}
                      required // Input itself required if ID is empty? Form validation checks formData.employeeId mostly.
                    />
                    {/* Hidden select to satisfy required attribute if needed, or just rely on validation. 
                       Here we ensure visual requirement. The actual validation checks formData.employeeId in handleSubmit usually or native form validation.
                       For native form validation to work with custom input, we might need a hidden input being the specific one.
                   */}
                    <input
                      type="text"
                      style={{ display: 'none' }}
                      name="employeeId"
                      value={formData.employeeId}
                      onChange={() => { }}
                      required
                    />

                    {showDropdown && (
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '0 0 4px 4px',
                        zIndex: 1000,
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        {employees
                          .filter(emp => {
                            const name = emp.ho_va_ten || emp.name || ''
                            return normalizeString(name).includes(normalizeString(searchTerm))
                          })
                          .map(emp => (
                            <li
                              key={emp.id}
                              onClick={() => {
                                handleChange({ target: { name: 'employeeId', value: emp.id } })
                                setSearchTerm(emp.ho_va_ten || emp.name || '')
                                setShowDropdown(false)
                              }}
                              style={{
                                padding: '10px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #eee',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                              onMouseLeave={(e) => e.target.style.background = '#fff'}
                            >
                              <strong>{emp.ho_va_ten || emp.name || 'N/A'}</strong>
                              <br />
                              <small style={{ color: '#666' }}>{emp.vi_tri || '-'} | {emp.bo_phan || '-'}</small>
                            </li>
                          ))}
                        {employees.filter(emp => normalizeString(emp.ho_va_ten || emp.name || '').includes(normalizeString(searchTerm))).length === 0 && (
                          <li style={{ padding: '10px', color: '#999', textAlign: 'center' }}>
                            Không tìm thấy nhân viên
                          </li>
                        )}
                      </ul>
                    )}
                    {/* Overlay to close dropdown */}
                    {showDropdown && (
                      <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                        onClick={() => setShowDropdown(false)}
                      />
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Tháng *</label>
                  <input
                    type="month"
                    name="month"
                    value={formData.month}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            )}

            {(activeTemplates.length > 0 || uiRows.length >= 0) && ( // Ensure it renders 
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  {!targetedKPIId && <h4>Chi tiết KPI</h4>}
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const newTempId = `new_${Date.now()}`
                      setUiRows(prev => [...prev, { tempId: newTempId, kpiId: '', target: '' }])
                    }}
                  >
                    <i className="fas fa-plus"></i> Thêm KPI
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '250px' }}>Mã KPI</th>
                        <th>Tên KPI</th>
                        <th>Đơn vị</th>
                        <th>Kế hoạch</th>
                        <th>Trọng số (%)</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {uiRows.map((row, idx) => {
                        const selectedTemplate = row.kpiId ? activeTemplates.find(t => t.id === row.kpiId || t.code === row.kpiId) : null

                        return (
                          <tr key={row.tempId || row.kpiId}>
                            <td>
                              <select
                                value={row.kpiId}
                                onChange={(e) => handleRowChange(idx, 'kpiId', e.target.value)}
                                style={{ width: '100%', padding: '5px' }}
                              >
                                <option value="">-- Chọn KPI --</option>
                                {activeTemplates.map(t => (
                                  <option
                                    key={t.id}
                                    value={t.id}
                                    disabled={uiRows.some(r => r.kpiId === t.id && r !== row)}
                                  >
                                    {t.code || t.id} - {t.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>{selectedTemplate ? selectedTemplate.name : '-'}</td>
                            <td>{selectedTemplate ? selectedTemplate.unit : '-'}</td>
                            <td>
                              <input
                                type={selectedTemplate?.unit === 'VNĐ' ? 'text' : 'number'}
                                value={row.target}
                                onChange={(e) => {
                                  let val = e.target.value
                                  if (selectedTemplate?.unit === 'VNĐ') {
                                    val = parseFloat(val.replace(/[^\d.-]/g, '')) || 0
                                  }
                                  handleRowChange(idx, 'target', val)
                                }}
                                placeholder="Nhập kế hoạch"
                                style={{ width: '100%' }}
                                disabled={!row.kpiId}
                              />
                            </td>
                            <td>{selectedTemplate ? selectedTemplate.weight + '%' : '-'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => {
                                  const newRows = uiRows.filter((_, i) => i !== idx)
                                  setUiRows(newRows)

                                  // Sync removal to formData
                                  const newKpiValues = {}
                                  newRows.forEach(r => {
                                    if (r.kpiId) {
                                      const t = kpiTemplates.find(tpl => tpl.id === r.kpiId || tpl.code === r.kpiId)
                                      newKpiValues[r.kpiId] = {
                                        kpiId: r.kpiId,
                                        target: r.target,
                                        weight: t?.weight || 0
                                      }
                                    }
                                  })
                                  setFormData(prev => ({ ...prev, kpiValues: newKpiValues }))
                                }}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {uiRows.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center" style={{ padding: '20px', color: '#666' }}>
                            Chưa có KPI nào được gán. Nhấn "Thêm KPI" để bắt đầu.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                  <strong>Tổng trọng số: {uiRows.reduce((sum, row) => {
                    if (!row.kpiId) return sum
                    const t = activeTemplates.find(templ => templ.id === row.kpiId || templ.code === row.kpiId)
                    return sum + (t?.weight ? Number(t.weight) : 0)
                  }, 0)}%</strong>
                  {uiRows.reduce((sum, row) => {
                    if (!row.kpiId) return sum
                    const t = activeTemplates.find(templ => templ.id === row.kpiId || templ.code === row.kpiId)
                    return sum + (t?.weight ? Number(t.weight) : 0)
                  }, 0) !== 100 && (
                      <span style={{ color: 'var(--warning)', marginLeft: '10px' }}>
                        (Khuyến nghị: 100%)
                      </span>
                    )}
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Trạng thái</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="Chưa chốt">Chưa chốt</option>
                <option value="Đã giao">Đã giao</option>
              </select>
            </div>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                <i className="fas fa-save"></i>
                Lưu
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default EmployeeKPIModal

