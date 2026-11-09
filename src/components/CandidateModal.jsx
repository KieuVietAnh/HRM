import { useEffect, useState } from 'react'
import { fbPush, fbUpdate } from '../services/firebase'
import { asIdentityText } from '../utils/helpers'

function CandidateModal({ candidate, isOpen, onClose, onSave, readOnly = false, employees = [] }) {
  const [formData, setFormData] = useState({
    ho_ten: '',
    vi_tri_ung_tuyen: '',
    bo_phan: '',
    nguon_cv: '',
    hr_phu_trach: '',
    sdt: '',
    email: '',
    trang_thai: 'CV tiếp nhận',
    ngay_tiep_nhan: '',
    cv_files: []
  })

  const [filesPreview, setFilesPreview] = useState([])
  const [showHrSuggestions, setShowHrSuggestions] = useState(false)

  useEffect(() => {
    if (candidate) {
      setFormData({
        ho_ten: candidate.ho_ten || candidate.name || '',
        vi_tri_ung_tuyen: candidate.vi_tri_ung_tuyen || candidate.vi_tri || '',
        bo_phan: candidate.bo_phan || '',
        nguon_cv: candidate.nguon_cv || '',
        hr_phu_trach: candidate.hr_phu_trach || '',
        sdt: asIdentityText(candidate.sdt || candidate.sđt, 'phone'),
        email: candidate.email || '',
        trang_thai: candidate.trang_thai || 'CV tiếp nhận',
        ngay_tiep_nhan: candidate.ngay_tiep_nhan || '',
        cv_files: candidate.cv_files || []
      })





      setFilesPreview(candidate.cv_files || [])
    } else {
      resetForm()
    }
  }, [candidate, isOpen])

  const resetForm = () => {
    setFormData({
      ho_ten: '',
      vi_tri_ung_tuyen: '',
      bo_phan: '',
      nguon_cv: '',
      hr_phu_trach: '',
      sdt: '',
      email: '',
      trang_thai: 'CV tiếp nhận',
      ngay_tiep_nhan: '',
      cv_files: []
    })
    setFilesPreview([])
    setShowHrSuggestions(false)
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleFilesChange = async (e) => {
    const files = Array.from(e.target.files || [])
    const newFiles = []

    for (const file of files) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        newFiles.push({
          name: file.name,
          data: ev.target.result,
          type: file.type
        })
        if (newFiles.length === files.length) {
          const allFiles = [...formData.cv_files, ...newFiles]
          setFilesPreview(allFiles)
          setFormData({
            ...formData,
            cv_files: allFiles
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const removeFile = (index) => {
    const newFiles = filesPreview.filter((_, i) => i !== index)
    setFilesPreview(newFiles)
    setFormData({
      ...formData,
      cv_files: newFiles
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return

    try {
      if (!formData.ho_ten || !formData.vi_tri_ung_tuyen || !formData.bo_phan) {
        alert('Vui lòng nhập Họ tên, Vị trí ứng tuyển và Bộ phận')
        return
      }

      const payload = {
        ho_ten: formData.ho_ten.trim(),
        vi_tri_ung_tuyen: formData.vi_tri_ung_tuyen.trim(),
        bo_phan: formData.bo_phan.trim(),
        nguon_cv: formData.nguon_cv.trim(),
        hr_phu_trach: formData.hr_phu_trach.trim(),
        sdt: formData.sdt.trim(),
        email: formData.email.trim(),
        trang_thai: formData.trang_thai,
        ngay_tiep_nhan: formData.ngay_tiep_nhan || new Date().toISOString().split('T')[0],
        cv_files: formData.cv_files || [],
        da_chuyen_sang_nv: candidate?.da_chuyen_sang_nv || false,
        linkedEmployeeId: candidate?.linkedEmployeeId || ''
      }

      if (candidate && candidate.id) {
        await fbUpdate(`hr/candidates/${candidate.id}`, payload)

        if (candidate.trang_thai !== formData.trang_thai) {
          await fbPush('hr/candidateStatusLogs', {
            candidateId: candidate.id,
            oldStatus: candidate.trang_thai || '',
            newStatus: formData.trang_thai,
            createdAt: new Date().toISOString()
          })
        }
      } else {
        const res = await fbPush('hr/candidates', payload)
        const newId = res?.name
        await fbPush('hr/candidateStatusLogs', {
          candidateId: newId || '',
          oldStatus: '',
          newStatus: formData.trang_thai,
          createdAt: new Date().toISOString()
        })
      }

      onSave()
      onClose()
      resetForm()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen) return null

  const getTitle = () => {
    if (readOnly) return 'Chi tiết hồ sơ ứng viên'
    return candidate ? 'Sửa CV ứng viên' : 'Tạo mới CV ứng viên'
  }

  // Filter employees for HR suggestions
  const hrEmployees = employees.filter(e => {
    const position = (e.vi_tri || e.position || '').toLowerCase()
    return position.includes('hr') || position.includes('nhân sự') || position.includes('tuyển dụng')
  })

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className={readOnly ? "fas fa-eye" : "fas fa-user-tie"}></i>
            {getTitle()}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Họ và tên *</label>
                <input
                  type="text"
                  name="ho_ten"
                  value={formData.ho_ten}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Vị trí ứng tuyển *</label>
                <input
                  type="text"
                  name="vi_tri_ung_tuyen"
                  value={formData.vi_tri_ung_tuyen}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Bộ phận *</label>
                <input
                  type="text"
                  name="bo_phan"
                  value={formData.bo_phan}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                />
              </div>

              <div className="form-group">
                <label>Nguồn CV</label>
                <input
                  type="text"
                  name="nguon_cv"
                  value={formData.nguon_cv}
                  onChange={handleChange}
                  placeholder="VD: Facebook, Giới thiệu, Website..."
                  disabled={readOnly}
                />
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>HR phụ trách</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    name="hr_phu_trach"
                    value={formData.hr_phu_trach}
                    onChange={handleChange}
                    onFocus={() => setShowHrSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowHrSuggestions(false), 200)}
                    placeholder="Nhập hoặc chọn HR phụ trách..."
                    disabled={readOnly}
                    autoComplete="off"
                  />
                  {!readOnly && (
                    <i
                      className="fas fa-chevron-down"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#6c757d',
                        pointerEvents: 'none'
                      }}
                    ></i>
                  )}
                </div>

                {showHrSuggestions && !readOnly && hrEmployees.length > 0 && (
                  <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    padding: 0,
                    margin: 0,
                    listStyle: 'none',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}>
                    {hrEmployees.map((hr, idx) => (
                      <li
                        key={idx}
                        onClick={() => {
                          setFormData({ ...formData, hr_phu_trach: hr.ho_va_ten || hr.ho_ten || hr.name })
                          setShowHrSuggestions(false)
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: idx < hrEmployees.length - 1 ? '1px solid #f0f0f0' : 'none'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.background = '#fff'}
                      >
                        {hr.ho_va_ten || hr.ho_ten || hr.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>SĐT</label>
                <input
                  type="text"
                  name="sdt"
                  value={formData.sdt}
                  onChange={handleChange}
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Trạng thái</label>
                <select
                  name="trang_thai"
                  value={formData.trang_thai}
                  onChange={handleChange}
                  disabled={readOnly}
                >
                  <option value="CV tiếp nhận">CV tiếp nhận</option>
                  <option value="CV đã liên hệ">CV đã liên hệ</option>
                  <option value="CV phỏng vấn">CV phỏng vấn</option>
                  <option value="CV trúng tuyển">CV trúng tuyển</option>
                  <option value="CV không phù hợp">CV không phù hợp</option>
                </select>
              </div>
              <div className="form-group">
                <label>Ngày tiếp nhận</label>
                <input
                  type="date"
                  name="ngay_tiep_nhan"
                  value={formData.ngay_tiep_nhan}
                  onChange={handleChange}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Upload CV (có thể nhiều file)</label>
              {filesPreview.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  {filesPreview.map((file, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        background: '#f5f5f5',
                        borderRadius: '4px',
                        marginBottom: '5px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <i className={`fas ${file.type?.includes('pdf') ? 'fa-file-pdf' :
                          file.type?.includes('word') || file.type?.includes('document') ? 'fa-file-word' :
                            'fa-file'
                          }`} style={{ color: file.type?.includes('pdf') ? '#d32f2f' : '#2196f3' }}></i>
                        <span style={{ flex: 1 }}>{file.name || `File ${idx + 1}`}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const link = document.createElement('a')
                            link.href = file.data
                            link.download = file.name || `CV_${idx + 1}`
                            link.click()
                          }}
                          style={{
                            background: '#4caf50',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                          title="Tải xuống"
                        >
                          <i className="fas fa-download"></i>
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            style={{
                              background: 'var(--danger)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                            title="Xóa"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <input
                  type="file"
                  multiple
                  onChange={handleFilesChange}
                  accept=".pdf,.doc,.docx"
                />
              )}
            </div>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                {readOnly ? 'Đóng' : 'Hủy'}
              </button>
              {!readOnly && (
                <button type="submit" className="btn btn-primary">
                  <i className="fas fa-save"></i>
                  Lưu
                </button>
              )}
            </div>
          </form>
        </div>
      </div >
    </div >
  )
}

export default CandidateModal


