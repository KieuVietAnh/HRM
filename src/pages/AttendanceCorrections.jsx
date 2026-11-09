import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { decideAttendanceCorrection, loadAttendanceCorrectionRequests } from '../services/attendanceCorrections'
import { rebuildAttendanceMonthSummaryForDate } from '../services/attendanceMonthSummary'
import { getCompanyIdForUser, getCompanyNameForContext } from '../utils/companyContext'
import { formatAttendanceTime } from '../utils/attendanceShift'
import './AttendanceCorrections.css'

const statusLabels = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' }
const displayTime = value => value === '' ? 'Xóa mốc chấm công' : formatAttendanceTime(value) || 'Chưa chấm'
const proposedTime = (request, key) => request[key] !== null && request[key] !== undefined
  ? displayTime(request[key])
  : displayTime(request[key === 'requestedCheckIn' ? 'originalCheckIn' : 'originalCheckOut'])

function AttendanceCorrections() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [comments, setComments] = useState({})
  const [workingId, setWorkingId] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRequests(await loadAttendanceCorrectionRequests())
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được danh sách yêu cầu điều chỉnh công.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const orderedRequests = useMemo(() => [...requests].sort((left, right) => {
    if (left.status === 'pending' && right.status !== 'pending') return -1
    if (right.status === 'pending' && left.status !== 'pending') return 1
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
  }), [requests])

  const decide = async (request, decision) => {
    if (workingId) return
    const comment = String(comments[request.id] || '').trim()
    if (decision === 'rejected' && comment.length < 3) {
      setNotice(`Vui lòng ghi lý do từ chối yêu cầu của ${request.requesterName || 'nhân viên'}.`)
      return
    }
    setWorkingId(request.id)
    setNotice('')
    try {
      await decideAttendanceCorrection({ id: request.id, decision, comment, pairIndex: request.pairIndex ?? null, missingDay: Boolean(request.missingDay) })
      let summaryError = ''
      if (decision === 'approved') {
        try {
          await rebuildAttendanceMonthSummaryForDate(request.date, {
            companyId: getCompanyIdForUser(user),
            companyName: getCompanyNameForContext({ name: 'SpeeGo Logistics' }, user)
          })
        } catch (syncError) {
          console.error('Đã duyệt yêu cầu nhưng chưa đồng bộ được bảng công tháng:', syncError)
          summaryError = ' Yêu cầu đã áp dụng, nhưng chưa cập nhật được bảng công tổng hợp; hãy tổng hợp lại tháng này.'
        }
      }
      setNotice(`${decision === 'approved' ? 'Đã duyệt và cập nhật chấm công.' : 'Đã từ chối yêu cầu.'}${summaryError}`)
      await loadRequests()
    } catch (decisionError) {
      setNotice(decisionError?.message || 'Không xử lý được yêu cầu.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <div className="attendance-corrections">
      <header className="attendance-corrections__header">
        <div>
          <Link to="/bang-cong" className="attendance-corrections__back">← Bảng công cá nhân</Link>
          <h1>Yêu cầu điều chỉnh công</h1>
          <p>Kiểm tra giờ vào/ra và lý do trước khi duyệt. Chỉ yêu cầu được duyệt mới cập nhật bản ghi chấm công.</p>
        </div>
        <button type="button" onClick={loadRequests} disabled={loading}>Tải lại</button>
      </header>

      {notice && <div className="attendance-corrections__notice" role="status">{notice}</div>}
      {error ? <div className="attendance-corrections__error" role="alert">{error}</div> : loading ? <div className="attendance-corrections__empty">Đang tải yêu cầu…</div> : orderedRequests.length === 0 ? (
        <div className="attendance-corrections__empty">Chưa có yêu cầu điều chỉnh công nào.</div>
      ) : <section className="attendance-corrections__list">
        {orderedRequests.map(request => {
          const pending = request.status === 'pending'
          const dateLabel = request.date ? new Date(`${request.date}T00:00:00`).toLocaleDateString('vi-VN') : '—'
          return <article key={request.id} className="attendance-corrections__card">
            <div className="attendance-corrections__card-head">
              <div><h2>{request.requesterName || 'Nhân viên'} <small>{request.requesterCode || ''}</small></h2><p>{request.department || 'Chưa có phòng ban'} · {dateLabel}</p></div>
              <span className={`attendance-corrections__status is-${request.status}`}>{statusLabels[request.status] || request.status}</span>
            </div>
            <div className="attendance-corrections__times">
              {request.pairIndex !== null && request.pairIndex !== undefined && <p>Lượt chấm {Number(request.pairIndex) + 1}</p>}
              <div><span>Giờ vào</span><strong>{displayTime(request.originalCheckIn)}</strong><i aria-hidden="true">→</i><strong>{proposedTime(request, 'requestedCheckIn')}</strong></div>
              <div><span>Giờ ra</span><strong>{displayTime(request.originalCheckOut)}</strong><i aria-hidden="true">→</i><strong>{proposedTime(request, 'requestedCheckOut')}</strong></div>
            </div>
            <div className="attendance-corrections__reason"><strong>Lý do nhân viên</strong><p>{request.reason || '—'}</p></div>
            {request.evidenceUrl && <div className="attendance-corrections__reason"><strong>Ảnh minh chứng</strong><p><a href={request.evidenceUrl} target="_blank" rel="noopener noreferrer">Xem ảnh</a></p></div>}
            {request.comment && !pending && <div className="attendance-corrections__reason"><strong>Phản hồi duyệt</strong><p>{request.comment}</p></div>}
            {pending && <>
              <label className="attendance-corrections__comment">Ghi chú {"(bắt buộc nếu từ chối)"}<textarea rows="2" value={comments[request.id] || ''} onChange={event => setComments(current => ({ ...current, [request.id]: event.target.value }))} placeholder="Ghi chú cho nhân viên…" /></label>
              <div className="attendance-corrections__actions">
                <button type="button" className="is-reject" disabled={Boolean(workingId)} onClick={() => decide(request, 'rejected')}>{workingId === request.id ? 'Đang xử lý…' : 'Từ chối'}</button>
                <button type="button" className="is-approve" disabled={Boolean(workingId)} onClick={() => decide(request, 'approved')}>{workingId === request.id ? 'Đang xử lý…' : 'Duyệt và cập nhật công'}</button>
              </div>
            </>}
          </article>
        })}
      </section>}
    </div>
  )
}

export default AttendanceCorrections
