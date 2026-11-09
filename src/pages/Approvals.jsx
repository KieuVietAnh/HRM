import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fbDelete, fbGet, fbPush, fbUpdate } from '../services/firebase'
import { approveMatchingLeaveDays } from '../services/leaveDays'
import { supabase } from '../services/supabase'
import {
  APPROVAL_PERIOD_LABELS,
  calculateTemplateUsage,
  getApprovalPeriodRange,
  getTemplatePolicy,
  isPaidLeaveRequest,
  listRequestLeaveDates
} from '../utils/approvalPolicy'
import { getMissingUsersColumnFromError, normalizeString } from '../utils/helpers'
import './Approvals.css'

const REQUESTS_PATH = 'hr/approvalRequests'
const TEMPLATES_PATH = 'hr/approvalTemplates'
const RECENT_TEMPLATES_KEY = 'apv_recent_templates'
const MAX_APPROVAL_STEPS = 4

const formatLeaveCount = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  const rounded = Math.round(number * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

const formatLeaveRemaining = (balance) => {
  if (!balance?.configured) return '—'
  return formatLeaveCount(balance.remaining)
}

const BUILTIN_TEMPLATES = [
  {
    id: 'print',
    category: 'HÀNH CHÍNH',
    title: 'Đề xuất in ấn, ấn phẩm',
    description: 'Đề xuất nhu cầu in ấn hoặc sản xuất ấn phẩm.',
    icon: 'fa-file-circle-check',
    color: '#16a34a'
  },
  {
    id: 'recruit',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT TUYỂN DỤNG NHÂN SỰ',
    description: 'Đề xuất nhu cầu tuyển dụng nhân sự mới.',
    icon: 'fa-file-circle-check',
    color: '#84cc16'
  },
  {
    id: 'transfer',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT ĐIỀU CHUYỂN NHÂN SỰ',
    description: 'Đề xuất điều chuyển vị trí hoặc bộ phận nhân sự.',
    icon: 'fa-file-circle-check',
    color: '#06b6d4'
  },
  {
    id: 'appoint',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT BỔ NHIỆM NHÂN SỰ',
    description: 'Đề xuất bổ nhiệm chức danh hoặc vị trí quản lý.',
    icon: 'fa-file-circle-check',
    color: '#3b82f6'
  },
  {
    id: 'salary-adjust',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT ĐIỀU CHỈNH MỨC LƯƠNG',
    description: 'Đề xuất điều chỉnh mức lương theo năng lực hoặc thâm niên.',
    icon: 'fa-file-circle-check',
    color: '#22c55e'
  },
  {
    id: 'contract-type',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT LOẠI HỢP ĐỒNG KÝ',
    description: 'Đề xuất loại hợp đồng lao động cần ký với nhân sự.',
    icon: 'fa-file-circle-check',
    color: '#16a34a'
  },
  {
    id: 'plan-travel',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT KẾ HOẠCH & CÔNG TÁC PHÍ',
    description: 'Trình kế hoạch công tác và đề xuất công tác phí liên quan.',
    icon: 'fa-file-circle-check',
    color: '#22c55e'
  },
  {
    id: 'discipline',
    category: 'NHÂN SỰ',
    title: 'ĐỀ XUẤT XỬ LÝ VI PHẠM KỶ LUẬT',
    description: 'Đề xuất hình thức xử lý vi phạm kỷ luật lao động.',
    icon: 'fa-file-circle-check',
    color: '#16a34a'
  },
  {
    id: 'late-early',
    category: 'VẮNG MẶT',
    title: 'Đi muộn/về sớm',
    description: 'Xin phép đi muộn hoặc về sớm trong ngày làm việc.',
    icon: 'fa-file-lines',
    color: '#8b5cf6'
  },
  {
    id: 'leave',
    category: 'VẮNG MẶT',
    title: 'Đơn xin nghỉ phép',
    description: 'Gửi đơn xin nghỉ phép theo quy định của công ty.',
    icon: 'fa-file-circle-check',
    color: '#22c55e'
  },
  {
    id: 'proposal',
    category: 'CHUNG',
    title: 'ĐỀ XUẤT',
    description: 'Sử dụng khi cần trình đề xuất, xin ý kiến hoặc phê duyệt nội dung công việc.',
    icon: 'fa-file-signature',
    color: '#16a34a'
  }
]

const TEMPLATE_CATEGORIES = ['HÀNH CHÍNH', 'NHÂN SỰ', 'VẮNG MẶT', 'CHUNG']

function genCode() {
  return String(Date.now())
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${hh}:${mm} ${dd}/${mo}/${d.getFullYear()}`
}

function formatDateShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mo}/${d.getFullYear()}`
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?'
}

function statusBadge(status) {
  if (status === 'approved') return { cls: 'apv-badge--approved', label: 'Đã duyệt' }
  if (status === 'rejected') return { cls: 'apv-badge--rejected', label: 'Từ chối' }
  return { cls: 'apv-badge--pending', label: 'Chờ duyệt' }
}

function stepStatus(request, idx) {
  const step = request.approvalSteps[idx]
  if (step.decision === 'approved') return 'approved'
  if (step.decision === 'rejected') return 'rejected'
  if (idx === (request.currentStepIndex || 0) && request.status === 'pending') return 'pending'
  return 'waiting'
}

function Avatar({ name, avatar, size = 26 }) {
  return (
    <div className="apv-avatar" style={{ width: size, height: size, fontSize: size * 0.28 }}>
      {avatar ? <img src={avatar} alt={name || ''} /> : initials(name)}
    </div>
  )
}

function BottomSheet({ title, onClose, children }) {
  return (
    <div className="apv-reject-modal" onClick={onClose}>
      <div className="apv-reject-modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="apv-reject-modal__title">{title}</div>
        {children}
      </div>
    </div>
  )
}

function EmployeePicker({ employees, onPick, onClose }) {
  const [q, setQ] = useState('')
  const filtered = employees.filter((e) =>
    normalizeString(e.ho_va_ten || e.name || '').includes(normalizeString(q))
  )
  return (
    <>
      <div className="apv-picker__backdrop" onClick={onClose} />
      <div className="apv-picker__panel">
        <div className="apv-picker__search">
          <input autoFocus placeholder="Tìm nhân sự..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="apv-picker__empty">Không tìm thấy</div>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="apv-picker__item" onClick={() => onPick(e)}>
              <Avatar name={e.ho_va_ten || e.name} avatar={e.avatarDataUrl || e.avatarUrl || e.avatar} size={26} />
              <span>{e.ho_va_ten || e.name || 'N/A'}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

function emptyStep() {
  return { approverId: '', approverName: '', approverAvatar: '' }
}

function Approvals() {
  const auth = useAuth()
  const authUser = auth?.user || null
  const isEmployee = authUser?.role === 'user'
  const [searchParams, setSearchParams] = useSearchParams()

  const view = searchParams.get('view') || 'list'
  const tab = searchParams.get('tab') || 'inbox'
  const subFilter = searchParams.get('filter') || 'todo' // todo | done
  const selectedId = searchParams.get('id') || null
  const templateParam = searchParams.get('template') || ''
  const editTemplateId = searchParams.get('tplId') || null
  const statsPeriod = searchParams.get('period') || 'month' // week | month | year
  const statsDateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const statsDetailCode = searchParams.get('statEmp') || null

  const [employees, setEmployees] = useState([])
  const [requests, setRequests] = useState([])
  const [customTemplates, setCustomTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const [teamLeader, setTeamLeader] = useState(null)
  const [leaderError, setLeaderError] = useState('')
  const [leaderLoading, setLeaderLoading] = useState(false)
  const [leaveBalances, setLeaveBalances] = useState({})
  const [balanceError, setBalanceError] = useState('')
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [leaveMonthlyUsage, setLeaveMonthlyUsage] = useState({})
  const [leaveMonthlyUsageError, setLeaveMonthlyUsageError] = useState('')
  const [leaveMonthlyUsageLoading, setLeaveMonthlyUsageLoading] = useState(false)
  const [ownLeaveSummary, setOwnLeaveSummary] = useState(null)
  const [ownLeaveSummaryError, setOwnLeaveSummaryError] = useState('')
  const [ownLeaveSummaryLoading, setOwnLeaveSummaryLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [recentTemplateIds, setRecentTemplateIds] = useState([])

  const allTemplates = useMemo(() => {
    const customs = (customTemplates || []).map((t) => {
      const normalized = {
        ...t,
        isCustom: true,
        icon: t.icon || 'fa-file-signature',
        color: t.color || '#16a34a',
        category: t.category || 'CHUNG',
        description: t.description || '',
        defaultSubject: t.defaultSubject || t.title || '',
        defaultContent: t.defaultContent || '',
        defaultApprovers: Array.isArray(t.defaultApprovers) ? t.defaultApprovers : []
      }
      return { ...normalized, ...getTemplatePolicy(normalized) }
    })
    const builtin = BUILTIN_TEMPLATES.map((t) => {
      const override = customs.find((c) => c.baseId === t.id)
      if (!override) {
        const normalized = {
          ...t,
          isCustom: false,
          defaultSubject: t.title,
          defaultContent: '',
          defaultApprovers: []
        }
        return { ...normalized, ...getTemplatePolicy(normalized) }
      }
      const normalized = {
        ...t,
        ...override,
        id: t.id,
        recordId: override.id || override.recordId,
        isCustom: true,
        baseId: t.id,
        title: override.title || t.title,
        defaultSubject: override.defaultSubject || override.title || t.title,
        defaultContent: override.defaultContent || '',
        defaultApprovers: Array.isArray(override.defaultApprovers) ? override.defaultApprovers : []
      }
      return { ...normalized, ...getTemplatePolicy(normalized) }
    })
    const extraCustoms = customs.filter((c) => !c.baseId || !BUILTIN_TEMPLATES.some((b) => b.id === c.baseId))
    return [...extraCustoms, ...builtin]
  }, [customTemplates])

  const selectedTemplate = useMemo(() => {
    return allTemplates.find((t) => t.id === templateParam)
      || allTemplates.find((t) => t.id === 'proposal')
      || allTemplates[0]
  }, [templateParam, allTemplates])

  // Create-form state
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState([])
  const [leaveStartDate, setLeaveStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [leaveEndDate, setLeaveEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [leaveDuration, setLeaveDuration] = useState('full')
  const [leaveType, setLeaveType] = useState('paid')
  const [recruitPosition, setRecruitPosition] = useState('')
  const [recruitLevel, setRecruitLevel] = useState('')
  const [recruitExperience, setRecruitExperience] = useState('')
  const [recruitQuantity, setRecruitQuantity] = useState('1')
  const [recruitDepartment, setRecruitDepartment] = useState('')
  const [recruitDescription, setRecruitDescription] = useState('')
  const [approverSteps, setApproverSteps] = useState([emptyStep()])
  const [followers, setFollowers] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [pickerStepIndex, setPickerStepIndex] = useState(null) // step index, or 'followers'
  const fileInputRef = useRef(null)

  // Template editor state (HR)
  const [tplForm, setTplForm] = useState({
    title: '',
    category: 'NHÂN SỰ',
    description: '',
    defaultSubject: '',
    defaultContent: '',
    icon: 'fa-file-signature',
    color: '#16a34a',
    baseId: '',
    defaultApprovers: [],
    quotaEnabled: false,
    maxRequests: 0,
    quotaPeriod: 'month',
    attendanceSync: 'none'
  })
  const [tplSaving, setTplSaving] = useState(false)
  const [tplApproverSearch, setTplApproverSearch] = useState('')
  const [tplFilterBranch, setTplFilterBranch] = useState('')
  const [tplFilterDept, setTplFilterDept] = useState('')
  const [tplFilterPos, setTplFilterPos] = useState('')

  // Decision state (detail view)
  const [rejectPrompt, setRejectPrompt] = useState(false)
  const [decisionComment, setDecisionComment] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [selectedDoneIds, setSelectedDoneIds] = useState(() => new Set())
  const [deletingDone, setDeletingDone] = useState(false)

  const navigateApv = (patch, { replace = false } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
      })
      return next
    }, { replace })
  }

  const setTabNav = (nextTab, nextFilter = 'todo') =>
    navigateApv({
      tab: nextTab,
      view: null,
      id: null,
      template: null,
      tplId: null,
      filter: nextFilter === 'todo' ? null : nextFilter
    })

  const setSubFilterNav = (nextFilter) =>
    navigateApv({ filter: nextFilter === 'todo' ? null : nextFilter })

  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_TEMPLATES_KEY) || '[]')
      if (Array.isArray(recent)) setRecentTemplateIds(recent)
    } catch (e) {
      console.error('Failed to read recent templates', e)
    }
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setLoadError('')
      // The real staff directory lives in Supabase (`users`, same table Employees.jsx
      // reads/writes) — only the columns the picker/avatars need are selected so this
      // stays fast even as the table grows (avoids the heavy documents/images blobs
      // that a `select('*')` would drag along).
      const userColumns = ['id', 'name', 'department', 'team', 'position', 'branch', 'avatar_url', 'employee_id', 'username', 'email', 'role', 'is_team_leader']
      const loadUsers = async () => {
        let columns = [...userColumns]
        for (let attempt = 0; attempt < userColumns.length; attempt += 1) {
          const result = await supabase.from('users').select(columns.join(', '))
          if (!result.error) return result
          const missing = getMissingUsersColumnFromError(result.error)
          if (!missing || missing === 'id' || !columns.includes(missing)) return result
          columns = columns.filter(column => column !== missing)
        }
        return supabase.from('users').select('id, name')
      }
      const [usersRes, reqData, tplData] = await Promise.all([
        loadUsers(),
        fbGet(REQUESTS_PATH),
        fbGet(TEMPLATES_PATH)
      ])
      if (usersRes.error) throw usersRes.error

      const empList = (usersRes.data || []).map((u) => ({
        id: u.id,
        ho_va_ten: u.name || '',
        bo_phan: u.department || '',
        team: u.team || '',
        vi_tri: u.position || '',
        is_leader: u.is_team_leader === true,
        chi_nhanh: u.branch || '',
        avatarUrl: u.avatar_url || '',
        employeeId: u.employee_id || u.username || '',
        username: u.username || '',
        email: u.email || '',
        role: u.role || 'user'
      }))
      setEmployees(empList)

      const reqList = reqData ? Object.entries(reqData).map(([k, v]) => ({ ...v, id: k })) : []
      setRequests(reqList)

      const tplList = tplData
        ? Object.entries(tplData).map(([k, v]) => ({ ...v, id: k, recordId: k }))
        : []
      setCustomTemplates(tplList)
    } catch (e) {
      console.error('Lỗi tải dữ liệu phê duyệt:', e)
      setLoadError(e?.message || 'Không tải được dữ liệu đề xuất.')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // Identity always comes from the authenticated profile.
  const me = useMemo(() => {
    const base = authUser
      ? {
          id: authUser.id || authUser.employeeId || authUser.employee_id || '',
          name: authUser.ho_va_ten || authUser.name || authUser.email || 'Tôi',
          avatar: authUser.avatarDataUrl || authUser.avatarUrl || authUser.avatar_url || '',
          employeeCode:
            authUser.employee_id ||
            authUser.employeeId ||
            authUser.username ||
            authUser.ma_nhan_vien ||
            '',
          role: authUser.role || 'user',
          department: authUser.bo_phan || authUser.department || '',
          branch: authUser.chi_nhanh || authUser.branch || '',
          position: authUser.vi_tri || authUser.position || '',
          is_leader: authUser.is_leader === true
        }
      : null

    if (!base) return null

    const authEmail = authUser?.email || ''
    const emp = employees.find(
      (e) =>
        (base.id && String(e.id) === String(base.id)) ||
        (authEmail && e.email && normalizeString(e.email) === normalizeString(authEmail)) ||
        (base.employeeCode &&
          String(e.employeeId || e.username || '') === String(base.employeeCode)) ||
        (base.name &&
          base.name !== 'Tôi' &&
          normalizeString(e.ho_va_ten || e.name || '') === normalizeString(base.name))
    )

    if (!emp) return base

    return {
      id: base.id || emp.id || '',
      name:
        base.name && base.name !== 'Tôi'
          ? base.name
          : emp.ho_va_ten || emp.name || base.name,
      avatar: base.avatar || emp.avatarUrl || emp.avatarDataUrl || emp.avatar || '',
      employeeCode: base.employeeCode || emp.employeeId || emp.username || '',
      role: emp.role || base.role || 'user',
      department: emp.bo_phan || base.department || '',
      branch: emp.chi_nhanh || base.branch || '',
      position: emp.vi_tri || base.position || '',
      is_leader: emp.is_leader === true || base.is_leader === true
    }
  }, [authUser, employees])

  const canManageTemplates = true
  const isAdmin = String(me?.role || '').toLowerCase() === 'admin'
  const isTeamLeader = Boolean(
    me?.is_leader ||
    /leader/i.test(String(me?.position || '')) ||
    /trưởng/i.test(String(me?.position || ''))
  )

  useEffect(() => {
    if (view !== 'create' || !isEmployee || loading) return
    const department = String(authUser?.bo_phan || authUser?.department || '').trim()
    const branch = String(authUser?.chi_nhanh || authUser?.branch || '').trim()
    if (!department) {
      setTeamLeader(null)
      setLeaderError('Hồ sơ của bạn chưa có Team/phòng ban. Vui lòng liên hệ HR.')
      setLeaderLoading(false)
      return
    }
    const sameGroup = (employee) => {
      if (String(employee.id) === String(authUser?.id || '')) return false
      const sameDepartment = String(employee.bo_phan || '').trim().toLowerCase() === department.toLowerCase()
      const employeeBranch = String(employee.chi_nhanh || '').trim()
      const sameBranch = !branch || employeeBranch.toLowerCase() === branch.toLowerCase()
      return sameDepartment && sameBranch
    }
    const markedLeaders = employees.filter((employee) => sameGroup(employee) && employee.is_leader)
    const byTitle = employees.filter((employee) => {
      const position = String(employee.vi_tri || '')
      return sameGroup(employee) && (/leader/i.test(position) || /trưởng/i.test(position))
    })
    const leaders = markedLeaders.length > 0
      ? markedLeaders
      : byTitle.length > 0
        ? byTitle
        : employees.filter((employee) => sameGroup(employee) && ['admin', 'hr', 'manager'].includes(String(employee.role || '').toLowerCase()))
    if (leaders.length === 1) {
      const leader = leaders[0]
      setTeamLeader({
        id: leader.id,
        name: leader.ho_va_ten || '',
        avatar: leader.avatarUrl || '',
        department
      })
      setLeaderError('')
    } else {
      setTeamLeader(null)
      setLeaderError(leaders.length > 1
        ? `Team ${department} có nhiều Leader. Vui lòng liên hệ HR xác định một người duyệt.`
        : `Phòng ${department} chưa có Leader. Hãy mở hồ sơ một người trong phòng và chọn Leader: Có.`)
    }
    setLeaderLoading(false)
  }, [view, isEmployee, loading, authUser, employees])

  useEffect(() => {
    if (view !== 'create' || !selectedTemplate) return
    setSubject(selectedTemplate.defaultSubject || selectedTemplate.title || '')
    if (selectedTemplate.defaultContent) {
      setContent(selectedTemplate.defaultContent)
    }
    const defaults = Array.isArray(selectedTemplate.defaultApprovers)
      ? selectedTemplate.defaultApprovers.filter((a) => a?.approverId)
      : []
    if (defaults.length > 0) {
      setApproverSteps(defaults.map((a) => ({
        approverId: a.approverId,
        approverName: a.approverName || '',
        approverAvatar: a.approverAvatar || ''
      })))
    }
  }, [view, selectedTemplate?.id, selectedTemplate?.defaultSubject, selectedTemplate?.defaultContent, selectedTemplate?.title, selectedTemplate?.defaultApprovers])

  const resolveEmployeeCode = (requesterId, requesterName, requesterCode) => {
    if (requesterCode) return String(requesterCode)
    const emp = employees.find((e) =>
      (requesterId && String(e.id) === String(requesterId)) ||
      (requesterName && normalizeString(e.ho_va_ten || e.name || '') === normalizeString(requesterName))
    )
    return emp?.employeeId || emp?.username || requesterId || 'N/A'
  }

  const getPeriodRange = (period, dateInput) =>
    getApprovalPeriodRange(period, dateInput) ||
    getApprovalPeriodRange(period, new Date())

  const formatPeriodLabel = (period, dateInput) => {
    const range = getPeriodRange(period, dateInput)
    if (!range) return ''
    const { start, end } = range
    if (period === 'week') {
      return `Tuần ${formatDateShort(start.toISOString())} – ${formatDateShort(end.toISOString())}`
    }
    if (period === 'year') return `Năm ${start.getFullYear()}`
    const mo = String(start.getMonth() + 1).padStart(2, '0')
    return `Tháng ${mo}/${start.getFullYear()}`
  }

  const statsByEmployee = useMemo(() => {
    const range = getPeriodRange(statsPeriod, statsDateParam)
    if (!range) return []
    const { start, end } = range
    const map = new Map()

    requests.forEach((r) => {
      const created = new Date(r.createdAt || 0)
      if (isNaN(created.getTime()) || created < start || created > end) return

      const code = resolveEmployeeCode(r.requesterId, r.requesterName, r.requesterCode)
      const key = String(code)
      if (!map.has(key)) {
        map.set(key, {
          employeeCode: key,
          employeeName: r.requesterName || '—',
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          paidLeaveTotal: 0,
          paidLeavePending: 0,
          paidLeaveApproved: 0,
          paidLeaveRejected: 0,
          byTemplate: {}
        })
      }
      const row = map.get(key)
      if (r.requesterName) row.employeeName = r.requesterName
      row.total += 1
      if (r.status === 'approved') row.approved += 1
      else if (r.status === 'rejected') row.rejected += 1
      else row.pending += 1
      if (isPaidLeaveRequest(r)) {
        row.paidLeaveTotal += 1
        if (r.status === 'approved') row.paidLeaveApproved += 1
        else if (r.status === 'rejected') row.paidLeaveRejected += 1
        else row.paidLeavePending += 1
      }
      const tpl = r.templateType || 'ĐỀ XUẤT'
      row.byTemplate[tpl] = (row.byTemplate[tpl] || 0) + 1
    })

    return [...map.values()].sort((a, b) => b.total - a.total || String(a.employeeCode).localeCompare(String(b.employeeCode)))
  }, [requests, employees, statsPeriod, statsDateParam])

  const statsSummary = useMemo(() => {
    return statsByEmployee.reduce(
      (acc, row) => {
        acc.employees += 1
        acc.total += row.total
        acc.pending += row.pending
        acc.approved += row.approved
        acc.rejected += row.rejected
        acc.paidLeaveTotal += row.paidLeaveTotal
        acc.paidLeavePending += row.paidLeavePending
        acc.paidLeaveApproved += row.paidLeaveApproved
        acc.paidLeaveRejected += row.paidLeaveRejected
        return acc
      },
      {
        employees: 0,
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        paidLeaveTotal: 0,
        paidLeavePending: 0,
        paidLeaveApproved: 0,
        paidLeaveRejected: 0
      }
    )
  }, [statsByEmployee])

  const filteredStats = useMemo(() => {
    const q = normalizeString(search)
    if (!q) return statsByEmployee
    return statsByEmployee.filter((row) =>
      normalizeString(`${row.employeeCode} ${row.employeeName}`).includes(q)
    )
  }, [statsByEmployee, search])

  const statsDetailEmployee = useMemo(
    () => statsByEmployee.find((row) => row.employeeCode === statsDetailCode) || null,
    [statsByEmployee, statsDetailCode]
  )

  const statsDetailRows = useMemo(() => {
    if (!statsDetailCode) return []
    const range = getPeriodRange(statsPeriod, statsDateParam)
    if (!range) return []
    const { start, end } = range
    return requests
      .filter((r) => {
        const created = new Date(r.createdAt || 0)
        if (isNaN(created.getTime()) || created < start || created > end) return false
        return String(resolveEmployeeCode(r.requesterId, r.requesterName, r.requesterCode)) === statsDetailCode
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  }, [requests, statsDetailCode, statsPeriod, statsDateParam])

  const isMe = (personId, personName) => {
    if (!me) return false
    if (me.id && personId) return String(me.id) === String(personId)
    if (me.name && personName) return normalizeString(me.name) === normalizeString(personName)
    return false
  }

  const selectedTemplateUsage = useMemo(
    () => calculateTemplateUsage({
      requests,
      template: selectedTemplate,
      person: me,
      at: new Date()
    }),
    [requests, selectedTemplate, me]
  )

  const selectedTemplateUsesLeaveDates =
    selectedTemplateUsage.attendanceSync === 'paid-leave' ||
    selectedTemplate?.id === 'leave' ||
    selectedTemplate?.baseId === 'leave'

  const selectedTemplateIsRecruit = useMemo(() => {
    if (!selectedTemplate) return false
    if (selectedTemplate.id === 'recruit' || selectedTemplate.baseId === 'recruit') return true
    const text = `${selectedTemplate.title || ''} ${selectedTemplate.defaultSubject || ''} ${selectedTemplate.description || ''}`
      .toLocaleLowerCase('vi')
    return text.includes('tuyển dụng')
  }, [selectedTemplate])

  const recruitDepartments = useMemo(
    () => [...new Set(employees.map((e) => e.bo_phan).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [employees]
  )

  const recruitPositions = useMemo(
    () => [...new Set(employees.map((e) => e.vi_tri).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [employees]
  )

  const effectiveApproverSteps = isEmployee
    ? teamLeader ? [{
        approverId: teamLeader.id,
        approverName: teamLeader.name,
        approverAvatar: teamLeader.avatar || ''
      }] : []
    : approverSteps

  const leaveDaysByYear = useMemo(() => {
    if (!selectedTemplateUsesLeaveDates) return {}
    const days = listRequestLeaveDates({ leaveStartDate, leaveEndDate })
    return days.reduce((result, day) => {
      const year = day.slice(0, 4)
      result[year] = (result[year] || 0) + (leaveDuration === 'half' ? 0.5 : 1)
      return result
    }, {})
  }, [selectedTemplateUsesLeaveDates, leaveStartDate, leaveEndDate, leaveDuration])
  const leaveYearsKey = Object.keys(leaveDaysByYear).join(',')
  const leaveMonths = useMemo(() => {
    if (!selectedTemplateUsesLeaveDates) return []
    return [...new Set(listRequestLeaveDates({ leaveStartDate, leaveEndDate }).map(day => day.slice(0, 7)))]
  }, [selectedTemplateUsesLeaveDates, leaveStartDate, leaveEndDate])
  const leaveMonthsKey = leaveMonths.join(',')

  useEffect(() => {
    if (view !== 'create' || !selectedTemplateIsRecruit) return
    setRecruitDepartment((current) => current || me?.department || '')
  }, [view, selectedTemplateIsRecruit, me?.department])

  useEffect(() => {
    if (view !== 'create' || !selectedTemplateUsesLeaveDates || !leaveYearsKey) return
    let active = true
    setBalanceLoading(true)
    setBalanceError('')
    setLeaveBalances({})
    Promise.all(leaveYearsKey.split(',').map(async (year) => {
      const { data, error } = await supabase.rpc('my_approval_leave_balance', { p_year: Number(year) })
      if (error) throw error
      return [year, data]
    })).then((entries) => {
      if (active) setLeaveBalances(Object.fromEntries(entries))
    }).catch((error) => {
      if (active) setBalanceError(error?.message || 'Không tải được số phép còn lại.')
    }).finally(() => {
      if (active) setBalanceLoading(false)
    })
    return () => { active = false }
  }, [view, selectedTemplateUsesLeaveDates, leaveYearsKey, authUser?.id])

  useEffect(() => {
    if (view !== 'create' || !selectedTemplateUsesLeaveDates || !leaveMonthsKey) return
    let active = true
    setLeaveMonthlyUsageLoading(true)
    setLeaveMonthlyUsageError('')
    setLeaveMonthlyUsage({})
    Promise.all(leaveMonthsKey.split(',').map(async month => {
      const [year, monthNumber] = month.split('-').map(Number)
      const { data, error } = await supabase.rpc('my_approval_leave_month_usage', {
        p_year: year,
        p_month: monthNumber
      })
      if (error) throw error
      return [month, data]
    })).then(entries => {
      if (active) setLeaveMonthlyUsage(Object.fromEntries(entries))
    }).catch(error => {
      if (active) setLeaveMonthlyUsageError(error?.message || 'Không tải được số lượt nghỉ trong tháng.')
    }).finally(() => {
      if (active) setLeaveMonthlyUsageLoading(false)
    })
    return () => { active = false }
  }, [view, selectedTemplateUsesLeaveDates, leaveMonthsKey, authUser?.id])

  useEffect(() => {
    if (view !== 'create' || !authUser?.id) return undefined
    let active = true
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    setOwnLeaveSummaryLoading(true)
    setOwnLeaveSummaryError('')
    Promise.all([
      supabase.rpc('my_approval_leave_balance', { p_year: year }),
      supabase.rpc('my_approval_leave_month_usage', { p_year: year, p_month: month })
    ]).then(([balanceRes, monthRes]) => {
      if (!active) return
      if (balanceRes.error) throw balanceRes.error
      if (monthRes.error) throw monthRes.error
      setOwnLeaveSummary({
        year,
        balance: balanceRes.data || {},
        month,
        usage: monthRes.data || {}
      })
    }).catch((error) => {
      if (active) setOwnLeaveSummaryError(error?.message || 'Không tải được số phép còn lại.')
    }).finally(() => {
      if (active) setOwnLeaveSummaryLoading(false)
    })
    return () => { active = false }
  }, [view, authUser?.id])

  const myCreateStats = useMemo(() => {
    const emptyBucket = () => ({ total: 0, byTemplate: {} })
    const result = {
      week: emptyBucket(),
      month: emptyBucket(),
      year: emptyBucket()
    }
    if (!me) return result

    const today = new Date().toISOString().slice(0, 10)
    const ranges = {
      week: getPeriodRange('week', today),
      month: getPeriodRange('month', today),
      year: getPeriodRange('year', today)
    }

    const mine = requests.filter((r) =>
      isMe(r.requesterId, r.requesterName) ||
      (me.employeeCode && String(r.requesterCode || '') === String(me.employeeCode))
    )

    mine.forEach((r) => {
      const created = new Date(r.createdAt || 0)
      if (isNaN(created.getTime())) return
      const tpl = r.templateType || 'ĐỀ XUẤT'
      ;(['week', 'month', 'year']).forEach((key) => {
        const range = ranges[key]
        if (!range || created < range.start || created > range.end) return
        result[key].total += 1
        result[key].byTemplate[tpl] = (result[key].byTemplate[tpl] || 0) + 1
      })
    })

    return result
  }, [requests, me, employees])

  const myApproveStats = useMemo(() => {
    const emptyBucket = () => ({ total: 0, byTemplate: {} })
    const result = {
      week: emptyBucket(),
      month: emptyBucket(),
      year: emptyBucket()
    }
    if (!me) return result

    const today = new Date().toISOString().slice(0, 10)
    const ranges = {
      week: getPeriodRange('week', today),
      month: getPeriodRange('month', today),
      year: getPeriodRange('year', today)
    }

    requests.forEach((r) => {
      const myStep = (r.approvalSteps || []).find(
        (s) => isMe(s.approverId, s.approverName) && s.decision === 'approved'
      )
      if (!myStep || !myStep.decidedAt) return
      const decided = new Date(myStep.decidedAt)
      if (isNaN(decided.getTime())) return
      const tpl = r.templateType || 'ĐỀ XUẤT'
      ;(['week', 'month', 'year']).forEach((key) => {
        const range = ranges[key]
        if (!range || decided < range.start || decided > range.end) return
        result[key].total += 1
        result[key].byTemplate[tpl] = (result[key].byTemplate[tpl] || 0) + 1
      })
    })

    return result
  }, [requests, me])

  const isMyTurn = (r) => {
    const step = (r.approvalSteps || [])[r.currentStepIndex || 0]
    return r.status === 'pending' && !!step && !step.decision && isMe(step.approverId, step.approverName)
  }

  // The step assigned to the current user, if any — used to tell "I already
  // decided this" apart from "not my turn yet" (e.g. still waiting on an earlier approver).
  const myDecidedStep = (r) =>
    (r.approvalSteps || []).find((s) => isMe(s.approverId, s.approverName) && !!s.decision)

  const leadsRequester = (r) => {
    if (!isTeamLeader) return false
    const department = String(me?.department || '').trim().toLowerCase()
    if (!department) return false
    const requester = employees.find((employee) =>
      (r.requesterId && String(employee.id) === String(r.requesterId)) ||
      (r.requesterName && normalizeString(employee.ho_va_ten || employee.name || '') === normalizeString(r.requesterName))
    )
    const requesterDepartment = String(requester?.bo_phan || '').trim().toLowerCase()
    if (!requesterDepartment || requesterDepartment !== department) return false
    const branch = String(me?.branch || '').trim().toLowerCase()
    const requesterBranch = String(requester?.chi_nhanh || '').trim().toLowerCase()
    return !branch || !requesterBranch || branch === requesterBranch
  }

  const canDecideRequest = (r) => {
    if (!r || r.status !== 'pending') return false
    if (isMyTurn(r)) return true
    if (isAdmin || String(me?.role || '').toLowerCase() === 'hr') return true
    return leadsRequester(r)
  }

  const inboxRequests = useMemo(
    () => isAdmin
      ? requests
      : requests.filter((r) =>
          (r.approvalSteps || []).some((s) => isMe(s.approverId, s.approverName)) ||
          leadsRequester(r)
        ),
    [requests, me, isAdmin, isTeamLeader, employees]
  )
  const sentRequests = useMemo(
    () => requests.filter((r) => isMe(r.requesterId, r.requesterName)),
    [requests, me]
  )

  const seesWholeInbox = tab === 'inbox' && (isAdmin || isTeamLeader)
  const baseList = tab === 'inbox' ? inboxRequests : tab === 'sent' ? sentRequests : requests
  const todoList = baseList.filter((r) => {
    if (r.status !== 'pending') return false
    if (tab !== 'inbox' || isAdmin) return true
    if (isTeamLeader) return isMyTurn(r) || leadsRequester(r)
    return isMyTurn(r)
  })
  const doneList = baseList.filter((r) => {
    if (todoList.includes(r)) return false
    // "Hoàn thành" in Gửi đến only counts requests this account has personally
    // approved/rejected — not ones still waiting on someone earlier in the chain.
    // Admin sees every finished request. A Leader also sees finished requests from their team.
    if (tab === 'inbox' && !isAdmin && !(isTeamLeader && leadsRequester(r))) return !!myDecidedStep(r)
    return true
  })

  const activeList = (subFilter === 'todo' ? todoList : doneList)
    .filter((r) => {
      if (!search.trim()) return true
      const q = normalizeString(search)
      return (
        normalizeString(r.subject || '').includes(q) ||
        normalizeString(r.content || '').includes(q) ||
        String(r.code || '').includes(search.trim())
      )
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  const selectedRequest = requests.find((r) => r.id === selectedId) || null

  // ---- Create form helpers ----
  const resetForm = (tpl = null) => {
    const today = new Date().toISOString().slice(0, 10)
    setSubject(tpl?.defaultSubject || tpl?.title || '')
    setContent(tpl?.defaultContent || '')
    setAttachments([])
    setLeaveStartDate(today)
    setLeaveEndDate(today)
    setLeaveDuration('full')
    setLeaveType('paid')
    const defaults = Array.isArray(tpl?.defaultApprovers)
      ? tpl.defaultApprovers.filter((a) => a?.approverId)
      : []
    setApproverSteps(defaults.length > 0 ? defaults.map((a) => ({
      approverId: a.approverId,
      approverName: a.approverName || '',
      approverAvatar: a.approverAvatar || ''
    })) : [emptyStep()])
    setFollowers([])
    setErrors({})
    setPickerStepIndex(null)
  }

  const rememberTemplate = (templateId) => {
    setRecentTemplateIds((prev) => {
      const next = [templateId, ...prev.filter((id) => id !== templateId)].slice(0, 5)
      try {
        localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(next))
      } catch (e) {
        console.error('Failed to store recent templates', e)
      }
      return next
    })
  }

  const openCreate = (template) => {
    if (!me) {
      showToast('Vui lòng đăng nhập lại để tạo đề xuất.')
      return
    }
    const tpl = template || selectedTemplate || allTemplates.find((t) => t.id === 'proposal') || allTemplates[0]
    resetForm(tpl)
    rememberTemplate(tpl.id)
    navigateApv({ view: 'create', template: tpl.id, id: null, tplId: null })
  }

  const openTemplateForm = (tpl = null) => {
    setTplApproverSearch('')
    setTplFilterBranch('')
    setTplFilterDept('')
    setTplFilterPos('')
    if (tpl) {
      const isBuiltin = BUILTIN_TEMPLATES.some((b) => b.id === tpl.id)
      const recordId = tpl.recordId || null
      const policy = getTemplatePolicy(tpl)
      setTplForm({
        title: tpl.title || '',
        category: tpl.category || 'NHÂN SỰ',
        description: tpl.description || '',
        defaultSubject: tpl.defaultSubject || tpl.title || '',
        defaultContent: tpl.defaultContent || '',
        icon: tpl.icon || 'fa-file-signature',
        color: tpl.color || '#16a34a',
        baseId: tpl.baseId || (isBuiltin ? tpl.id : ''),
        defaultApprovers: Array.isArray(tpl.defaultApprovers) ? tpl.defaultApprovers : [],
        ...policy
      })
      navigateApv({
        view: 'template-form',
        tab: 'templates',
        tplId: recordId,
        template: null,
        id: null
      })
    } else {
      setTplForm({
        title: '',
        category: 'NHÂN SỰ',
        description: '',
        defaultSubject: '',
        defaultContent: '',
        icon: 'fa-file-signature',
        color: '#16a34a',
        baseId: '',
        defaultApprovers: [],
        quotaEnabled: false,
        maxRequests: 0,
        quotaPeriod: 'month',
        attendanceSync: 'none'
      })
      navigateApv({ view: 'template-form', tab: 'templates', tplId: null, template: null, id: null })
    }
  }

  const toggleTplApprover = (emp) => {
    const id = emp.id
    setTplForm((prev) => {
      const list = Array.isArray(prev.defaultApprovers) ? [...prev.defaultApprovers] : []
      const idx = list.findIndex((a) => String(a.approverId) === String(id))
      if (idx >= 0) {
        list.splice(idx, 1)
      } else {
        if (list.length >= MAX_APPROVAL_STEPS) {
          showToast(`Tối đa ${MAX_APPROVAL_STEPS} người phê duyệt`)
          return prev
        }
        list.push({
          approverId: emp.id,
          approverName: emp.ho_va_ten || emp.name || 'N/A',
          approverAvatar: emp.avatarDataUrl || emp.avatarUrl || emp.avatar || ''
        })
      }
      return { ...prev, defaultApprovers: list }
    })
  }

  const moveTplApprover = (index, dir) => {
    setTplForm((prev) => {
      const list = [...(prev.defaultApprovers || [])]
      const next = index + dir
      if (next < 0 || next >= list.length) return prev
      ;[list[index], list[next]] = [list[next], list[index]]
      return { ...prev, defaultApprovers: list }
    })
  }

  const saveTemplateForm = async (e) => {
    e?.preventDefault?.()
    const title = (tplForm.title || '').trim()
    if (!title) {
      showToast('Vui lòng nhập tên mẫu')
      return
    }
    if (tplForm.quotaEnabled && (!Number(tplForm.maxRequests) || Number(tplForm.maxRequests) < 1)) {
      showToast('Số lần tối đa phải lớn hơn 0')
      return
    }
    setTplSaving(true)
    try {
      const payload = {
        title,
        category: tplForm.category || 'CHUNG',
        description: (tplForm.description || '').trim(),
        defaultSubject: (tplForm.defaultSubject || title).trim(),
        defaultContent: tplForm.defaultContent || '',
        icon: tplForm.icon || 'fa-file-signature',
        color: tplForm.color || '#16a34a',
        baseId: tplForm.baseId || '',
        quotaEnabled: Boolean(tplForm.quotaEnabled),
        maxRequests: Math.max(0, Math.floor(Number(tplForm.maxRequests) || 0)),
        quotaPeriod: ['week', 'month', 'year'].includes(tplForm.quotaPeriod)
          ? tplForm.quotaPeriod
          : 'month',
        attendanceSync: tplForm.attendanceSync || 'none',
        defaultApprovers: (tplForm.defaultApprovers || [])
          .filter((a) => a?.approverId)
          .map((a) => ({
            approverId: a.approverId,
            approverName: a.approverName || '',
            approverAvatar: a.approverAvatar || ''
          })),
        updatedAt: new Date().toISOString(),
        updatedBy: me?.name || '',
        updatedById: me?.id || ''
      }
      if (editTemplateId && customTemplates.some((t) => t.id === editTemplateId || t.recordId === editTemplateId)) {
        await fbUpdate(`${TEMPLATES_PATH}/${editTemplateId}`, payload)
        showToast('Đã cập nhật mẫu đề xuất')
      } else {
        payload.createdAt = new Date().toISOString()
        payload.createdBy = me?.name || ''
        payload.createdById = me?.id || ''
        await fbPush(TEMPLATES_PATH, payload)
        showToast('Đã tạo mẫu đề xuất')
      }
      setTplForm({
        title: '',
        category: 'NHÂN SỰ',
        description: '',
        defaultSubject: '',
        defaultContent: '',
        icon: 'fa-file-signature',
        color: '#16a34a',
        baseId: '',
        defaultApprovers: [],
        quotaEnabled: false,
        maxRequests: 0,
        quotaPeriod: 'month',
        attendanceSync: 'none'
      })
      setTplApproverSearch('')
      await loadData()
      // Đóng form, về danh sách mẫu
      navigateApv(
        { view: null, tplId: null, template: null, id: null, tab: 'templates' },
        { replace: true }
      )
    } catch (err) {
      console.error(err)
      showToast('Lỗi khi lưu mẫu: ' + (err.message || 'unknown'))
    } finally {
      setTplSaving(false)
    }
  }

  const deleteCustomTemplate = async (tpl) => {
    const rid = tpl.recordId || tpl.id
    if (!rid || !canManageTemplates) return
    if (!confirm(`Xóa mẫu "${tpl.title}"?`)) return
    try {
      await fbDelete(`${TEMPLATES_PATH}/${rid}`)
      showToast('Đã xóa mẫu')
      await loadData()
    } catch (err) {
      showToast('Lỗi xóa mẫu: ' + (err.message || ''))
    }
  }

  const openDetail = (id) => {
    navigateApv({ view: 'detail', id, template: null })
  }

  const toggleDoneSelection = (id) => {
    setSelectedDoneIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllDone = (checked, ids) => {
    setSelectedDoneIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  const deleteSelectedDone = async (ids) => {
    if (!ids.length || deletingDone) return
    if (!window.confirm(`Xóa ${ids.length} đề xuất đã hoàn thành?`)) return
    setDeletingDone(true)
    try {
      const rpc = await supabase.rpc('delete_approval_requests', { p_ids: ids })
      const missingFunction = /delete_approval_requests|schema cache|could not find the function/i.test(rpc.error?.message || '')
      let removed = []
      if (!rpc.error) {
        removed = Array.isArray(rpc.data) ? rpc.data : []
      } else if (!missingFunction) {
        throw rpc.error
      } else {
        const { data, error } = await supabase
          .from('hr_records')
          .delete()
          .in('id', ids.map((id) => `approvalRequests::${id}`))
          .eq('collection', 'approvalRequests')
          .select('id')
        if (error) throw error
        removed = (data || []).map((row) => String(row.id || '').replace(/^approvalRequests::/, ''))
      }
      if (removed.length < ids.length) {
        throw new Error('Không xóa hết đề xuất đã chọn. Hãy chạy file supabase/migrations/20261004130000_delete_finished_approvals.sql trong SQL Editor.')
      }
      const removedIds = new Set(removed.map(String))
      setRequests((current) => current.filter((request) => !removedIds.has(String(request.id))))
      setSelectedDoneIds(new Set())
      showToast(`Đã xóa ${removed.length} đề xuất`)
    } catch (error) {
      showToast(error?.message || 'Không xóa được đề xuất đã chọn')
    } finally {
      setDeletingDone(false)
    }
  }

  const openStatsDetail = (employeeCode) => navigateApv({ statEmp: employeeCode })
  const closeStatsDetail = () => navigateApv({ statEmp: null })

  const goBackToList = () => {
    navigateApv({ view: null, id: null, template: null, tplId: null })
    setRejectPrompt(false)
    setDecisionComment('')
  }

  const filteredTemplates = useMemo(() => {
    const q = normalizeString(search)
    if (!q) return allTemplates
    return allTemplates.filter((t) =>
      normalizeString(`${t.title} ${t.category} ${t.description}`).includes(q)
    )
  }, [search, allTemplates])

  const recentTemplates = useMemo(
    () => recentTemplateIds
      .map((id) => allTemplates.find((t) => t.id === id))
      .filter(Boolean),
    [recentTemplateIds, allTemplates]
  )

  const updateStep = (idx, patch) =>
    setApproverSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  const addStep = () => setApproverSteps((prev) => [...prev, emptyStep()])
  const removeStep = (idx) => setApproverSteps((prev) => prev.filter((_, i) => i !== idx))

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || [])
    // Only file names are kept for display — there is no file-storage backend wired
    // up for this module yet, so the actual bytes are not persisted.
    setAttachments((prev) => [...prev, ...files.map((f) => ({ name: f.name }))])
    e.target.value = ''
  }

  const validateForm = () => {
    const errs = {}
    if (!subject.trim()) errs.subject = 'Vui lòng chọn về việc'
    if (!content.trim()) errs.content = 'Vui lòng nhập nội dung'
    if (!effectiveApproverSteps.some((s) => s.approverId)) {
      errs.approvers = isEmployee ? (leaderError || 'Chưa tìm được Leader của Team.') : 'Vui lòng chọn ít nhất 1 người phê duyệt'
    } else if (effectiveApproverSteps.some((s) => !s.approverId)) {
      errs.approvers = 'Vui lòng chọn đầy đủ người phê duyệt hoặc xóa bước còn trống'
    }
    if (selectedTemplateUsage.limitReached) {
      errs.quota = `Đã hết hạn mức ${selectedTemplateUsage.maxRequests} lần/${APPROVAL_PERIOD_LABELS[selectedTemplateUsage.quotaPeriod]}.`
    }
    if (selectedTemplateIsRecruit && !recruitPosition.trim()) {
      errs.recruitPosition = 'Vui lòng nhập vị trí cần tuyển'
    }
    if (selectedTemplateUsesLeaveDates) {
      const dates = listRequestLeaveDates({ leaveStartDate, leaveEndDate })
      if (!leaveStartDate || !leaveEndDate || dates.length === 0) {
        errs.leaveDates = 'Ngày nghỉ không hợp lệ hoặc ngày kết thúc trước ngày bắt đầu'
      }
      if (leaveType === 'paid') {
        if (balanceLoading || balanceError || Object.keys(leaveBalances).length !== Object.keys(leaveDaysByYear).length) {
          errs.leaveBalance = balanceError || 'Đang tải số phép còn lại. Vui lòng thử lại.'
        } else {
          for (const [year, daysNeeded] of Object.entries(leaveDaysByYear)) {
            const balance = leaveBalances[year]
            if (!balance?.configured) errs.leaveBalance = `Chưa cài đặt phép năm ${year}. Vui lòng liên hệ HR.`
            else if (Number(balance.remaining) < daysNeeded) {
              errs.leaveBalance = `Năm ${year} chỉ còn ${balance.remaining} ngày phép; đơn cần ${daysNeeded} ngày.`
            }
          }
        }
        if (leaveMonthlyUsageLoading || leaveMonthlyUsageError || Object.keys(leaveMonthlyUsage).length !== leaveMonths.length) {
          errs.leaveMonthlyLimit = leaveMonthlyUsageError || 'Đang tải số lượt nghỉ trong tháng. Vui lòng thử lại.'
        } else {
          for (const month of leaveMonths) {
            const usage = leaveMonthlyUsage[month]
            if (Number(usage?.used) >= Number(usage?.limit || 2)) {
              errs.leaveMonthlyLimit = `Tháng ${month} đã đủ ${usage?.limit || 2} lần sử dụng phép năm.`
              break
            }
          }
        }
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmitRequest = async () => {
    if (!me) {
      showToast('Vui lòng đăng nhập lại để gửi đề xuất.')
      return
    }
    if (!validateForm()) return

    setSubmitting(true)
    try {
      const latestRequestData = await fbGet(REQUESTS_PATH)
      const latestRequests = latestRequestData
        ? Object.entries(latestRequestData).map(([id, value]) => ({ ...value, id }))
        : []
      const latestUsage = calculateTemplateUsage({
        requests: latestRequests,
        template: selectedTemplate,
        person: me,
        at: new Date()
      })
      if (latestUsage.limitReached) {
        setErrors((previous) => ({
          ...previous,
          quota: `Đã hết hạn mức ${latestUsage.maxRequests} lần/${APPROVAL_PERIOD_LABELS[latestUsage.quotaPeriod]}.`
        }))
        showToast('Phiếu đã hết lượt sử dụng trong kỳ này')
        return
      }

      const now = new Date().toISOString()
      const payload = {
        code: genCode(),
        templateType: selectedTemplate?.title || 'ĐỀ XUẤT',
        templateId: selectedTemplate?.id || 'proposal',
        subject: subject.trim(),
        content: content.trim(),
        attachments,
        requesterId: me.id || '',
        requesterCode: me.employeeCode || resolveEmployeeCode(me.id, me.name, '') || '',
        requesterName: me.name,
        requesterAvatar: me.avatar || '',
        createdById: me.id || '',
        createdByCode: me.employeeCode || '',
        createdByName: me.name || '',
        followers,
        quotaEnabled: latestUsage.quotaEnabled,
        quotaLimit: latestUsage.maxRequests,
        quotaPeriod: latestUsage.quotaPeriod,
        quotaUsedBefore: latestUsage.used,
        quotaRemainingAfter:
          latestUsage.remaining === null
            ? null
            : Math.max(0, latestUsage.remaining - 1),
        attendanceSync: latestUsage.attendanceSync,
        ...(selectedTemplateUsesLeaveDates
          ? {
              leaveStartDate,
              leaveEndDate,
              leaveDuration,
              leaveType,
              attendanceSyncStatus: 'pending'
            }
          : {}),
        ...(selectedTemplateIsRecruit
          ? {
              recruitPosition: recruitPosition.trim(),
              recruitLevel: recruitLevel.trim(),
              recruitExperience: recruitExperience.trim(),
              recruitQuantity: Number(recruitQuantity) || 1,
              recruitDepartment: recruitDepartment.trim(),
              recruitDescription: recruitDescription.trim()
            }
          : {}),
        status: 'pending',
        currentStepIndex: 0,
        approvalSteps: effectiveApproverSteps
          .filter((s) => s.approverId)
          .map((s) => ({ ...s, decision: null, decidedAt: null, comment: '' })),
        createdAt: now
      }
      if (isEmployee) {
        const { error } = await supabase.rpc('submit_employee_approval', { p_data: payload })
        if (error) throw error
      } else {
        await fbPush(REQUESTS_PATH, { ...payload, companyId: authUser?.company_id || authUser?.companyId || 'speego-original' })
      }
      showToast(
        latestUsage.remaining === null
          ? 'Đã nộp yêu cầu'
          : `Đã nộp yêu cầu · còn ${Math.max(0, latestUsage.remaining - 1)} lần/${APPROVAL_PERIOD_LABELS[latestUsage.quotaPeriod]}`
      )
      resetForm()
      navigateApv(
        { tab: 'sent', filter: null, view: null, id: null, template: null, tplId: null },
        { replace: true }
      )
      await loadData()
    } catch (e) {
      console.error(e)
      setErrors((previous) => ({ ...previous, submit: e?.message || 'Có lỗi khi nộp yêu cầu.' }))
      showToast(e?.message || 'Có lỗi khi nộp yêu cầu')
    } finally {
      setSubmitting(false)
    }
  }

  // The RPC checks the assigned approver and commits attendance changes with
  // the final decision in one database transaction.
  const handleDecision = async (decision, comment = '', requestOverride = null) => {
    const target = requestOverride || selectedRequest
    if (!target) return
    setDeciding(true)
    try {
      const { data, error } = await supabase.rpc('decide_employee_approval', {
        p_id: target.id,
        p_decision: decision,
        p_comment: comment
      })
      if (error) throw error
      const leaveDates = decision === 'approved' ? listRequestLeaveDates(target) : []
      if (leaveDates.length) {
        try {
          await approveMatchingLeaveDays({ employeeId: target.requesterId, dates: leaveDates })
        } catch (syncError) {
          console.error('Không đồng bộ được ngày nghỉ phép:', syncError)
        }
      }
      showToast(
        decision === 'approved'
          ? leaveDates.length
            ? 'Đã duyệt. Ngày nghỉ phép đã được cập nhật.'
            : data?.attendanceSyncStatus === 'synced'
              ? 'Đã duyệt và đồng bộ ngày phép sang chấm công'
              : 'Đã đồng ý'
          : 'Đã từ chối'
      )
      setRejectPrompt(false)
      setDecisionComment('')
      await loadData()
    } catch (e) {
      console.error(e)
      showToast(e?.message || 'Có lỗi xảy ra')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="apv-page">
      <div className="apv" data-view={view} data-tab={tab}>
        {loading ? (
          <div className="loadingState">Đang tải dữ liệu...</div>
        ) : loadError ? (
          <div className="apv-card-block" role="alert">{loadError} <button type="button" onClick={loadData}>Tải lại</button></div>
        ) : view === 'template-form' ? (
          <>
            <div className="apv-topbar">
              <button className="apv-topbar__back" onClick={goBackToList}>
                <i className="fas fa-arrow-left"></i>
              </button>
              <div className="apv-topbar__title">
                {editTemplateId ? 'Sửa mẫu đề xuất' : 'Tạo mẫu đề xuất'}
              </div>
            </div>
            <div className="apv-body">
              <div className="apv-card-block">
                <p className="apv-tpl-hint">
                  HR tạo mẫu sẵn (tiêu đề, nội dung, người duyệt). Khi nhân viên chọn mẫu, form sẽ tự điền.
                </p>
                <div className="apv-field">
                  <label>Tên mẫu <span className="req">*</span></label>
                  <input
                    type="text"
                    value={tplForm.title}
                    onChange={(e) => setTplForm((p) => ({
                      ...p,
                      title: e.target.value,
                      defaultSubject: p.defaultSubject || e.target.value
                    }))}
                    placeholder="VD: ĐỀ XUẤT MUA VPP"
                  />
                </div>
                <div className="apv-field">
                  <label>Nhóm</label>
                  <select
                    className="apv-select"
                    value={tplForm.category}
                    onChange={(e) => setTplForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="apv-field">
                  <label>Mô tả ngắn</label>
                  <input
                    type="text"
                    value={tplForm.description}
                    onChange={(e) => setTplForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Hiện dưới tên mẫu trong danh sách"
                  />
                </div>
                <div className="apv-field">
                  <label>Về việc (mặc định)</label>
                  <input
                    type="text"
                    value={tplForm.defaultSubject}
                    onChange={(e) => setTplForm((p) => ({ ...p, defaultSubject: e.target.value }))}
                    placeholder="Tự điền vào ô Về việc khi tạo đề xuất"
                  />
                </div>
                <div className="apv-field">
                  <label>Nội dung mẫu (mặc định)</label>
                  <textarea
                    rows={8}
                    value={tplForm.defaultContent}
                    onChange={(e) => setTplForm((p) => ({ ...p, defaultContent: e.target.value }))}
                    placeholder={'Kính gửi Ban Lãnh đạo,\n\nTôi xin đề xuất...\n\nTrân trọng.'}
                  />
                </div>

                <div className="apv-policy-box">
                  <div className="apv-policy-box__title">
                    <i className="fas fa-gauge-high"></i>
                    Hạn mức sử dụng phiếu
                  </div>
                  <label className="apv-toggle-row">
                    <input
                      type="checkbox"
                      checked={Boolean(tplForm.quotaEnabled)}
                      onChange={(e) => setTplForm((previous) => ({
                        ...previous,
                        quotaEnabled: e.target.checked
                      }))}
                    />
                    <span>Giới hạn số lần một nhân viên được tạo phiếu</span>
                  </label>
                  {tplForm.quotaEnabled && (
                    <div className="apv-policy-grid">
                      <div className="apv-field">
                        <label>Số lần tối đa</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={tplForm.maxRequests}
                          onChange={(e) => setTplForm((previous) => ({
                            ...previous,
                            maxRequests: e.target.value
                          }))}
                        />
                      </div>
                      <div className="apv-field">
                        <label>Chu kỳ tự đặt lại</label>
                        <select
                          className="apv-select"
                          value={tplForm.quotaPeriod}
                          onChange={(e) => setTplForm((previous) => ({
                            ...previous,
                            quotaPeriod: e.target.value
                          }))}
                        >
                          <option value="week">Mỗi tuần</option>
                          <option value="month">Mỗi tháng</option>
                          <option value="year">Mỗi năm</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="apv-field">
                    <label>Đồng bộ chấm công</label>
                    <select
                      className="apv-select"
                      value={tplForm.attendanceSync}
                      onChange={(e) => setTplForm((previous) => ({
                        ...previous,
                        attendanceSync: e.target.value
                      }))}
                    >
                      <option value="none">Không đồng bộ</option>
                      <option value="paid-leave">Nghỉ có phép — cộng công khi duyệt</option>
                    </select>
                  </div>
                  <small>
                    Mẫu nghỉ phép hệ thống tự đặt 12 lần/năm; HR có thể sửa lại theo chính sách nội bộ.
                  </small>
                </div>

                <div className="apv-field">
                  <label>Người phê duyệt mặc định</label>
                  <p className="apv-tpl-hint" style={{ marginBottom: 8 }}>
                    Tick nhiều người — thứ tự tick / sắp xếp sẽ là luồng duyệt khi nhân viên tạo đề xuất.
                  </p>
                  {(tplForm.defaultApprovers || []).length > 0 && (
                    <div className="apv-tpl-approver-selected">
                      {(tplForm.defaultApprovers || []).map((a, idx) => (
                        <div key={a.approverId} className="apv-tpl-approver-chip">
                          <span className="apv-tpl-approver-chip__ord">{idx + 1}</span>
                          <Avatar name={a.approverName} avatar={a.approverAvatar} size={22} />
                          <span className="apv-tpl-approver-chip__name">{a.approverName}</span>
                          <button type="button" title="Lên" onClick={() => moveTplApprover(idx, -1)} disabled={idx === 0}>
                            <i className="fas fa-arrow-up"></i>
                          </button>
                          <button
                            type="button"
                            title="Xuống"
                            onClick={() => moveTplApprover(idx, 1)}
                            disabled={idx === tplForm.defaultApprovers.length - 1}
                          >
                            <i className="fas fa-arrow-down"></i>
                          </button>
                          <button type="button" title="Bỏ" onClick={() => toggleTplApprover({ id: a.approverId })}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="apv-tpl-approver-filters">
                    <input
                      type="text"
                      value={tplApproverSearch}
                      onChange={(e) => setTplApproverSearch(e.target.value)}
                      placeholder="Tìm nhân sự để chọn..."
                    />
                    <select
                      className="apv-select"
                      value={tplFilterBranch}
                      onChange={(e) => {
                        setTplFilterBranch(e.target.value)
                        setTplFilterDept('')
                        setTplFilterPos('')
                      }}
                    >
                      <option value="">Tất cả chi nhánh</option>
                      {[...new Set(employees.map((e) => e.chi_nhanh).filter(Boolean))]
                        .sort((a, b) => a.localeCompare(b, 'vi'))
                        .map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                    </select>
                    <select
                      className="apv-select"
                      value={tplFilterDept}
                      onChange={(e) => {
                        setTplFilterDept(e.target.value)
                        setTplFilterPos('')
                      }}
                    >
                      <option value="">Tất cả bộ phận</option>
                      {[
                        ...new Set(
                          employees
                            .filter((e) => !tplFilterBranch || e.chi_nhanh === tplFilterBranch)
                            .map((e) => e.bo_phan)
                            .filter(Boolean)
                        )
                      ]
                        .sort((a, b) => a.localeCompare(b, 'vi'))
                        .map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                    </select>
                    <select
                      className="apv-select"
                      value={tplFilterPos}
                      onChange={(e) => setTplFilterPos(e.target.value)}
                    >
                      <option value="">Tất cả vị trí</option>
                      {[
                        ...new Set(
                          employees
                            .filter((e) => {
                              if (tplFilterBranch && e.chi_nhanh !== tplFilterBranch) return false
                              if (tplFilterDept && e.bo_phan !== tplFilterDept) return false
                              return true
                            })
                            .map((e) => e.vi_tri)
                            .filter(Boolean)
                        )
                      ]
                        .sort((a, b) => a.localeCompare(b, 'vi'))
                        .map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="apv-tpl-approver-list">
                    {employees
                      .filter((emp) => {
                        if (tplFilterBranch && emp.chi_nhanh !== tplFilterBranch) return false
                        if (tplFilterDept && emp.bo_phan !== tplFilterDept) return false
                        if (tplFilterPos && emp.vi_tri !== tplFilterPos) return false
                        const q = normalizeString(tplApproverSearch)
                        if (!q) return true
                        return normalizeString(
                          `${emp.ho_va_ten || emp.name || ''} ${emp.employeeId || ''} ${emp.chi_nhanh || ''} ${emp.bo_phan || ''} ${emp.vi_tri || ''}`
                        ).includes(q)
                      })
                      .slice(0, 80)
                      .map((emp) => {
                        const checked = (tplForm.defaultApprovers || []).some(
                          (a) => String(a.approverId) === String(emp.id)
                        )
                        return (
                          <label key={emp.id} className={`apv-tpl-approver-row ${checked ? 'is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTplApprover(emp)}
                            />
                            <Avatar
                              name={emp.ho_va_ten || emp.name}
                              avatar={emp.avatarDataUrl || emp.avatarUrl || emp.avatar}
                              size={28}
                            />
                            <span className="apv-tpl-approver-row__info">
                              <span className="apv-tpl-approver-row__name">{emp.ho_va_ten || emp.name || 'N/A'}</span>
                              <small>
                                {[emp.employeeId, emp.chi_nhanh, emp.bo_phan, emp.vi_tri]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            </span>
                          </label>
                        )
                      })}
                    {employees.length === 0 && (
                      <div className="apv-picker__empty">Chưa có danh sách nhân sự</div>
                    )}
                  </div>
                </div>

                <div className="apv-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="apv-field">
                    <label>Màu icon</label>
                    <input
                      type="color"
                      value={tplForm.color}
                      onChange={(e) => setTplForm((p) => ({ ...p, color: e.target.value }))}
                    />
                  </div>
                  <div className="apv-field">
                    <label>Gắn đè mẫu hệ thống (tuỳ chọn)</label>
                    <select
                      className="apv-select"
                      value={tplForm.baseId}
                      onChange={(e) => {
                        const baseId = e.target.value
                        const policy = getTemplatePolicy({ id: baseId })
                        setTplForm((previous) => ({
                          ...previous,
                          baseId,
                          ...policy
                        }))
                      }}
                    >
                      <option value="">— Mẫu mới riêng —</option>
                      {BUILTIN_TEMPLATES.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="apv-actionbar">
              <button type="button" className="apv-btn" style={{ background: '#f1f3f5', color: '#344054' }} onClick={goBackToList}>
                Hủy
              </button>
              <button type="button" className="apv-btn apv-btn--approve" disabled={tplSaving} onClick={saveTemplateForm}>
                {tplSaving ? 'Đang lưu...' : 'Lưu mẫu đề xuất'}
              </button>
            </div>
          </>
        ) : view === 'create' ? (
          <>
            <div className="apv-topbar apv-topbar--saas">
              <button className="apv-topbar__back" onClick={goBackToList}>
                <i className="fas fa-arrow-left"></i>
              </button>
              <div className="apv-topbar__title">
                Tạo đề xuất
                <small>Điền thông tin → chọn người duyệt → gửi</small>
              </div>
            </div>

            <div className="apv-body apv-body--saas">
              <div className="apv-create-hero">
                <div className="apv-template-info">
                  <div className="apv-template-info__icon" style={{ background: selectedTemplate?.color || '#0f3f78' }}>
                    <i className={`fas ${selectedTemplate?.icon || 'fa-file-signature'}`}></i>
                  </div>
                  <div>
                    <div className="apv-template-info__eyebrow">Mẫu đang dùng</div>
                    <div className="apv-template-info__title">{selectedTemplate?.title || 'ĐỀ XUẤT'}</div>
                    <div className="apv-template-info__desc">
                      {selectedTemplate?.description ||
                        'Sử dụng khi bạn cần trình đề xuất, xin ý kiến hoặc phê duyệt một nội dung công việc.'}
                    </div>
                  </div>
                </div>

                <div className="apv-create-metrics">
                  <div className={`apv-metric-pill ${selectedTemplateUsage.limitReached ? 'is-limit' : ''}`}>
                    <span>Hạn mức</span>
                    <strong>
                      {selectedTemplateUsage.remaining === null
                        ? 'Không giới hạn'
                        : `${selectedTemplateUsage.used}/${selectedTemplateUsage.maxRequests}`}
                    </strong>
                  </div>
                  <div className="apv-metric-pill">
                    <span>Tháng này</span>
                    <strong>{myCreateStats.month.total}</strong>
                  </div>
                  <div className="apv-metric-pill">
                    <span>Phép năm</span>
                    <strong>
                      {ownLeaveSummaryLoading
                        ? '…'
                        : formatLeaveRemaining(ownLeaveSummary?.balance)}
                    </strong>
                  </div>
                  <div className="apv-metric-pill">
                    <span>Phép tháng</span>
                    <strong>
                      {ownLeaveSummaryLoading
                        ? '…'
                        : formatLeaveCount(ownLeaveSummary?.usage?.remaining ?? 0)}
                    </strong>
                  </div>
                </div>
                {errors.quota && <div className="apv-field-error">{errors.quota}</div>}
                {ownLeaveSummaryError && <div className="apv-field-error">{ownLeaveSummaryError}</div>}
              </div>

              <div className="apv-card-block apv-card-block--saas apv-create-main">
                <div className="apv-section-head">
                  <h2>Thông tin chung</h2>
                  <p>Người tạo lấy theo tài khoản đăng nhập.</p>
                </div>
                <div className="apv-identity-row">
                  <div className="apv-identity-chip">
                    <span>Họ và tên</span>
                    <strong>{me?.name || '—'}</strong>
                  </div>
                  <div className="apv-identity-chip">
                    <span>Mã nhân sự</span>
                    <strong>{me?.employeeCode || '—'}</strong>
                  </div>
                  {me?.department ? (
                    <div className="apv-identity-chip">
                      <span>Bộ phận</span>
                      <strong>{me.department}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="apv-field">
                  <label>
                    Về việc<span className="req">*</span>
                  </label>
                  <select
                    className="apv-select"
                    value={selectedTemplate?.id || ''}
                    onChange={(e) => {
                      const tpl = allTemplates.find((t) => t.id === e.target.value)
                      if (!tpl) return
                      setSubject(tpl.defaultSubject || tpl.title)
                      if (tpl.defaultContent) setContent(tpl.defaultContent)
                      const defaults = Array.isArray(tpl.defaultApprovers)
                        ? tpl.defaultApprovers.filter((a) => a?.approverId)
                        : []
                      setApproverSteps(
                        defaults.length > 0
                          ? defaults.map((a) => ({
                              approverId: a.approverId,
                              approverName: a.approverName || '',
                              approverAvatar: a.approverAvatar || ''
                            }))
                          : [emptyStep()]
                      )
                      const isRecruit =
                        tpl.id === 'recruit' ||
                        tpl.baseId === 'recruit' ||
                        `${tpl.title || ''} ${tpl.defaultSubject || ''} ${tpl.description || ''}`
                          .toLocaleLowerCase('vi')
                          .includes('tuyển dụng')
                      if (isRecruit) {
                        setRecruitPosition('')
                        setRecruitLevel('')
                        setRecruitExperience('')
                        setRecruitQuantity('1')
                        setRecruitDepartment(me?.department || '')
                        setRecruitDescription('')
                      }
                      rememberTemplate(tpl.id)
                      navigateApv({ template: tpl.id })
                      if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }))
                      if (errors.approvers) setErrors((prev) => ({ ...prev, approvers: undefined }))
                      if (errors.recruitPosition) setErrors((prev) => ({ ...prev, recruitPosition: undefined }))
                    }}
                  >
                    <option value="" disabled>
                      Chọn mẫu yêu cầu
                    </option>
                    {TEMPLATE_CATEGORIES.map((category) => {
                      const items = allTemplates.filter((t) => t.category === category)
                      if (!items.length) return null
                      return (
                        <optgroup key={category} label={category}>
                          {items.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.title}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                  {errors.subject && <div className="apv-field-error">{errors.subject}</div>}
                </div>

                {selectedTemplateIsRecruit && (
                  <div className="apv-leave-fields apv-recruit-fields">
                    <div className="apv-section-head apv-section-head--inline">
                      <h2>Nhu cầu tuyển dụng</h2>
                      <p>Vị trí, bậc năng lực, số lượng và mục đích tuyển.</p>
                    </div>
                    <div className="apv-field-row apv-field-row--equal">
                      <div className="apv-field">
                        <label>Vị trí cần tuyển <span className="req">*</span></label>
                        <input
                          type="text"
                          list="recruit-position-options"
                          value={recruitPosition}
                          onChange={(e) => {
                            setRecruitPosition(e.target.value)
                            if (errors.recruitPosition) setErrors((prev) => ({ ...prev, recruitPosition: undefined }))
                          }}
                          placeholder="VD: Nhân viên Sale"
                        />
                        <datalist id="recruit-position-options">
                          {recruitPositions.map((item) => (
                            <option key={item} value={item} />
                          ))}
                        </datalist>
                        {errors.recruitPosition && <div className="apv-field-error">{errors.recruitPosition}</div>}
                      </div>
                      <div className="apv-field">
                        <label>Bộ phận / phòng ban tuyển dụng</label>
                        <input
                          type="text"
                          list="recruit-department-options"
                          value={recruitDepartment}
                          onChange={(e) => setRecruitDepartment(e.target.value)}
                          placeholder="VD: Kinh doanh"
                        />
                        <datalist id="recruit-department-options">
                          {recruitDepartments.map((item) => (
                            <option key={item} value={item} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="apv-field-row apv-field-row--equal">
                      <div className="apv-field">
                        <label>Khung / bậc năng lực</label>
                        <input
                          type="text"
                          list="recruit-level-options"
                          value={recruitLevel}
                          onChange={(e) => setRecruitLevel(e.target.value)}
                          placeholder="Intern/Học việc, Fresher, Junior..."
                        />
                        <datalist id="recruit-level-options">
                          <option value="Intern/Học việc" />
                          <option value="Fresher" />
                          <option value="Junior" />
                          <option value="Senior" />
                          <option value="Leader/Manager" />
                        </datalist>
                      </div>
                      <div className="apv-field">
                        <label>Số năm kinh nghiệm yêu cầu</label>
                        <input
                          type="text"
                          value={recruitExperience}
                          onChange={(e) => setRecruitExperience(e.target.value)}
                          placeholder="VD: 1-2 năm, từ 3 năm..."
                        />
                      </div>
                      <div className="apv-field">
                        <label>Số lượng cần tuyển</label>
                        <input
                          type="number"
                          min="1"
                          value={recruitQuantity}
                          onChange={(e) => setRecruitQuantity(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="apv-field">
                      <label>Mô tả ngắn về yêu cầu và mục đích tuyển dụng</label>
                      <textarea
                        rows={3}
                        value={recruitDescription}
                        onChange={(e) => setRecruitDescription(e.target.value)}
                        placeholder="Yêu cầu kỹ năng, lý do tuyển dụng, mục tiêu vị trí..."
                      />
                    </div>
                  </div>
                )}

                {selectedTemplateUsesLeaveDates && (
                  <div className="apv-leave-fields">
                    <div className="apv-card-block__title">Thông tin đề xuất xin nghỉ</div>
                    <div className="apv-field-row apv-field-row--equal">
                      <div className="apv-field">
                        <label>Từ ngày <span className="req">*</span></label>
                        <input
                          type="date"
                          value={leaveStartDate}
                          onChange={(e) => {
                            const nextStart = e.target.value
                            setLeaveStartDate(nextStart)
                            if (!leaveEndDate || leaveEndDate < nextStart) {
                              setLeaveEndDate(nextStart)
                            }
                          }}
                        />
                      </div>
                      <div className="apv-field">
                        <label>Đến ngày <span className="req">*</span></label>
                        <input
                          type="date"
                          min={leaveStartDate}
                          value={leaveEndDate}
                          onChange={(e) => setLeaveEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="apv-field-row apv-field-row--equal">
                      <div className="apv-field">
                        <label>Loại nghỉ</label>
                        <select
                          className="apv-select"
                          value={leaveType}
                          onChange={(e) => setLeaveType(e.target.value)}
                        >
                          <option value="paid">Sử dụng phép năm</option>
                          <option value="unpaid">Nghỉ không hưởng lương</option>
                        </select>
                      </div>
                      <div className="apv-field">
                        <label>Thời lượng mỗi ngày</label>
                        <select
                          className="apv-select"
                          value={leaveDuration}
                          onChange={(e) => setLeaveDuration(e.target.value)}
                        >
                          <option value="full">Cả ngày (1 công)</option>
                          <option value="half">Nửa ngày (0,5 công)</option>
                        </select>
                      </div>
                    </div>
                    <div className="apv-leave-balance" aria-live="polite">
                      <strong>Số phép năm</strong>
                      {balanceLoading ? <span>Đang tính số phép...</span> : balanceError ? (
                        <span className="apv-field-error">{balanceError}</span>
                      ) : Object.entries(leaveDaysByYear).map(([year, requested]) => {
                        const balance = leaveBalances[year]
                        return <div className="apv-leave-balance__row" key={year}>
                          <b>{year}</b>
                          <span>Tổng: {balance?.configured ? balance.total : 'Chưa cài đặt'}</span>
                          <span>Đã xin: {balance?.used ?? '—'}</span>
                          <span>Còn: {balance?.remaining ?? '—'}</span>
                          <span>Đơn này: {requested}</span>
                        </div>
                      })}
                      {leaveType === 'unpaid' && <small>Nghỉ không hưởng lương không trừ phép năm.</small>}
                    </div>
                    <div className="apv-leave-balance apv-leave-month-usage" aria-live="polite">
                      <strong>Số lượt sử dụng phép trong tháng (tối đa 2 lần)</strong>
                      {leaveMonthlyUsageLoading ? <span>Đang tính số lượt phép...</span> : leaveMonthlyUsageError ? (
                        <span className="apv-field-error">{leaveMonthlyUsageError}</span>
                      ) : leaveMonths.map(month => {
                        const usage = leaveMonthlyUsage[month]
                        const used = Number(usage?.used || 0)
                        const limit = Number(usage?.limit || 2)
                        return <div className="apv-leave-balance__row" key={month}>
                          <b>{month}</b>
                          <span>Đã xin: {used}/{limit} lần</span>
                          <span>Còn: {Math.max(0, limit - used)} lượt</span>
                        </div>
                      })}
                      {leaveType === 'unpaid' && <small>Giới hạn 2 lần/tháng áp dụng khi sử dụng phép năm.</small>}
                    </div>
                    <div className="apv-leave-fields__note">
                      <i className="fas fa-link"></i>
                      Khi được duyệt ở bước cuối, các ngày nghỉ có phép sẽ tự chuyển sang Chấm công.
                    </div>
                    {errors.leaveDates && <div className="apv-field-error">{errors.leaveDates}</div>}
                    {errors.leaveBalance && <div className="apv-field-error">{errors.leaveBalance}</div>}
                    {errors.leaveMonthlyLimit && <div className="apv-field-error">{errors.leaveMonthlyLimit}</div>}
                  </div>
                )}

                <div className="apv-field">
                  <label>
                    Nội dung<span className="req">*</span>
                  </label>
                  <textarea
                    rows={5}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={'Kính gửi Ban Lãnh đạo Công ty,\n\nNội dung đề xuất...'}
                  />
                  {errors.content && <div className="apv-field-error">{errors.content}</div>}
                </div>

                <div className="apv-field">
                  <label>Đính kèm</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFilesSelected}
                  />
                  <button type="button" className="apv-attach-btn" onClick={() => fileInputRef.current?.click()}>
                    <i className="fas fa-paperclip"></i> Thêm tập tin
                  </button>
                  {attachments.length > 0 && (
                    <div className="apv-attach-list">
                      {attachments.map((a, i) => (
                        <div key={i} className="apv-attach-chip">
                          <i className="fas fa-paperclip"></i>
                          <span>{a.name}</span>
                          <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="apv-card-block apv-card-block--saas apv-create-side">
                <div className="apv-section-head">
                  <h2>Người theo dõi</h2>
                  <p>Nhận thông báo khi đề xuất có cập nhật.</p>
                </div>
                {followers.length > 0 && (
                  <div className="apv-attach-list" style={{ marginBottom: 8 }}>
                    {followers.map((f, i) => (
                      <div key={f.id} className="apv-attach-chip">
                        <Avatar name={f.name} avatar={f.avatar} size={22} />
                        <span>{f.name}</span>
                        <button onClick={() => setFollowers((prev) => prev.filter((_, j) => j !== i))}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="apv-picker">
                  <button type="button" className="apv-attach-btn" onClick={() => setPickerStepIndex('followers')}>
                    <i className="fas fa-bell"></i> Thêm người theo dõi
                  </button>
                  {pickerStepIndex === 'followers' && (
                    <EmployeePicker
                      employees={employees.filter((e) => !followers.some((f) => f.id === e.id))}
                      onPick={(emp) => {
                        setFollowers((prev) => [
                          ...prev,
                          {
                            id: emp.id,
                            name: emp.ho_va_ten || emp.name || 'N/A',
                            avatar: emp.avatarDataUrl || emp.avatarUrl || emp.avatar || ''
                          }
                        ])
                        setPickerStepIndex(null)
                      }}
                      onClose={() => setPickerStepIndex(null)}
                    />
                  )}
                </div>
              </div>

              <div className="apv-card-block apv-card-block--saas apv-create-side">
                <div className="apv-section-head">
                  <h2>Luồng phê duyệt</h2>
                  <p>Chọn người duyệt theo từng bước trước khi gửi.</p>
                </div>
                <div className="apv-timeline">
                  <div className="apv-tl-step">
                    <div className="apv-tl-step__rail">
                      <div className="apv-tl-step__dot apv-tl-step__dot--muted">
                        <i className="fas fa-circle" style={{ fontSize: 6 }}></i>
                      </div>
                      <div className="apv-tl-step__line apv-tl-step__line--done"></div>
                    </div>
                    <div className="apv-tl-step__body" style={{ paddingBottom: 14 }}>
                      <div className="apv-tl-step__title" style={{ fontWeight: 400, color: '#98a2b3', fontSize: '.82rem' }}>
                        Bắt đầu
                      </div>
                    </div>
                  </div>

                  <div className="apv-tl-step">
                    <div className="apv-tl-step__rail">
                      <div className="apv-tl-step__dot apv-tl-step__dot--submit">
                        <i className="fas fa-user"></i>
                      </div>
                      <div className="apv-tl-step__line apv-tl-step__line--done"></div>
                    </div>
                    <div className="apv-tl-step__body">
                      <div className="apv-tl-step__title">Nộp yêu cầu</div>
                      <div className="apv-tl-approver">
                        <Avatar name={me?.name} avatar={me?.avatar} size={26} />
                        <span className="apv-tl-approver__name">{me?.name || 'Bạn'}</span>
                      </div>
                    </div>
                  </div>

                  {isEmployee && <div className="apv-tl-step">
                    <div className="apv-tl-step__rail"><div className="apv-tl-step__dot apv-tl-step__dot--waiting"><i className="fas fa-stamp"></i></div></div>
                    <div className="apv-tl-step__body">
                      <div className="apv-tl-step__title">Người phê duyệt theo Team</div>
                      {leaderLoading ? <span>Đang tìm Leader...</span> : leaderError ? (
                        <div className="apv-field-error">{leaderError}</div>
                      ) : teamLeader ? (
                        <div className="apv-tl-approver"><Avatar name={teamLeader.name} avatar={teamLeader.avatar} size={26} />
                          <span className="apv-tl-approver__name">{teamLeader.name} · {teamLeader.department}</span></div>
                      ) : <div className="apv-field-error">Chưa tìm được Leader của Team.</div>}
                    </div>
                  </div>}
                  {!isEmployee && approverSteps.map((step, idx) => (
                    <div className="apv-tl-step" key={idx}>
                      <div className="apv-tl-step__rail">
                        <div className="apv-tl-step__dot apv-tl-step__dot--waiting">
                          <i className="fas fa-stamp"></i>
                        </div>
                        <div className="apv-tl-step__line"></div>
                      </div>
                      <div className="apv-tl-step__body">
                        <div className="apv-tl-step__title">
                          Phê duyệt
                          {approverSteps.length > 1 && (
                            <button
                              className="apv-tl-remove-approver"
                              title="Xóa bước phê duyệt"
                              onClick={() => removeStep(idx)}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                        </div>
                        <div className="apv-picker">
                          {step.approverId ? (
                            <div className="apv-tl-approver">
                              <Avatar name={step.approverName} avatar={step.approverAvatar} size={26} />
                              <span className="apv-tl-approver__name">{step.approverName}</span>
                              <button
                                className="apv-tl-remove-approver"
                                onClick={() => updateStep(idx, emptyStep())}
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          ) : (
                            <div className="apv-tl-add-approver" onClick={() => setPickerStepIndex(idx)}>
                              <i className="fas fa-user-plus"></i> Chọn người phê duyệt
                            </div>
                          )}
                          {pickerStepIndex === idx && (
                            <EmployeePicker
                              employees={employees}
                              onPick={(emp) => {
                                updateStep(idx, {
                                  approverId: emp.id,
                                  approverName: emp.ho_va_ten || emp.name || 'N/A',
                                  approverAvatar: emp.avatarDataUrl || emp.avatarUrl || emp.avatar || ''
                                })
                                setPickerStepIndex(null)
                              }}
                              onClose={() => setPickerStepIndex(null)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!isEmployee && approverSteps.length < MAX_APPROVAL_STEPS && (
                    <button type="button" className="apv-tl-add-step" onClick={addStep}>
                      <i className="fas fa-plus"></i> Thêm bước phê duyệt
                    </button>
                  )}

                  <div className="apv-tl-step" style={{ marginTop: 10 }}>
                    <div className="apv-tl-step__rail">
                      <div className="apv-tl-step__dot apv-tl-step__dot--muted">
                        <i className="fas fa-circle" style={{ fontSize: 6 }}></i>
                      </div>
                    </div>
                    <div className="apv-tl-step__body">
                      <div className="apv-tl-step__title" style={{ fontWeight: 400, color: '#98a2b3', fontSize: '.82rem' }}>
                        Kết thúc
                      </div>
                    </div>
                  </div>
                </div>
                {errors.approvers && <div className="apv-field-error">{errors.approvers}</div>}
              </div>
            </div>

            <div className="apv-actionbar">
              <button
                className="apv-btn apv-btn--primary"
                disabled={submitting || selectedTemplateUsage.limitReached || leaderLoading || (isEmployee && !teamLeader) || (selectedTemplateUsesLeaveDates && leaveType === 'paid' && (balanceLoading || leaveMonthlyUsageLoading))}
                onClick={handleSubmitRequest}
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Đang nộp...
                  </>
                ) : (
                  'Gửi đơn đề xuất'
                )}
              </button>
              {errors.submit && <div className="apv-field-error" role="alert">{errors.submit}</div>}
            </div>
          </>
        ) : view === 'detail' && selectedRequest ? (
          <>
            <div className="apv-topbar">
              <button className="apv-topbar__back" onClick={goBackToList}>
                <i className="fas fa-arrow-left"></i>
              </button>
              <div className="apv-topbar__title">Xem yêu cầu</div>
            </div>

            <div className="apv-body">
              <div className="apv-card-block">
                <div className="apv-detail-head">
                  <div className="apv-template-info">
                    <div className="apv-template-info__icon">
                      <i className="fas fa-file-signature"></i>
                    </div>
                    <div>
                      <div className="apv-template-info__title">{selectedRequest.templateType || 'ĐỀ XUẤT'}</div>
                      <div className="apv-detail-head__meta">Số: {selectedRequest.code}</div>
                    </div>
                  </div>
                  <span className={`apv-badge ${statusBadge(selectedRequest.status).cls}`}>
                    {statusBadge(selectedRequest.status).label}
                  </span>
                </div>
                <div className="apv-detail-submitter">
                  <Avatar name={selectedRequest.requesterName} avatar={selectedRequest.requesterAvatar} size={34} />
                  <div>
                    <div className="apv-detail-submitter__label">Người tạo phiếu</div>
                    <div className="apv-detail-submitter__name">
                      {selectedRequest.requesterName}
                      {selectedRequest.requesterCode ? ` · ${selectedRequest.requesterCode}` : ''}
                    </div>
                    <div className="apv-detail-submitter__date">{formatDateTime(selectedRequest.createdAt)}</div>
                  </div>
                </div>
              </div>

              <div className="apv-card-block">
                <div className="apv-field">
                  <label>Về việc</label>
                  <div className="apv-detail-text">{selectedRequest.subject}</div>
                </div>
                <div className="apv-field">
                  <label>Nội dung</label>
                  <div className="apv-detail-text">{selectedRequest.content}</div>
                </div>
                {(selectedRequest.recruitPosition || selectedRequest.recruitDepartment) && (
                  <div className="apv-detail-leave">
                    <div>
                      <span>Vị trí</span>
                      <strong>{selectedRequest.recruitPosition || '—'}</strong>
                    </div>
                    <div>
                      <span>Bộ phận</span>
                      <strong>{selectedRequest.recruitDepartment || '—'}</strong>
                    </div>
                    <div>
                      <span>Bậc năng lực</span>
                      <strong>{selectedRequest.recruitLevel || '—'}</strong>
                    </div>
                    <div>
                      <span>Kinh nghiệm</span>
                      <strong>{selectedRequest.recruitExperience || '—'}</strong>
                    </div>
                    <div>
                      <span>Số lượng</span>
                      <strong>{selectedRequest.recruitQuantity || '—'}</strong>
                    </div>
                    {selectedRequest.recruitDescription && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span>Mô tả / mục đích</span>
                        <strong style={{ whiteSpace: 'pre-wrap' }}>{selectedRequest.recruitDescription}</strong>
                      </div>
                    )}
                  </div>
                )}
                {listRequestLeaveDates(selectedRequest).length > 0 && (
                  <div className="apv-detail-leave">
                    <div>
                      <span>Từ ngày</span>
                      <strong>{formatDateShort(selectedRequest.leaveStartDate)}</strong>
                    </div>
                    <div>
                      <span>Đến ngày</span>
                      <strong>{formatDateShort(selectedRequest.leaveEndDate)}</strong>
                    </div>
                    <div>
                      <span>Loại nghỉ</span>
                      <strong>{selectedRequest.leaveType === 'unpaid' ? 'Không lương' : 'Có phép'}</strong>
                    </div>
                    <div>
                      <span>Thời lượng</span>
                      <strong>{selectedRequest.leaveDuration === 'half' ? '0,5 công/ngày' : '1 công/ngày'}</strong>
                    </div>
                    <div>
                      <span>Đồng bộ công</span>
                      <strong>
                        {selectedRequest.attendanceSyncStatus === 'synced'
                          ? 'Đã đồng bộ'
                          : selectedRequest.status === 'approved'
                            ? 'Chưa đồng bộ'
                            : 'Chờ duyệt'}
                      </strong>
                    </div>
                  </div>
                )}
                {selectedRequest.quotaLimit > 0 && (
                  <div className="apv-detail-quota">
                    Hạn mức khi tạo: {selectedRequest.quotaLimit} lần/
                    {APPROVAL_PERIOD_LABELS[selectedRequest.quotaPeriod] || 'kỳ'}
                    {' · '}Còn lại sau phiếu này: {selectedRequest.quotaRemainingAfter ?? '—'}
                  </div>
                )}
                <div className="apv-field">
                  <label>Đính kèm</label>
                  {(selectedRequest.attachments || []).length > 0 ? (
                    <div className="apv-attach-list">
                      {selectedRequest.attachments.map((a, i) => (
                        <div key={i} className="apv-attach-chip">
                          <i className="fas fa-paperclip"></i>
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="apv-detail-text" style={{ color: '#98a2b3' }}>
                      Không có tập tin
                    </div>
                  )}
                </div>
              </div>

              <div className="apv-card-block">
                <div className="apv-card-block__title">Luồng phê duyệt</div>
                <div className="apv-timeline">
                  <div className="apv-tl-step">
                    <div className="apv-tl-step__rail">
                      <div className="apv-tl-step__dot apv-tl-step__dot--muted">
                        <i className="fas fa-circle" style={{ fontSize: 6 }}></i>
                      </div>
                      <div className="apv-tl-step__line apv-tl-step__line--done"></div>
                    </div>
                    <div className="apv-tl-step__body" style={{ paddingBottom: 14 }}>
                      <div className="apv-tl-step__title" style={{ fontWeight: 400, color: '#98a2b3', fontSize: '.82rem' }}>
                        Bắt đầu
                      </div>
                    </div>
                  </div>

                  <div className="apv-tl-step">
                    <div className="apv-tl-step__rail">
                      <div className="apv-tl-step__dot apv-tl-step__dot--submit">
                        <i className="fas fa-check"></i>
                      </div>
                      <div className="apv-tl-step__line apv-tl-step__line--done"></div>
                    </div>
                    <div className="apv-tl-step__body">
                      <div className="apv-tl-step__title">Nộp yêu cầu</div>
                      <div className="apv-tl-approver">
                        <Avatar name={selectedRequest.requesterName} avatar={selectedRequest.requesterAvatar} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="apv-tl-approver__name">{selectedRequest.requesterName}</div>
                          <div className="apv-tl-approver__meta">Đã nộp • {formatDateTime(selectedRequest.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedRequest.approvalSteps.map((step, idx) => {
                    const st = stepStatus(selectedRequest, idx)
                    const dotIcon =
                      st === 'approved' ? 'fa-check' : st === 'rejected' ? 'fa-times' : st === 'pending' ? 'fa-ellipsis-h' : 'fa-stamp'
                    return (
                      <div className="apv-tl-step" key={idx}>
                        <div className="apv-tl-step__rail">
                          <div className={`apv-tl-step__dot apv-tl-step__dot--${st}`}>
                            <i className={`fas ${dotIcon}`}></i>
                          </div>
                          <div className={`apv-tl-step__line ${st === 'approved' ? 'apv-tl-step__line--done' : ''}`}></div>
                        </div>
                        <div className="apv-tl-step__body">
                          <div className="apv-tl-step__title">
                            Phê duyệt
                            <span className={`apv-tl-step__status apv-tl-step__status--${st}`}>
                              {st === 'approved'
                                ? 'Đồng ý'
                                : st === 'rejected'
                                  ? 'Từ chối'
                                  : st === 'pending'
                                    ? 'Đang thực hiện'
                                    : 'Chờ đến lượt'}
                            </span>
                          </div>
                          <div className="apv-tl-approver">
                            <Avatar
                              name={step.decidedByName || step.approverName}
                              avatar={step.decidedByAvatar || step.approverAvatar}
                              size={26}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="apv-tl-approver__name">
                                {step.decidedByName || step.approverName}
                              </div>
                              {step.decidedAt ? (
                                <div className="apv-tl-approver__meta apv-tl-approver__meta--decision">
                                  {st === 'approved' ? 'Đã duyệt' : st === 'rejected' ? 'Đã từ chối' : 'Đã xử lý'}
                                  {' bởi '}
                                  <b>{step.decidedByName || step.approverName}</b>
                                  {' • '}
                                  {formatDateTime(step.decidedAt)}
                                </div>
                              ) : (
                                <div className="apv-tl-approver__meta">Người được chỉ định duyệt</div>
                              )}
                              {step.comment && <div className="apv-tl-approver__meta">"{step.comment}"</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div className="apv-tl-step">
                    <div className="apv-tl-step__rail">
                      <div
                        className={`apv-tl-step__dot ${selectedRequest.status === 'approved' ? 'apv-tl-step__dot--approved' : 'apv-tl-step__dot--muted'
                          }`}
                      >
                        <i className="fas fa-circle" style={{ fontSize: 6 }}></i>
                      </div>
                    </div>
                    <div className="apv-tl-step__body">
                      <div className="apv-tl-step__title" style={{ fontWeight: 400, color: '#98a2b3', fontSize: '.82rem' }}>
                        Kết thúc
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedRequest.followers?.length > 0 && (
                <div className="apv-card-block">
                  <div className="apv-card-block__title">Người theo dõi</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedRequest.followers.map((f) => (
                      <div key={f.id} className="apv-attach-chip" style={{ padding: '5px 10px' }}>
                        <Avatar name={f.name} avatar={f.avatar} size={20} />
                        <span>{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(selectedRequest.approvalSteps || []).some((s) => isMe(s.approverId, s.approverName)) && (
                <div className="apv-card-block">
                  <div className="apv-my-stats">
                    <div className="apv-my-stats__head">
                      <strong>Số lần duyệt của bạn</strong>
                      <span>
                        {me?.name || 'Nhân viên hiện tại'}
                        {me?.employeeCode ? ` · Mã NV: ${me.employeeCode}` : ''}
                      </span>
                    </div>
                    <div className="apv-my-stats__periods">
                      {[
                        ['week', 'Tuần này', myApproveStats.week],
                        ['month', 'Tháng này', myApproveStats.month],
                        ['year', 'Năm nay', myApproveStats.year]
                      ].map(([key, label, bucket]) => {
                        const currentType = selectedRequest.templateType || 'ĐỀ XUẤT'
                        const currentCount = bucket.byTemplate[currentType] || 0
                        const otherTypes = Object.entries(bucket.byTemplate)
                        return (
                          <div key={key} className="apv-my-stats__period-card">
                            <div className="apv-my-stats__period-top">
                              <span>{label}</span>
                              <strong>{bucket.total}</strong>
                            </div>
                            <div className="apv-my-stats__current">
                              Mẫu này: <b>{currentCount}</b> lần
                            </div>
                            <div className="apv-my-stats__types">
                              {otherTypes.length === 0 ? (
                                <span className="apv-my-stats__empty">Chưa duyệt lần nào</span>
                              ) : (
                                otherTypes
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([name, count]) => (
                                    <span key={name} className={name === currentType ? 'is-active' : ''}>
                                      {name}: <b>{count}</b>
                                    </span>
                                  ))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canDecideRequest(selectedRequest) && (
              <div className="apv-actionbar" style={{ flexWrap: 'wrap' }}>
                {!isMyTurn(selectedRequest) && (
                  <div className="apv-actionbar__notice">
                    <i className="fas fa-user-shield"></i> Bạn đang duyệt thay{' '}
                    <b>{(selectedRequest.approvalSteps || [])[selectedRequest.currentStepIndex || 0]?.approverName || 'người được chỉ định'}</b>
                  </div>
                )}
                <button className="apv-btn apv-btn--reject" disabled={deciding} onClick={() => setRejectPrompt(true)}>
                  <i className="fas fa-times"></i> Từ chối
                </button>
                <button className="apv-btn apv-btn--approve" disabled={deciding} onClick={() => handleDecision('approved')}>
                  <i className="fas fa-check"></i> Đồng ý
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="apv-topbar">
              <div className="apv-topbar__icon">
                <i className="fas fa-stamp"></i>
              </div>
              <div className="apv-topbar__title">
                {tab === 'templates' ? 'Mẫu yêu cầu' : tab === 'stats' ? 'Thống kê đề xuất' : 'Đề xuất'}
                <small>
                  {tab === 'templates'
                    ? 'Chọn mẫu để tạo yêu cầu mới'
                    : tab === 'stats'
                      ? 'Theo mã nhân viên · Tuần / Tháng / Năm'
                      : 'Đề xuất & yêu cầu công việc'}
                </small>
              </div>
              <div className="apv-topbar__icon" title={me?.name}>
                <Avatar name={me?.name} avatar={me?.avatar} size={30} />
              </div>
            </div>

            <div className="apv-search">
              <i className="fas fa-search"></i>
              <input
                placeholder={tab === 'stats' ? 'Tìm theo mã NV, họ tên...' : 'Tìm kiếm'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="apv-tabs">
              <button
                className={tab === 'inbox' ? 'active' : ''}
                onClick={() => setTabNav('inbox')}
              >
                Gửi đến
              </button>
              <button
                className={tab === 'sent' ? 'active' : ''}
                onClick={() => setTabNav('sent')}
              >
                Gửi đi
              </button>
              <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTabNav('admin')}>Quản trị</button>
              <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTabNav('templates')}>Mẫu yêu cầu</button>
              <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTabNav('stats')}>Thống kê</button>
            </div>

            {tab === 'templates' ? (
              <div className="apv-templates">
                <div className="apv-tpl-toolbar">
                  <button
                    type="button"
                    className="apv-btn apv-btn--approve"
                    style={{ padding: '10px 16px', fontWeight: 700 }}
                    onClick={() => openTemplateForm()}
                  >
                    <i className="fas fa-file-medical"></i> Tạo mẫu đề xuất
                  </button>
                  <span className="apv-tpl-toolbar__hint">
                    Tạo mẫu sẵn → khi chọn mẫu, form tự điền Về việc & nội dung
                  </span>
                </div>

                {recentTemplates.length > 0 && !normalizeString(search) && (
                  <section className="apv-template-group">
                    <h4>Chỉnh sửa gần nhất</h4>
                    <div className="apv-template-list">
                      {recentTemplates.map((tpl) => (
                        <div key={`recent-${tpl.id}`} className="apv-template-item-row">
                          <button
                            type="button"
                            className="apv-template-item"
                            onClick={() => openCreate(tpl)}
                          >
                            <span className="apv-template-item__icon" style={{ background: tpl.color }}>
                              <i className={`fas ${tpl.icon}`}></i>
                            </span>
                            <span className="apv-template-item__title">
                              {tpl.title}
                              <small className="apv-template-item__meta">
                                Người tạo: {tpl.createdBy || tpl.updatedBy || 'Mẫu hệ thống'}
                              </small>
                            </span>
                            <i className="fas fa-chevron-right apv-template-item__arrow"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {TEMPLATE_CATEGORIES.map((category) => {
                  const items = filteredTemplates.filter((t) => t.category === category)
                  if (!items.length) return null
                  return (
                    <section key={category} className="apv-template-group">
                      <h4>{category}</h4>
                      <div className="apv-template-list">
                        {items.map((tpl) => (
                          <div key={tpl.id} className="apv-template-item-row">
                            <button
                              type="button"
                              className="apv-template-item"
                              onClick={() => openCreate(tpl)}
                            >
                              <span className="apv-template-item__icon" style={{ background: tpl.color }}>
                                <i className={`fas ${tpl.icon}`}></i>
                              </span>
                              <span className="apv-template-item__title">
                                {tpl.title}
                                {tpl.defaultContent ? (
                                  <small className="apv-template-item__badge">Có nội dung mẫu</small>
                                ) : null}
                                <small className="apv-template-item__meta">
                                  Người tạo: {tpl.createdBy || tpl.updatedBy || 'Mẫu hệ thống'}
                                </small>
                                {tpl.quotaEnabled && tpl.maxRequests > 0 && (
                                  <small className="apv-template-item__quota">
                                    Tối đa {tpl.maxRequests} lần/{APPROVAL_PERIOD_LABELS[tpl.quotaPeriod]}
                                  </small>
                                )}
                              </span>
                              <i className="fas fa-chevron-right apv-template-item__arrow"></i>
                            </button>
                            {canManageTemplates && (
                              <div className="apv-template-item__actions">
                                <button
                                  type="button"
                                  title="Sửa / gắn nội dung mẫu"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const custom = customTemplates.find(
                                      (c) => c.id === tpl.id || c.baseId === tpl.id || c.recordId === tpl.recordId
                                    )
                                    if (custom) {
                                      openTemplateForm({ ...tpl, ...custom, recordId: custom.id })
                                    } else {
                                      openTemplateForm({
                                        ...tpl,
                                        recordId: null,
                                        baseId: BUILTIN_TEMPLATES.some((b) => b.id === tpl.id) ? tpl.id : ''
                                      })
                                    }
                                  }}
                                >
                                  <i className="fas fa-pen"></i>
                                </button>
                                {customTemplates.some((c) => c.id === tpl.id || c.baseId === tpl.id) && (
                                  <button
                                    type="button"
                                    title="Xóa mẫu tùy chỉnh"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const custom = customTemplates.find(
                                        (c) => c.id === tpl.id || c.baseId === tpl.id
                                      )
                                      if (custom) deleteCustomTemplate(custom)
                                    }}
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )
                })}

                {filteredTemplates.length === 0 && (
                  <div className="apv-empty">
                    <i className="fas fa-search"></i>
                    Không tìm thấy mẫu yêu cầu
                  </div>
                )}

                <button className="apv-fab" onClick={() => openTemplateForm()} title="Tạo mẫu đề xuất">
                  <i className="fas fa-plus"></i>
                </button>
              </div>
            ) : tab === 'stats' ? (
              <div className="apv-stats">
                <div className="apv-stats__toolbar">
                  <div className="apv-stats__periods">
                    {[
                      ['week', 'Tuần'],
                      ['month', 'Tháng'],
                      ['year', 'Năm']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`apv-stats__period ${statsPeriod === value ? 'active' : ''}`}
                        onClick={() => navigateApv({ period: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="apv-stats__date">
                    <span>Chọn mốc</span>
                    <input
                      type={statsPeriod === 'year' ? 'number' : 'date'}
                      min={statsPeriod === 'year' ? 2000 : undefined}
                      max={statsPeriod === 'year' ? 2100 : undefined}
                      value={
                        statsPeriod === 'year'
                          ? String(new Date(`${statsDateParam}T00:00:00`).getFullYear() || new Date().getFullYear())
                          : statsDateParam
                      }
                      onChange={(e) => {
                        if (statsPeriod === 'year') {
                          const year = Number(e.target.value) || new Date().getFullYear()
                          navigateApv({ date: `${year}-01-01` })
                        } else {
                          navigateApv({ date: e.target.value })
                        }
                      }}
                    />
                  </label>
                  <div className="apv-stats__label">{formatPeriodLabel(statsPeriod, statsDateParam)}</div>
                </div>

                <div className="apv-stats__summary">
                  <div className="apv-stats__card">
                    <strong>{statsSummary.employees}</strong>
                    <span>Nhân viên</span>
                  </div>
                  <div className="apv-stats__card">
                    <strong>{statsSummary.total}</strong>
                    <span>Tổng đề xuất</span>
                  </div>
                  <div className="apv-stats__card apv-stats__card--pending">
                    <strong>{statsSummary.pending}</strong>
                    <span>Chờ duyệt</span>
                  </div>
                  <div className="apv-stats__card apv-stats__card--approved">
                    <strong>{statsSummary.approved}</strong>
                    <span>Đã duyệt</span>
                  </div>
                  <div className="apv-stats__card apv-stats__card--rejected">
                    <strong>{statsSummary.rejected}</strong>
                    <span>Từ chối</span>
                  </div>
                  <div className="apv-stats__card apv-stats__card--leave-approved">
                    <strong>{statsSummary.paidLeaveApproved}</strong>
                    <span>Nghỉ phép được duyệt</span>
                  </div>
                  <div className="apv-stats__card apv-stats__card--leave-rejected">
                    <strong>{statsSummary.paidLeaveRejected}</strong>
                    <span>Nghỉ phép không duyệt</span>
                  </div>
                </div>

                <div className="apv-stats__table-wrap">
                  <table className="apv-stats__table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Mã NV</th>
                        <th>Họ và tên</th>
                        <th>Tổng</th>
                        <th>Chờ duyệt</th>
                        <th>Đã duyệt</th>
                        <th>Từ chối</th>
                        <th>Nghỉ phép duyệt</th>
                        <th>Nghỉ phép không duyệt</th>
                        <th>Theo loại mẫu</th>
                        <th>Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStats.length === 0 ? (
                        <tr>
                          <td colSpan="11" className="apv-stats__empty">Không có đề xuất trong kỳ này</td>
                        </tr>
                      ) : (
                        filteredStats.map((row, idx) => (
                          <tr key={row.employeeCode}>
                            <td>{idx + 1}</td>
                            <td><strong>{row.employeeCode}</strong></td>
                            <td>{row.employeeName}</td>
                            <td>{row.total}</td>
                            <td>{row.pending}</td>
                            <td>{row.approved}</td>
                            <td>{row.rejected}</td>
                            <td>{row.paidLeaveApproved}</td>
                            <td>{row.paidLeaveRejected}</td>
                            <td>
                              <div className="apv-stats__templates">
                                {Object.entries(row.byTemplate).map(([name, count]) => (
                                  <span key={name}>{name}: {count}</span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="apv-stats__detail-btn"
                                onClick={() => openStatsDetail(row.employeeCode)}
                              >
                                <i className="fas fa-list"></i> Xem chi tiết
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="apv-stats-mobile">
                  {filteredStats.length === 0 ? (
                    <div className="apv-stats__empty">Không có đề xuất trong kỳ này</div>
                  ) : (
                    filteredStats.map((row) => (
                      <button
                        type="button"
                        key={`mobile-${row.employeeCode}`}
                        className="apv-stats-mobile__card"
                        onClick={() => openStatsDetail(row.employeeCode)}
                      >
                        <div className="apv-stats-mobile__head">
                          <div>
                            <strong>{row.employeeName}</strong>
                            <span>{row.employeeCode}</span>
                          </div>
                          <i className="fas fa-chevron-right"></i>
                        </div>
                        <div className="apv-stats-mobile__numbers">
                          <span>Tổng <b>{row.total}</b></span>
                          <span>Chờ <b>{row.pending}</b></span>
                          <span>Duyệt <b>{row.approved}</b></span>
                          <span>Từ chối <b>{row.rejected}</b></span>
                        </div>
                        <div className="apv-stats-mobile__leave">
                          Nghỉ phép: <b>{row.paidLeaveApproved} duyệt</b>
                          {' · '}
                          <b>{row.paidLeaveRejected} không duyệt</b>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {statsDetailCode && (
                  <div className="apv-stats-detail-overlay" onClick={closeStatsDetail}>
                    <div className="apv-stats-detail-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="apv-stats-detail-panel__head">
                        <div>
                          <div className="apv-stats-detail-panel__title">
                            {statsDetailEmployee?.employeeName || '—'}
                          </div>
                          <div className="apv-stats-detail-panel__meta">
                            Mã NV: {statsDetailCode} • {formatPeriodLabel(statsPeriod, statsDateParam)} • {statsDetailRows.length} đề xuất
                          </div>
                        </div>
                        <button className="apv-stats-detail-panel__close" onClick={closeStatsDetail}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                      <div className="apv-stats-detail-panel__body">
                        {statsDetailRows.length === 0 ? (
                          <div className="apv-stats__empty">Không có đề xuất trong kỳ này</div>
                        ) : (
                          <table className="apv-stats__table">
                            <thead>
                              <tr>
                                <th>STT</th>
                                <th>Loại đề xuất</th>
                                <th>Về việc</th>
                                <th>Ngày giờ đề xuất</th>
                                <th>Trạng thái</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statsDetailRows.map((r, idx) => {
                                const badge = statusBadge(r.status)
                                return (
                                  <tr
                                    key={r.id}
                                    className="apv-stats-detail-row"
                                    onClick={() => {
                                      closeStatsDetail()
                                      openDetail(r.id)
                                    }}
                                  >
                                    <td data-label="STT">{idx + 1}</td>
                                    <td data-label="Loại đề xuất">{r.templateType || 'ĐỀ XUẤT'}</td>
                                    <td data-label="Về việc">{r.subject || '—'}</td>
                                    <td data-label="Ngày giờ đề xuất">{formatDateTime(r.createdAt)}</td>
                                    <td data-label="Trạng thái"><span className={`apv-badge ${badge.cls}`}>{badge.label}</span></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className="apv-chips">
              <button className={`apv-chip apv-chip--todo ${subFilter === 'todo' ? 'active' : ''}`} onClick={() => setSubFilterNav('todo')}>
                <i className="fas fa-inbox"></i> {tab === 'admin' || seesWholeInbox ? 'Đang xử lý' : 'Cần làm'} ({todoList.length})
              </button>
              <button className={`apv-chip apv-chip--done ${subFilter === 'done' ? 'active' : ''}`} onClick={() => setSubFilterNav('done')}>
                <i className="fas fa-check-circle"></i> {tab === 'admin' || seesWholeInbox ? 'Đã xong' : 'Hoàn thành'} ({doneList.length})
              </button>
            </div>

            {subFilter === 'done' && activeList.length > 0 && (
              <div className="apv-done-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={activeList.every((request) => selectedDoneIds.has(request.id))}
                    onChange={(event) => toggleAllDone(event.target.checked, activeList.map((request) => request.id))}
                  />
                  Chọn tất cả
                </label>
                <button
                  type="button"
                  className="apv-btn apv-btn--reject apv-btn--sm"
                  disabled={deletingDone || !activeList.some((request) => selectedDoneIds.has(request.id))}
                  onClick={() => deleteSelectedDone(activeList.filter((request) => selectedDoneIds.has(request.id)).map((request) => request.id))}
                >
                  {deletingDone ? 'Đang xóa...' : `Xóa đã chọn (${activeList.filter((request) => selectedDoneIds.has(request.id)).length})`}
                </button>
              </div>
            )}

            <div className="apv-list">
              {!me && tab !== 'admin' ? (
                <div className="apv-empty">
                  <i className="fas fa-user"></i>
                  Hãy cho biết bạn là ai để xem yêu cầu của mình
                  <div style={{ marginTop: 14 }}>
                    <button className="apv-btn apv-btn--primary" style={{ padding: '10px 20px' }} onClick={() => setShowMePicker(true)}>
                      Chọn nhân sự
                    </button>
                  </div>
                </div>
              ) : activeList.length === 0 ? (
                <div className="apv-empty">
                  <i className="fas fa-inbox"></i>
                  Không có yêu cầu nào
                </div>
              ) : (
                activeList.map((r) => {
                  const badge = statusBadge(r.status)
                  const attachmentCount = (r.attachments || []).length
                  const leaveDates = listRequestLeaveDates(r)
                  const decidedSteps = (r.approvalSteps || []).filter((step) => step.decidedAt)
                  const lastDecision = decidedSteps[decidedSteps.length - 1]
                  const waitingName = (r.approvalSteps || [])[r.currentStepIndex || 0]?.approverName
                  return (
                    <article
                      key={r.id}
                      className="apv-card"
                      onClick={() => openDetail(r.id)}
                    >
                      <div className="apv-card__top">
                        {subFilter === 'done' && (
                          <input
                            type="checkbox"
                            className="apv-card__check"
                            checked={selectedDoneIds.has(r.id)}
                            aria-label={`Chọn đề xuất ${r.code || r.subject || ''}`}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleDoneSelection(r.id)}
                          />
                        )}
                        <div className="apv-card__identity">
                          <span className="apv-card__type">{r.templateType || 'ĐỀ XUẤT'}</span>
                          <span className="apv-card__code">#{r.code}</span>
                        </div>
                        <span className={`apv-badge ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <h3 className="apv-card__subject">{r.subject || 'Chưa có tiêu đề'}</h3>
                      {r.content && <p className="apv-card__preview">{r.content}</p>}
                      <div className="apv-card__meta">
                        {attachmentCount > 0 && (
                          <span className="apv-card__chip"><i className="fas fa-paperclip"></i> {attachmentCount} tệp</span>
                        )}
                        {leaveDates.length > 0 && (
                          <span className="apv-card__chip">
                            <i className="fas fa-calendar-day"></i>
                            {formatDateShort(r.leaveStartDate)}
                            {r.leaveEndDate !== r.leaveStartDate ? ` – ${formatDateShort(r.leaveEndDate)}` : ''}
                            {' · '}
                            {r.leaveDuration === 'half' ? '0,5 công' : '1 công'}
                          </span>
                        )}
                        {r.quotaLimit > 0 && (
                          <span className="apv-card__chip">
                            Còn {r.quotaRemainingAfter ?? '—'}/{r.quotaLimit} lần/{APPROVAL_PERIOD_LABELS[r.quotaPeriod] || 'kỳ'}
                          </span>
                        )}
                        {(tab === 'admin' || seesWholeInbox) && r.status === 'pending' && (
                          <span className="apv-card__chip">Chờ {waitingName || 'người duyệt'}</span>
                        )}
                      </div>
                      {lastDecision && (
                        <p className={`apv-card__decision ${lastDecision.decision === 'rejected' ? 'is-rejected' : 'is-approved'}`}>
                          {lastDecision.decision === 'rejected' ? 'Từ chối' : 'Đã duyệt'} bởi {lastDecision.decidedByName || lastDecision.approverName}
                          {' · '}
                          {formatDateTime(lastDecision.decidedAt)}
                        </p>
                      )}
                      <div className="apv-card__footer">
                        <Avatar name={r.requesterName} avatar={r.requesterAvatar} />
                        <span className="apv-card__footer-name">{r.requesterName}</span>
                        <span className="apv-card__footer-date">{formatDateShort(r.createdAt)}</span>
                      </div>
                      {(tab === 'inbox' || tab === 'admin') && canDecideRequest(r) && (
                        <div className="apv-card__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="apv-btn apv-btn--approve apv-btn--sm"
                            disabled={deciding}
                            onClick={() => handleDecision('approved', '', r)}
                          >
                            <i className="fas fa-check"></i> Duyệt
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })
              )}
            </div>

            {tab === 'sent' && (
              <button className="apv-fab" onClick={() => openCreate()} title="Tạo yêu cầu">
                <i className="fas fa-plus"></i>
              </button>
            )}
              </>
            )}
          </>
        )}

        {toast && <div className="apv-toast">{toast}</div>}

        {rejectPrompt && selectedRequest && (
          <BottomSheet title="Lý do từ chối" onClose={() => setRejectPrompt(false)}>
            <textarea
              placeholder="Nhập lý do từ chối (không bắt buộc)"
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
            />
            <div className="apv-reject-modal__actions">
              <button className="apv-btn" style={{ background: '#f1f3f5', color: '#344054' }} onClick={() => setRejectPrompt(false)}>
                Hủy
              </button>
              <button
                className="apv-btn apv-btn--reject"
                style={{ border: '1px solid #dc3545' }}
                disabled={deciding}
                onClick={() => handleDecision('rejected', decisionComment)}
              >
                Xác nhận từ chối
              </button>
            </div>
          </BottomSheet>
        )}
      </div>
    </div>
  )
}

export default Approvals
