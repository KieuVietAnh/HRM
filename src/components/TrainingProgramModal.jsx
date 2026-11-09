import React, { useState, useEffect } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'

function TrainingProgramModal({ training, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    format: 'Online',
    provider: 'Nội bộ',
    startDate: '',
    endDate: '',
    objective: '',
    status: 'Sắp diễn ra',
    files: []
  })
  const [filesPreview, setFilesPreview] = useState([])

  useEffect(() => {
    if (training) {
      setFormData({
        code: training.code || training.id || '',
        name: training.name || '',
        format: training.format || training.hinhThuc || 'Online',
        provider: training.provider || training.donVi || 'Nội bộ',
        startDate: training.startDate || '',
        endDate: training.endDate || '',
        objective: training.objective || training.mucTieu || '',
        status: training.status || 'Sắp diễn ra',
        files: training.files || []
      })
      setFilesPreview(training.files || [])
    } else {
      resetForm()
    }
  }, [training, isOpen])

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      format: 'Online',
      provider: 'Nội bộ',
      startDate: '',
      endDate: '',
      objective: '',
      status: 'Sắp diễn ra',
      files: []
    })
    setFilesPreview([])
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (training && training.id) {
        await fbUpdate(`hr/trainings/${training.id}`, formData)
      } else {
        await fbPush('hr/trainings', formData)
      }
      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const readers = files.map(file => new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve({
        name: file.name,
        data: ev.target.result,
        type: file.type
      })
      reader.readAsDataURL(file)
    }))

    Promise.all(readers).then(newFiles => {
      const all = [...formData.files, ...newFiles]
      setFormData({ ...formData, files: all })
      setFilesPreview(all)
    })
  }

  const removeFile = (idx) => {
    const newList = formData.files.filter((_, i) => i !== idx)
    setFormData({ ...formData, files: newList })
    setFilesPreview(newList)
  }

  if (!isOpen) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-chalkboard-teacher"></i>
            {training ? 'Sửa chương trình đào tạo' : 'Thêm chương trình đào tạo'}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Mã chương trình</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="VD: DT-001"
                />
              </div>
              <div className="form-group">
                <label>Tên chương trình đào tạo *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hình thức đào tạo *</label>
                <select
                  name="format"
                  value={formData.format}
                  onChange={handleChange}
                  required
                >
                  <option value="Online">Online</option>
                  <option value="Video">Video (tự học, xem hết video mới làm bài)</option>
                  <option value="Offline">Offline</option>
                  <option value="Bên ngoài">Bên ngoài</option>
                </select>
              </div>
              <div className="form-group">
                <label>Đơn vị đào tạo *</label>
                <select
                  name="provider"
                  value={formData.provider}
                  onChange={handleChange}
                  required
                >
                  <option value="Nội bộ">Nội bộ</option>
                  <option value="Bên ngoài">Bên ngoài</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Thời gian bắt đầu *</label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Thời gian kết thúc *</label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mục tiêu đào tạo</label>
              <textarea
                name="objective"
                value={formData.objective}
                onChange={handleChange}
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Trạng thái</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="Sắp diễn ra">Sắp diễn ra</option>
                <option value="Đang diễn ra">Đang diễn ra</option>
                <option value="Đã kết thúc">Đã kết thúc</option>
                <option value="Hủy">Hủy</option>
              </select>
            </div>

            <div className="form-group">
              <label>Tài liệu đào tạo (gắn với chương trình)</label>
              {filesPreview.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  {filesPreview.map((file, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px',
                      background: '#f5f5f5',
                      borderRadius: '4px',
                      marginBottom: '6px'
                    }}>
                      <span>{file.name || `File ${idx + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        style={{
                          background: 'var(--danger)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                type="file"
                multiple
                onChange={handleFilesChange}
              />
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

export default TrainingProgramModal

