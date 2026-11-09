import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../services/supabase'
import { fbGet } from '../services/firebase'
import { rebuildAttendanceMonthSummaryForDate } from '../services/attendanceMonthSummary'
import { getCompanyIdForUser, getCompanyNameForContext } from '../utils/companyContext'
import { uploadToCloudinary } from '../utils/cloudinary'
import {
  normalizeAttendanceShiftSettings,
  resolveAttendanceShift
} from '../utils/attendanceShift'
import './OnlineAttendance.css'

const getTime = value => {
  if (!value) return '—'
  const direct = String(value).match(/^(\d{1,2}):(\d{2})/)
  if (direct) return `${direct[1].padStart(2, '0')}:${direct[2]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
}

const buildMapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

const requestPosition = options =>
  new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ error: 'unsupported' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = Number(position.coords.latitude)
        const lng = Number(position.coords.longitude)
        resolve({
          lat,
          lng,
          accuracy: Number(position.coords.accuracy) || null,
          at: new Date().toISOString(),
          mapsUrl: buildMapsUrl(lat, lng)
        })
      },
      err => {
        const code = err?.code
        resolve({
          error: code === 1 ? 'denied' : code === 2 ? 'unavailable' : code === 3 ? 'timeout' : 'failed',
          message: err?.message || ''
        })
      },
      options
    )
  })

// Máy tính thường không có GPS: thử độ chính xác cao trước, sau đó dùng vị trí theo Wi-Fi/IP của trình duyệt.
const captureGeolocation = async () => {
  const precise = await requestPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  if (!precise.error || precise.error === 'denied' || precise.error === 'unsupported') return precise
  const coarse = await requestPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
  return coarse.error ? precise : coarse
}

// Đổi toạ độ thành địa chỉ đọc được (OpenStreetMap Nominatim); lỗi mạng thì bỏ qua.
const reverseGeocode = async (lat, lng) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=vi&lat=${lat}&lon=${lng}`,
      { signal: controller.signal }
    )
    if (!response.ok) return ''
    const data = await response.json()
    return String(data?.display_name || '')
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

const describeDevice = () => {
  const ua = navigator.userAgent || ''
  const isMobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(ua)
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt khác'
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  return `${isMobile ? 'Điện thoại' : 'Máy tính'} · ${platform} · ${browser}`
}

function OnlineAttendance() {
  const { user } = useAuth()
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'manager'
  const [today, setToday] = useState(null)
  const [selectedShiftKey, setSelectedShiftKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 1. Đồng hồ thời gian thực
  const [currentTime, setCurrentTime] = useState(new Date())

  // 2. Chụp ảnh & Tải ảnh Cloudinary
  const [photoPreview, setPhotoPreview] = useState(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // 3. Cài đặt ca làm việc
  const [attendanceSettings, setAttendanceSettings] = useState(() => normalizeAttendanceShiftSettings())

  // Cập nhật đồng hồ mỗi giây
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Tải cài đặt ca và Cloudinary ban đầu
  useEffect(() => {
    fbGet('hr/attendanceSettings/default')
      .then(settings => {
        const normalized = normalizeAttendanceShiftSettings(settings)
        setAttendanceSettings(normalized)
      })
      .catch(() => {})

  }, [])

  // Camera management
  const startCamera = async () => {
    setIsCameraActive(true)
    setPhotoPreview(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setError(`Không thể bật camera: ${err.message}`)
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setPhotoPreview(dataUrl)
    stopCamera()
  }

  // Tải dữ liệu chấm công hôm nay
  const loadToday = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: requestError } = await supabase.rpc('get_online_attendance_today')
    if (requestError) {
      setError(requestError.message)
    } else {
      setToday(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  const currentDate = currentTime.toLocaleDateString('en-CA', { timeZone: today?.timezone || 'Asia/Ho_Chi_Minh' })
  useEffect(() => {
    if (today?.date && today.date !== currentDate) loadToday()
  }, [currentDate, today?.date, loadToday])

  const shifts = useMemo(() => {
    if (Array.isArray(today?.shifts)) return today.shifts
    if (!today) return []
    return [{
      shiftId: '__profile__',
      workDate: today.date,
      name: today.shiftName || 'Ca làm việc',
      standardCheckIn: today.standardCheckIn,
      standardCheckOut: today.standardCheckOut,
      record: today.record || null
    }]
  }, [today])
  const shiftKey = shift => `${shift?.workDate || ''}::${shift?.shiftId || ''}`
  useEffect(() => {
    if (!shifts.length) return
    if (shifts.some(shift => shiftKey(shift) === selectedShiftKey)) return
    const activeShift = shifts.find(shift =>
      (shift.record?.punchPairs || []).some(pair => pair.checkIn && !pair.checkOut)
    )
    const previousShift = shifts.find(shift => shift.workDate < today?.date)
    setSelectedShiftKey(shiftKey(activeShift || previousShift || shifts[0]))
  }, [selectedShiftKey, shifts, today?.date])
  const selectedShift = shifts.find(shift => shiftKey(shift) === selectedShiftKey) || shifts[0] || null
  const record = selectedShift?.record || null
  const punchPairs = Array.isArray(record?.punchPairs) && record.punchPairs.length
    ? record.punchPairs
    : record && (record.vao || record.checkIn)
      ? [{
          checkIn: record.vao || record.checkIn,
          checkOut: record.ra || record.checkOut || '',
          checkInPhoto: record.checkInPhoto,
          checkOutPhoto: record.checkOutPhoto
        }]
      : []
  const activePair = [...punchPairs].reverse().find(pair => pair.checkIn && !pair.checkOut) || null
  const latestPair = punchPairs[punchPairs.length - 1] || null
  const currentPair = activePair || latestPair
  const checkedIn = Boolean(activePair)
  const checkedOut = Boolean(latestPair?.checkOut && !activePair)
  const userShift = useMemo(
    () => selectedShift
      ? resolveAttendanceShift({}, {
          shiftId: selectedShift.shiftId,
          shiftName: selectedShift.name,
          standardCheckIn: selectedShift.standardCheckIn,
          standardCheckOut: selectedShift.standardCheckOut
        }, attendanceSettings)
      : resolveAttendanceShift(user, record || {}, attendanceSettings),
    [attendanceSettings, record, selectedShift, user]
  )
  const standardIn = userShift.start
  const standardOut = userShift.end

  // Tính số phút đi muộn / về sớm thời gian thực
  const calcTimingStatus = () => {
    const [stdInHour, stdInMin] = (standardIn || '08:30').split(':').map(Number)
    const [stdOutHour, stdOutMin] = (standardOut || '17:30').split(':').map(Number)

    // Nếu đã check-in
    let checkInStatus = null
    if (checkedIn) {
      const vaoStr = currentPair?.checkIn || record?.vao || ''
      const [vH, vM] = vaoStr.split(':').map(Number)
      if (!Number.isNaN(vH) && !Number.isNaN(vM)) {
        const reportedLate = currentPair?.lateMinutes ?? record?.lateMinutes ?? record?.vaoTre
        const diffMinutes = Number.isFinite(Number(reportedLate))
          ? Number(reportedLate)
          : (vH * 60 + vM) - (stdInHour * 60 + stdInMin)
        if (diffMinutes > 0) {
          checkInStatus = { isLate: true, text: `Đi muộn ${diffMinutes} phút`, class: 'badge-danger' }
        } else {
          checkInStatus = { isLate: false, text: diffMinutes === 0 ? 'Đúng giờ' : `Đúng giờ (Sớm ${Math.abs(diffMinutes)}p)`, class: 'badge-success' }
        }
      }
    } else {
      // Chưa check-in -> so sánh thời gian hiện tại
      const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes() +
        (selectedShift?.workDate && today?.date && selectedShift.workDate < today.date ? 1440 : 0)
      const stdInMinutes = stdInHour * 60 + stdInMin
      if (nowMinutes > stdInMinutes) {
        checkInStatus = { isLate: true, text: `Muộn ${nowMinutes - stdInMinutes}p nếu check-in lúc này`, class: 'badge-warning' }
      } else {
        checkInStatus = { isLate: false, text: 'Check-in đúng giờ', class: 'badge-success' }
      }
    }

    // Check-out status
    let checkOutStatus = null
    if (checkedOut) {
      const raStr = currentPair?.checkOut || record?.ra || ''
      const [rH, rM] = raStr.split(':').map(Number)
      if (!Number.isNaN(rH) && !Number.isNaN(rM)) {
        const reportedEarly = currentPair?.earlyMinutes ?? record?.earlyMinutes ?? record?.raSom
        const diffMinutes = Number.isFinite(Number(reportedEarly))
          ? -Number(reportedEarly)
          : (rH * 60 + rM) - (stdOutHour * 60 + stdOutMin)
        if (diffMinutes < 0) {
          checkOutStatus = { isEarly: true, text: `Về sớm ${Math.abs(diffMinutes)} phút`, class: 'badge-warning' }
        } else if (diffMinutes > 0) {
          checkOutStatus = { isEarly: false, text: `Đúng giờ (Tăng ca ${diffMinutes}p)`, class: 'badge-success' }
        } else {
          checkOutStatus = { isEarly: false, text: 'Đúng giờ', class: 'badge-success' }
        }
      }
    }

    return { checkInStatus, checkOutStatus }
  }

  const { checkInStatus, checkOutStatus } = calcTimingStatus()

  // Nộp chấm công (Check-in hoặc Check-out)
  const submit = async action => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')

    try {
      // 1. Upload ảnh lên Cloudinary nếu có ảnh
      let uploadedPhotoUrl = ''
      if (photoPreview) {
        uploadedPhotoUrl = await uploadToCloudinary(photoPreview)
      }

      // 2a. Lấy vị trí tại thời điểm chấm công (không chặn chấm công nếu thiếu vị trí)
      const capturedLocation = await captureGeolocation()
      if (!capturedLocation.error) {
        capturedLocation.address = await reverseGeocode(capturedLocation.lat, capturedLocation.lng)
      }
      capturedLocation.device = describeDevice()

      if (!selectedShift?.shiftId || !selectedShift?.workDate) {
        throw new Error('Chưa có ca làm việc được duyệt để chấm công.')
      }

      // Chấm vào/ra trong cùng RPC để ảnh và vị trí gắn đúng từng lượt.
      const { data, error: requestError } = await supabase.rpc('employee_online_attendance_punch', {
        p_work_date: selectedShift.workDate,
        p_shift_id: selectedShift.shiftId,
        p_action: action,
        p_photo: uploadedPhotoUrl || null,
        p_location: capturedLocation
      })

      if (requestError) {
        throw new Error(requestError.message)
      }

      // Cập nhật riêng log của ca vừa chấm.
      setToday(current => {
        const nextShifts = [...(current?.shifts || shifts)]
        const index = nextShifts.findIndex(shift => shiftKey(shift) === shiftKey(selectedShift))
        if (index >= 0) nextShifts[index] = { ...nextShifts[index], record: data?.record || null }
        return { ...current, shifts: nextShifts, record: data?.record || null }
      })

      setPhotoPreview(null)
      stopCamera()
      setNotice(action === 'in' ? '✓ Check-in thành công!' : '✓ Check-out thành công!')

      // Đồng bộ vào bảng công tháng (attendanceMonthSummaries) để /bang-cong-preview thấy ngay.
      const recordDate = data?.date || data?.record?.date || new Date().toISOString().slice(0, 10)
      try {
        await rebuildAttendanceMonthSummaryForDate(recordDate, {
          companyId: getCompanyIdForUser(user),
          companyName: getCompanyNameForContext({ name: 'SpeeGo Logistics' }, user)
        })
      } catch (syncError) {
        console.warn('Đã chấm công nhưng chưa đồng bộ bảng công tháng:', syncError)
        setNotice(previous =>
          `${previous || ''} Chưa cập nhật được bảng công tổng hợp — bấm “Tổng hợp lại” trên Bảng công.`
        )
      }
      await loadToday()
    } catch (err) {
      setError(err.message || 'Lỗi khi chấm công')
    } finally {
      setSubmitting(false)
    }
  }

  const hoursStr = String(currentTime.getHours()).padStart(2, '0')
  const minutesStr = String(currentTime.getMinutes()).padStart(2, '0')
  const secondsStr = String(currentTime.getSeconds()).padStart(2, '0')
  const dayOfWeekNames = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  const dateFormatted = `${dayOfWeekNames[currentTime.getDay()]}, ${currentTime.getDate().toString().padStart(2, '0')}/${(currentTime.getMonth() + 1).toString().padStart(2, '0')}/${currentTime.getFullYear()}`

  return (
    <div className="online-attendance-v2">
      {/* Header */}
      <div className="oa-header">
        <div>
          <h1>Chấm công online</h1>
          <p className="oa-subtitle">
            {user.ho_va_ten || user.name || user.email} · {dateFormatted}
          </p>
        </div>
        <div className="oa-header-actions">
          <Link className="oa-btn-view oa-btn-view--ghost" to="/lich-su-cham-cong">
            <i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Lịch sử chấm công
          </Link>
          <Link className="oa-btn-view" to={isAdminOrManager ? '/bang-cong-preview' : '/bang-cong'}>
            <i className="fas fa-calendar-check" aria-hidden="true"></i> Xem bảng công
          </Link>
        </div>
      </div>

      {/* Hero: Đồng hồ thời gian thực */}
      <div className="oa-dashboard-grid">
        <div className="oa-clock-card">
          <div className="oa-card-label">ĐỒNG HỒ HỆ THỐNG (GIỜ VIỆT NAM)</div>
          <div className="oa-digital-clock">
            <span className="oa-digit">{hoursStr}</span>
            <span className="oa-colon">:</span>
            <span className="oa-digit">{minutesStr}</span>
            <span className="oa-colon">:</span>
            <span className="oa-digit oa-seconds">{secondsStr}</span>
          </div>
          <div className="oa-clock-meta">
            <div className="oa-clock-date">{dateFormatted}</div>
            <div className="oa-shift-badge">
              {selectedShift?.name || userShift.name}: <strong>{standardIn} - {standardOut}</strong>
            </div>
          </div>
        </div>
      </div>

      {shifts.length > 1 && (
        <label className="oa-shift-select">
          <span>Chọn ca cần chấm</span>
          <select value={selectedShiftKey} onChange={event => setSelectedShiftKey(event.target.value)}>
            {shifts.map(shift => <option key={shiftKey(shift)} value={shiftKey(shift)}>
              {shift.name} ({shift.standardCheckIn}–{shift.standardCheckOut}) · {shift.workDate}
            </option>)}
          </select>
        </label>
      )}

      {/* Thông báo thông điệp */}
      {error && <div className="oa-alert oa-alert-danger">{error}</div>}
      {notice && <div className="oa-alert oa-alert-success">{notice}</div>}
      {!loading && shifts.length === 0 && <div className="oa-alert oa-alert-warning">Ngày này chưa có ca được duyệt để chấm công.</div>}

      {/* Trạng thái lượt chấm gần nhất của ca đang chọn */}
      <div className="oa-punches-grid">
        {/* Cột Check-in */}
        <div className={`oa-punch-box ${checkedIn || checkedOut ? 'is-done' : 'is-pending'}`}>
          <div className="oa-punch-header">
            <span>GIỜ VÀO (CHECK-IN)</span>
            <span className="oa-req-time">Chuẩn: {standardIn}</span>
          </div>
          <div className="oa-punch-time">
            {currentPair?.checkIn ? getTime(currentPair.checkIn) : 'Chưa chấm'}
          </div>
          <div className="oa-punch-status">
            {checkInStatus && (
              <span className={`oa-badge ${checkInStatus.class}`}>{checkInStatus.text}</span>
            )}
          </div>
        </div>

        {/* Cột Check-out */}
        <div className={`oa-punch-box ${checkedOut ? 'is-done' : checkedIn ? 'is-active' : 'is-pending'}`}>
          <div className="oa-punch-header">
            <span>GIỜ RA (CHECK-OUT)</span>
            <span className="oa-req-time">Chuẩn: {standardOut}</span>
          </div>
          <div className="oa-punch-time">
            {currentPair?.checkOut ? getTime(currentPair.checkOut) : 'Chưa check-out'}
          </div>
          <div className="oa-punch-status">
            {checkOutStatus ? (
              <span className={`oa-badge ${checkOutStatus.class}`}>{checkOutStatus.text}</span>
            ) : (
              <span className="oa-badge badge-neutral">{checkedIn ? 'Đang trong ca' : 'Chưa vào ca'}</span>
            )}
          </div>
        </div>
      </div>

      {punchPairs.length > 0 && (
        <section className="oa-pair-history" aria-label="Lịch sử chấm trong ca">
          <h3>Lượt chấm của ca {selectedShift?.name}</h3>
          {punchPairs.map((pair, index) => <div className="oa-pair-history__row" key={`${pair.checkInTimestamp || pair.checkIn}-${index}`}>
            <span>Lượt {index + 1}</span>
            <strong>{getTime(pair.checkIn)} → {pair.checkOut ? getTime(pair.checkOut) : 'Đang mở'}</strong>
            {pair.checkInPhoto && <a href={pair.checkInPhoto} target="_blank" rel="noreferrer">Ảnh vào</a>}
            {pair.checkOutPhoto && <a href={pair.checkOutPhoto} target="_blank" rel="noreferrer">Ảnh ra</a>}
          </div>)}
        </section>
      )}

      {/* Khu vực Tải / Chụp ảnh & Nút hành động */}
      {selectedShift && <div className="oa-action-card">
          <h3>
            Xác thực chấm công {checkedIn ? 'Check-out (Giờ ra)' : 'Check-in (Giờ vào)'} · {selectedShift?.name || 'ca làm việc'}
          </h3>
          <p className="oa-action-desc">
            Chụp hoặc tải ảnh selfie/khuôn mặt để lưu trữ xác thực trên Cloudinary.
          </p>

          {/* Camera Viewfinder */}
          {isCameraActive && (
            <div className="oa-camera-container">
              <video ref={videoRef} autoPlay playsInline muted className="oa-video-feed" />
              <div className="oa-camera-controls">
                <button type="button" className="oa-btn-capture" onClick={capturePhoto}>
                  <i className="fas fa-camera" aria-hidden="true"></i> Chụp ảnh ngay
                </button>
                <button type="button" className="oa-btn-cancel-cam" onClick={stopCamera}>
                  Đóng camera
                </button>
              </div>
            </div>
          )}

          {/* Photo Preview */}
          {photoPreview && (
            <div className="oa-preview-container">
              <img src={photoPreview} alt="Ảnh xác thực" className="oa-captured-image" />
              <div className="oa-preview-actions">
                <button type="button" className="oa-btn-retake" onClick={() => setPhotoPreview(null)}>
                  <i className="fas fa-xmark" aria-hidden="true"></i> Bỏ ảnh / Chụp lại
                </button>
                <span className="oa-photo-ok"><i className="fas fa-circle-check" aria-hidden="true"></i> Ảnh đã sẵn sàng tải lên Cloudinary</span>
              </div>
            </div>
          )}

          {/* Nút chụp ảnh hoặc upload */}
          {!isCameraActive && !photoPreview && (
            <div className="oa-photo-sources">
              <button type="button" className="oa-btn-open-cam" onClick={startCamera}>
                <i className="fas fa-video" aria-hidden="true"></i> Bật Camera máy tính
              </button>
            </div>
          )}

          {/* Nút nộp Check-in / Check-out */}
          <div className="oa-submit-bar">
            {!checkedIn ? (
              <button
                type="button"
                className="oa-btn-submit oa-btn-checkin"
                disabled={submitting || !selectedShift}
                onClick={() => submit('in')}
              >
                {submitting ? 'Đang gửi dữ liệu & tải ảnh...' : 'XÁC NHẬN CHECK-IN'}
              </button>
            ) : (
              <button
                type="button"
                className="oa-btn-submit oa-btn-checkout"
                disabled={submitting || !selectedShift}
                onClick={() => submit('out')}
              >
                {submitting ? 'Đang gửi dữ liệu & tải ảnh...' : 'XÁC NHẬN CHECK-OUT'}
              </button>
            )}
          </div>
      </div>}

      {/* Ca đã hoàn tất, vẫn có thể check-in lượt tiếp theo */}
      {checkedOut && (
        <div className="oa-completed-card">
          <div className="oa-done-icon"><i className="fas fa-check" aria-hidden="true"></i></div>
          <h3>Đã hoàn tất ca {selectedShift?.name || 'đang chọn'}.</h3>
          <p>
            Vào: <strong>{getTime(currentPair?.checkIn)}</strong> · Ra:{' '}
            <strong>{getTime(currentPair?.checkOut)}</strong> · Tổng giờ:{' '}
            <strong>{record?.hours || record?.gio || 0} giờ</strong>
          </p>
        </div>
      )}
    </div>
  )
}

export default OnlineAttendance
