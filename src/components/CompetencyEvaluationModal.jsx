import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function CompetencyEvaluationModal({ evaluation, employees, competencyFramework, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    employeeId: '',
    employeeCode: '',
    position: '',
    department: '',
    period: '',
    evaluationDate: '',
    items: []
  })
  const [filterDept, setFilterDept] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [competencyItems, setCompetencyItems] = useState([])

  useEffect(() => {
    if (evaluation) {
      const emp = employees.find(e => e.id === evaluation.employeeId)
      setSelectedEmployee(emp)
      setFormData({
        employeeId: evaluation.employeeId || '',
        employeeCode: evaluation.employeeCode || '',
        position: evaluation.position || '',
        department: evaluation.department || '',
        period: evaluation.period || '',
        evaluationDate: evaluation.evaluationDate || '',
        items: evaluation.items || []
      })
      if (emp && evaluation.items && evaluation.items.length > 0) {
        setCompetencyItems(evaluation.items)
      } else if (emp) {
        loadCompetencyItems(emp)
      }
    } else {
      resetForm()
    }
  }, [evaluation, isOpen, employees])

  useEffect(() => {
    if (selectedEmployee && !evaluation) {
      loadCompetencyItems(selectedEmployee)
    }
  }, [selectedEmployee])

  const resetForm = () => {
    setFormData({
      employeeId: '',
      employeeCode: '',
      position: '',
      department: '',
      period: '',
      evaluationDate: '',
      items: []
    })
    setSelectedEmployee(null)
    setCompetencyItems([])
  }

  const loadCompetencyItems = (employee) => {
    if (!employee) return

    // Normalize for robust matching
    const empPosition = String(employee.vi_tri || employee.position || '').trim().toLowerCase()
    const empDept = String(employee.bo_phan || employee.department || '').trim().toLowerCase()

    // Lấy các năng lực theo vị trí và bộ phận (hoặc chỉ vị trí nếu framework không chia dept)
    const items = competencyFramework.filter(c => {
      const framePosition = String(c.position || '').trim().toLowerCase()
      const frameDept = String(c.department || '').trim().toLowerCase()

      const posMatch = framePosition === empPosition
      const deptMatch = !c.department || frameDept === empDept || empDept === ''

      return posMatch && deptMatch && c.status === 'Áp dụng'
    })

    // Tạo items với level yêu cầu và level đạt được
    const evaluationItems = items.map(item => {
      const existingItem = formData.items.find(i => i.competencyId === item.id)
      const requiredLevel = Number(item.level || 0)
      const achievedLevel = existingItem ? Number(existingItem.achievedLevel || 0) : requiredLevel

      return {
        competencyId: item.id,
        competencyCode: item.code || item.id,
        competencyName: item.name,
        group: item.group,
        requiredLevel: requiredLevel,
        achievedLevel: achievedLevel,
        difference: achievedLevel - requiredLevel,
        comment: existingItem ? existingItem.comment : ''
      }
    })

    setCompetencyItems(evaluationItems)
    setFormData(prev => ({
      ...prev,
      items: evaluationItems
    }))
  }

  const handleChange = (e) => {
    const value = e.target.value
    const name = e.target.name

    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if (name === 'employeeId') {
      const emp = employees.find(e => e.id === value)
      setSelectedEmployee(emp)
      if (emp) {
        setFormData(prev => ({
          ...prev,
          employeeId: value,
          employeeCode: emp.ma_nhan_vien || emp.employeeCode || emp.code || emp.id || '',
          position: emp.vi_tri || emp.position || '',
          department: emp.bo_phan || emp.department || ''
        }))
      }
    }
  }

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items]
    const item = { ...newItems[index] }

    item[field] = field === 'achievedLevel' ? parseInt(value) || 0 : value

    // Tính điểm chênh lệch
    if (field === 'achievedLevel') {
      item.difference = (parseInt(value) || 0) - item.requiredLevel
    }

    newItems[index] = item
    setFormData(prev => ({
      ...prev,
      items: newItems
    }))
  }

  const calculateAverages = () => {
    if (formData.items.length === 0) return { avgRequired: 0, avgAchieved: 0 }

    const totalRequired = formData.items.reduce((sum, item) => sum + item.requiredLevel, 0)
    const totalAchieved = formData.items.reduce((sum, item) => sum + item.achievedLevel, 0)

    return {
      avgRequired: totalRequired / formData.items.length,
      avgAchieved: totalAchieved / formData.items.length
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (!formData.employeeId || !formData.period || !formData.evaluationDate) {
        alert('Vui lòng chọn Nhân viên, Kỳ đánh giá và Ngày đánh giá')
        return
      }

      if (!formData.items || formData.items.length === 0) {
        alert('Chưa có danh sách năng lực để đánh giá cho vị trí này. Vui lòng kiểm tra lại Khung năng lực.')
        return
      }

      // Validate: achievedLevel must be present
      const invalidItem = formData.items.find(
        (it) => it.achievedLevel === undefined || it.achievedLevel === null
      )
      if (invalidItem) {
        alert('Vui lòng nhập đầy đủ Level đạt được cho tất cả năng lực.')
        return
      }

      const { avgRequired, avgAchieved } = calculateAverages()

      // Mapping field names for backend consistency and user requirements
      const dataToSave = {
        ...formData,
        diemYC: avgRequired,
        diemKQ: avgAchieved,
        avgRequired,
        avgAchieved,
        result: avgAchieved >= avgRequired ? 'Đạt' : 'Cần cải thiện',
        updatedAt: new Date().toISOString()
      }

      if (evaluation && evaluation.id) {
        await fbUpdate(`hr/employee_competency_assessment/${evaluation.id}`, dataToSave)
      } else {
        await fbPush('hr/employee_competency_assessment', dataToSave)
      }

      alert('Đã lưu kết quả đánh giá thành công.')
      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-star"></i>
            {evaluation ? 'Sửa đánh giá năng lực' : 'Nhập đánh giá năng lực'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Bộ phận</label>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                >
                  <option value="">Tất cả bộ phận</option>
                  {[...new Set(employees.map(emp => (emp.bo_phan || emp.department || '')).filter(Boolean))].sort().map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Nhân viên *</label>
                <select
                  name="employeeId"
                  value={formData.employeeId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Chọn nhân viên</option>
                  {employees
                    .filter(emp => !filterDept || (emp.bo_phan || emp.department || '') === filterDept)
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.ho_va_ten || emp.name || 'N/A'} - {emp.vi_tri || '-'}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Kỳ đánh giá *</label>
                <input
                  type="text"
                  name="period"
                  value={formData.period}
                  onChange={handleChange}
                  required
                  placeholder="VD: Q1/2025, Tháng 12/2025"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ngày đánh giá *</label>
                <input
                  type="date"
                  name="evaluationDate"
                  value={formData.evaluationDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Bộ phận</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  readOnly
                />
              </div>
            </div>

            {formData.items.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '15px' }}>Bảng 1: Kết quả đánh giá năng lực</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Nhóm năng lực</th>
                        <th>Tên năng lực</th>
                        <th>Level yêu cầu</th>
                        <th>Level đạt được</th>
                        <th>Điểm chênh lệch</th>
                        <th>Nhận xét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{item.group}</td>
                          <td>{item.competencyName}</td>
                          <td>{item.requiredLevel}</td>
                          <td>
                            <select
                              value={item.achievedLevel}
                              onChange={(e) => handleItemChange(idx, 'achievedLevel', e.target.value)}
                              style={{ width: '80px' }}
                            >
                              {[1, 2, 3, 4, 5].map(level => (
                                <option key={level} value={level}>{level}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{
                            color: item.difference > 0 ? 'var(--success)' :
                              item.difference < 0 ? 'var(--danger)' : 'var(--text)',
                            fontWeight: 'bold'
                          }}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={item.comment}
                              onChange={(e) => handleItemChange(idx, 'comment', e.target.value)}
                              placeholder="Nhận xét"
                              style={{ width: '100%' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                  <strong>Điểm trung bình:</strong>
                  <div style={{ marginTop: '5px' }}>
                    Điểm YC: {calculateAverages().avgRequired.toFixed(1)} |
                    Điểm KQ: {calculateAverages().avgAchieved.toFixed(1)} |
                    Kết quả: <span style={{
                      color: calculateAverages().avgAchieved > calculateAverages().avgRequired ? 'var(--success)' : 'var(--warning)',
                      fontWeight: 'bold'
                    }}>
                      {calculateAverages().avgAchieved > calculateAverages().avgRequired ? 'Đạt' : 'Cần cải thiện'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={formData.items.length === 0}>
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

export default CompetencyEvaluationModal

