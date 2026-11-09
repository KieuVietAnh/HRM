import { useEffect, useState } from 'react'
import { fbGet, fbUpdate } from '../services/firebase'
import { getCloudinaryConfig, saveCloudinaryConfig } from '../utils/cloudinary'
import {
  ATTENDANCE_SHIFT_IDS,
  buildAttendanceShiftSettingsPayload,
  getAttendanceShiftOptions,
  normalizeAttendanceShiftSettings
} from '../utils/attendanceShift'

function AttendanceSettingsModal({ isOpen, onClose, onSaved }) {
  const [settings, setSettings] = useState(() => normalizeAttendanceShiftSettings())
  const [selectedShiftId, setSelectedShiftId] = useState(ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE)
  const [cloudName, setCloudName] = useState('')
  const [uploadPreset, setUploadPreset] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setError('')
    const { cloudName: cName, uploadPreset: cPreset } = getCloudinaryConfig()
    setCloudName(cName)
    setUploadPreset(cPreset)

    fbGet('hr/attendanceSettings/default').then(storedSettings => {
      setSettings(normalizeAttendanceShiftSettings(storedSettings))
      setSelectedShiftId(ATTENDANCE_SHIFT_IDS.ADMINISTRATIVE)
      setHolidayDate('')
      setHolidayName('')
    }).catch(requestError => setError(requestError.message)).finally(() => setLoading(false))
  }, [isOpen])

  const shiftOptions = getAttendanceShiftOptions(settings)
  const selectedShift = settings.shifts[selectedShiftId]
  const updateSelectedShift = (field, value) => {
    setSettings(current => ({
      ...current,
      shifts: {
        ...current.shifts,
        [selectedShiftId]: {
          ...current.shifts[selectedShiftId],
          [field]: value
        }
      }
    }))
  }

  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return
    setSettings(current => ({
      ...current,
      holidays: [
        ...(current.holidays || []).filter(item => item.date !== holidayDate),
        { date: holidayDate, name: holidayName.trim() }
      ].sort((left, right) => left.date.localeCompare(right.date))
    }))
    setHolidayDate('')
    setHolidayName('')
  }

  const removeHoliday = date => setSettings(current => ({
    ...current,
    holidays: (current.holidays || []).filter(item => item.date !== date)
  }))

  const submit = async event => {
    event.preventDefault()
    const invalidShift = getAttendanceShiftOptions(settings).find(
      shift => shift.standardCheckIn === shift.standardCheckOut
    )
    if (invalidShift) {
      setSelectedShiftId(invalidShift.id)
      setError(`Giờ ra chuẩn của ${invalidShift.name} phải khác giờ vào chuẩn.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await fbUpdate(
        'hr/attendanceSettings/default',
        buildAttendanceShiftSettingsPayload(settings)
      )
      saveCloudinaryConfig(cloudName, uploadPreset)
      await onSaved?.()
      onClose()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null
  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content attendance-settings" onClick={event => event.stopPropagation()}>
        <div className="modal-header"><h2>Cài đặt giờ chấm công</h2><button className="modal-close" onClick={onClose} type="button">&times;</button></div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p style={{ marginBottom: 18, color: '#64748b' }}>Chọn từng ca để cài giờ chuẩn riêng. Báo cáo đi muộn/về sớm sẽ dùng ca của từng nhân viên.</p>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            {loading ? <div style={{ padding: 24, textAlign: 'center' }}>Đang tải cài đặt...</div> : <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {shiftOptions.map(shift => (
                  <button
                    key={shift.id}
                    className={`btn ${selectedShiftId === shift.id ? 'btn-primary' : ''}`}
                    type="button"
                    onClick={() => setSelectedShiftId(shift.id)}
                  >
                    {shift.name} ({shift.standardCheckIn}–{shift.standardCheckOut})
                  </button>
                ))}
              </div>
              <div className="attendance-settings__grid">
                <div className="form-group"><label>Giờ vào chuẩn</label><input type="time" value={selectedShift?.standardCheckIn || ''} onChange={event => updateSelectedShift('standardCheckIn', event.target.value)} required /></div>
                <div className="form-group"><label>Giờ ra chuẩn</label><input type="time" value={selectedShift?.standardCheckOut || ''} onChange={event => updateSelectedShift('standardCheckOut', event.target.value)} required /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', color: '#334155' }}>
                <input
                  type="checkbox"
                  checked={settings.overtime?.autoCalculate !== false}
                  onChange={event => setSettings(current => ({
                    ...current,
                    overtime: { ...(current.overtime || {}), autoCalculate: event.target.checked }
                  }))}
                />
                Tự động tính phần vượt 480 phút (HR có thể tắt để tự đánh dấu Excel)
              </label>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>Ngày lễ / ngày nghỉ hưởng chế độ</h4>
                <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: 13 }}>Ngày đã khai báo được đánh dấu riêng trong bảng công; không tự tạo Công khi không có dữ liệu chấm công.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(160px, 1.5fr) auto', gap: 8, alignItems: 'end' }}>
                  <div className="form-group"><label>Ngày</label><input type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} /></div>
                  <div className="form-group"><label>Tên ngày lễ</label><input type="text" value={holidayName} onChange={event => setHolidayName(event.target.value)} placeholder="Ví dụ: Quốc khánh" /></div>
                  <button type="button" className="btn" onClick={addHoliday} disabled={!holidayDate}>Thêm ngày lễ</button>
                </div>
                {(settings.holidays || []).length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                  {settings.holidays.map(item => <div key={item.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 9px', background: '#f8fafc', borderRadius: 6 }}>
                    <span><strong>{item.date}</strong>{item.name ? ` — ${item.name}` : ''}</span>
                    <button type="button" className="btn btn-icon" title="Xoá ngày lễ" onClick={() => removeHoliday(item.date)}><i className="fas fa-trash"></i></button>
                  </div>)}
                </div>}
              </div>
              <h4 style={{ margin: '18px 0 8px', fontSize: '14px', color: '#1e293b' }}>Cấu hình Cloudinary (Lưu trữ ảnh xác thực)</h4>
              <div className="attendance-settings__grid">
                <div className="form-group"><label>Cloud Name</label><input type="text" placeholder="ksny3wwy" value={cloudName} onChange={event => setCloudName(event.target.value)} /></div>
                <div className="form-group"><label>Upload Preset (Unsigned)</label><input type="text" placeholder="nr5kwa0r" value={uploadPreset} onChange={event => setUploadPreset(event.target.value)} /></div>
              </div>
            </>}
          </div>
          <div className="attendance-settings__footer"><button className="btn" type="button" onClick={onClose}>Hủy</button><button className="btn btn-primary" type="submit" disabled={loading || saving}>{saving ? 'Đang lưu...' : 'Lưu cài đặt'}</button></div>
        </form>
      </div>
    </div>
  )
}

export default AttendanceSettingsModal
