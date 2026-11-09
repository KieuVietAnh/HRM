import { useEffect, useRef, useState } from 'react'
import EmployeeDirectory from '../components/EmployeeDirectory'
import EmployeeImportPreview from '../components/EmployeeImportPreview'
import { expandAttendanceMergedCells } from '../utils/attendanceImport'
import { prepareEmployeeImportSheet, planEmployeeSheetImport } from '../utils/employeeImport'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCompanyIdForUser } from '../utils/companyContext'
import StatusFilterOptions from '../components/StatusFilterOptions'
import { asIdentityText, composeEmploymentFields, formatDateDisplay, getEmployeeEmploymentStatus, getEmployeeStage, getEmployeeWorkState, matchesEmployeeStatusFilter, mapAppToUser, mapUserToApp, parseFlexibleDate, runUsersMutationWithSchemaFallback } from '../utils/helpers'
import { fetchUsersDirectory } from '../services/employeeDirectory'
import { fbGet, fbListCollectionIds, fbSet } from '../services/firebase'
import { aggregateEmployeeActivity, matchesEmployeeStat } from '../utils/employeeDirectoryStats'
import { employeeContractKey, withEmployeeContract } from '../utils/employeeContracts'

const loadXlsx = () => import('xlsx')

// Thứ tự cột theo mẫu nhân sự của công ty.
// TRẠNG THÁI = Đang làm việc / Tạm nghỉ / Nghỉ việc; TÌNH TRẠNG = Thử việc / Chính thức.
const EMPLOYEE_EXCEL_HEADERS = [
    'STT',
    'Mã NV',
    'CHI NHÁNH',
    'TRẠNG THÁI',
    'HỌ TÊN',
    'GIỚI TÍNH',
    'NGÀY SINH',
    'VỊ TRÍ',
    'CA LÀM',
    'TEAM',
    'TÌNH TRẠNG',
    'NGÀY VÀO LÀM',
    'NGÀY LÊN CHÍNH THỨC',
    'NOTED',
    'CƠ CHẾ LƯƠNG',
    'TỔNG LƯƠNG',
    'SĐT',
    'SỐ CCCD',
    'NGÀY CẤP',
    'EMAIL CÁ NHÂN',
    'BỘ PHẬN',
    'LOẠI HỢP ĐỒNG',
    'NGÀY HẾT HẠN HỢP ĐỒNG',
    'NƠI CẤP CCCD',
    'ĐỊA CHỈ THƯỜNG TRÚ',
    'ĐỊA CHỈ TẠM TRÚ',
    'TÌNH TRẠNG HÔN NHÂN',
]

/** Cột giữ dạng Text trên Excel (không bỏ số 0 đầu). */
const EMPLOYEE_EXCEL_TEXT_HEADERS = new Set(['SĐT', 'SỐ CCCD', 'SỐ TK'])

const PHONE_IMPORT_HEADERS = new Set(['sdt', 'so_dien_thoai', 'dien_thoai', 'phone'])
const CCCD_IMPORT_HEADERS = new Set(['so_cccd', 'cccd', 'cmnd'])
const BANK_ACCOUNT_IMPORT_HEADERS = new Set(['so_tk', 'so_tai_khoan', 'stk', 'bank_account_number'])

/** Ép ô SĐT/CCCD thành text (@) để Excel không tự bỏ số 0 đầu. */
const applyIdentityTextColumns = (XLSX, ws, headers) => {
    if (!ws?.['!ref']) return
    const textCols = headers
        .map((header, index) => (EMPLOYEE_EXCEL_TEXT_HEADERS.has(header) ? index : -1))
        .filter((index) => index >= 0)
    if (!textCols.length) return
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (const c of textCols) {
        for (let r = range.s.r; r <= range.e.r; r++) {
            const addr = XLSX.utils.encode_cell({ r, c })
            const cell = ws[addr]
            if (!cell) {
                if (r === range.s.r) continue
                ws[addr] = { t: 's', v: '', z: '@' }
                continue
            }
            const text = cell.v == null || cell.v === '' ? '' : String(cell.v)
            ws[addr] = { t: 's', v: text, z: '@' }
        }
    }
}

function Employees() {
    const { user } = useAuth()
    const companyId = getCompanyIdForUser(user)
    const [employees, setEmployees] = useState([])
    const [filteredEmployees, setFilteredEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterBranch, setFilterBranch] = useState('')
    const [filterDept, setFilterDept] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [filterBirthMonth, setFilterBirthMonth] = useState('')
    const [filterContract, setFilterContract] = useState('')
    const [filterShift, setFilterShift] = useState('')
    const [statFilter, setStatFilter] = useState('')
    const [activityByEmployee, setActivityByEmployee] = useState({})
    const [activityLoading, setActivityLoading] = useState(true)
    const [activityError, setActivityError] = useState('')
    const [contractError, setContractError] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState(null)
    const [isReadOnly, setIsReadOnly] = useState(false)
    const fileInputRef = useRef(null)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [employeeImportPreview, setEmployeeImportPreview] = useState(null)
    const employeeImportInProgress = useRef(false)

    // Tab State
    const [activeTab, setActiveTab] = useState('list') // 'list' or 'history'

    useEffect(() => {
        loadEmployees()
    }, [companyId])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setActivityLoading(true)
            setActivityError('')
            setActivityByEmployee({})
            try {
                const year = String(new Date().getFullYear())
                const months = (await fbListCollectionIds('attendanceMonthSummaries', companyId))
                    .filter(value => value.startsWith(`${year}-`))
                const snapshots = await Promise.all(months.map(value =>
                    fbGet(`hr/attendanceMonthSummaries/${value}`, companyId)
                ))
                if (!cancelled) setActivityByEmployee(aggregateEmployeeActivity(snapshots))
            } catch (error) {
                console.error('Không tải được thống kê chấm công cho hồ sơ nhân sự:', error)
                if (!cancelled) setActivityError('Không tải được thống kê đi muộn và nghỉ phép từ Bảng công.')
            } finally {
                if (!cancelled) setActivityLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [companyId])

    useEffect(() => {
        filterEmployees()
    }, [employees, searchTerm, filterBranch, filterDept, filterStatus, filterBirthMonth, filterContract, filterShift, statFilter, activityByEmployee, activeTab])

    const handleSelectStat = key => {
        setSearchTerm('')
        setFilterBranch('')
        setFilterDept('')
        setFilterStatus('')
        setFilterBirthMonth('')
        setFilterContract('')
        setFilterShift('')
        setStatFilter(key === 'all' ? '' : key)
        setActiveTab(key === 'expiring' ? 'expiring' : 'list')
    }

    const loadEmployees = async () => {
        try {
            setLoading(true)
            const data = await fetchUsersDirectory(companyId)
            let contracts = {}
            try {
                contracts = await fbGet('hr/employeeContracts') || {}
                setContractError('')
            } catch (error) {
                console.error('Không tải được hợp đồng nhân viên:', error)
                setContractError('Không tải được thông tin hợp đồng.')
            }
            setEmployees((data || []).map(u => withEmployeeContract(mapUserToApp(u), contracts, companyId)))
            setLoading(false)
        } catch (err) {
            console.error("Error loading employees:", err)
            setEmployees([])
            setLoading(false)
        }
    }

    const resolveEmployee = async (employee) => {
        if (!employee?.id) return employee
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', employee.id)
            .maybeSingle()
        if (error || !data) return employee
        return {
            ...mapUserToApp(data),
            loai_hop_dong: employee.loai_hop_dong || '',
            ngay_het_han: employee.ngay_het_han || ''
        }
    }

    const filterEmployees = () => {
        let filtered = employees.filter(item => {
            if (!item) return false

            // Mặc định ẩn NV nghỉ việc; chỉ hiện khi chọn lọc "Nghỉ việc"
            if (!filterStatus && getEmployeeWorkState(item) === 'Nghỉ việc') return false

            const nameField = item.ho_va_ten || item.name || item.Tên || ""
            const shiftName = String(item.ca_lam_viec || item.shift || '').trim()
            const matchSearch = !searchTerm ||
                nameField.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.email && item.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (item.sđt && String(item.sđt || '').includes(searchTerm)) ||
                (item.sdt && String(item.sdt || '').includes(searchTerm)) ||
                (item.employeeId && String(item.employeeId).toLowerCase().includes(searchTerm.toLowerCase())) ||
                shiftName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.team && String(item.team).toLowerCase().includes(searchTerm.toLowerCase()))

            const matchBranch = !filterBranch
                || (filterBranch === '__none__' ? !item.chi_nhanh : item.chi_nhanh === filterBranch)
            const matchDept = !filterDept
                || (filterDept === '__none__' ? !item.bo_phan : item.bo_phan === filterDept)
            const matchStatus = matchesEmployeeStatusFilter(item, filterStatus)
            const contractType = item.loai_hop_dong || item.contractType || ''
            const matchContract = !filterContract || contractType === filterContract
            const matchShift = !filterShift
                || (filterShift === '__none__' ? !shiftName : shiftName === filterShift)

            const matchStat = !statFilter || matchesEmployeeStat(item, statFilter, activityByEmployee)

            // Filter Birth Month
            let matchMonth = true
            if (filterBirthMonth) {
                const dob = item.ngay_sinh || item.dob || ''
                if (!dob) {
                    matchMonth = false
                } else {
                    let month = -1
                    // Handle YYYY-MM-DD
                    if (dob.includes('-')) {
                        const parts = dob.split('-')
                        if (parts.length === 3) {
                            // usually YYYY-MM-DD, month is parts[1]
                            month = parseInt(parts[1], 10)
                        }
                    }
                    // Handle DD/MM/YYYY
                    else if (dob.includes('/')) {
                        const parts = dob.split('/')
                        if (parts.length === 3) {
                            // usually DD/MM/YYYY, month is parts[1]
                            month = parseInt(parts[1], 10)
                        }
                    }

                    matchMonth = month === parseInt(filterBirthMonth, 10)
                }
            }

            return matchSearch && matchBranch && matchDept && matchStatus && matchMonth && matchContract && matchShift && matchStat
        })

        setFilteredEmployees(filtered)
    }

    const handleResetFilters = async () => {
        setStatFilter('')
        setActiveTab('list')
        setSearchTerm('')
        setFilterBranch('')
        setFilterDept('')
        setFilterStatus('')
        setFilterBirthMonth('')
        setFilterContract('')
        setFilterShift('')
        await loadEmployees()
    }

    const handleResetData = async ({ clearAttendance = false } = {}) => {
        const { data: allUsers, error: fetchErr } = await supabase
            .from('users')
            .select('id, employee_id, username, email, role')

        if (fetchErr) throw fetchErr

        const currentUserId = user?.id

        const usersToDelete = (allUsers || []).filter(u => {
            const email = String(u.email || '').toLowerCase()
            const empId = String(u.employee_id || '').toUpperCase()
            const role = String(u.role || '').toLowerCase()
            const username = String(u.username || '').toLowerCase()

            const isCurrentAuthUser = currentUserId && u.id === currentUserId
            const isAdmin = role === 'admin' || empId === 'ADMIN' || username === 'admin' || email.includes('admin@')

            return !isCurrentAuthUser && !isAdmin
        })

        if (usersToDelete.length === 0) {
            alert('Không có dữ liệu nhân viên nào cần xóa (chỉ còn tài khoản Quản trị viên).')
            return
        }

        const idsToDelete = usersToDelete.map(u => u.id)
        const batchSize = 50
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
            const batch = idsToDelete.slice(i, i + batchSize)
            const { error: delErr } = await supabase
                .from('users')
                .delete()
                .in('id', batch)

            if (delErr) {
                console.error('Lỗi khi xóa batch users:', delErr)
                throw delErr
            }
        }

        if (clearAttendance) {
            try {
                await supabase
                    .from('hr_records')
                    .delete()
                    .in('collection', ['attendanceLogs', 'attendanceMonthSummaries', 'attendanceMonthConfirmations'])
            } catch (attErr) {
                console.warn('Lỗi khi xóa dữ liệu chấm công kèm theo:', attErr)
            }
        }

        await loadEmployees()
        alert(`Đã xóa thành công ${idsToDelete.length} nhân viên. Tài khoản Quản trị viên đã được bảo vệ an toàn!`)
    }

    const handleDelete = async (id, name) => {
        if (!confirm(`Bạn có chắc muốn xóa nhân viên "${name}"?\n\nHành động này không thể hoàn tác!`)) {
            return
        }

        try {
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', id)

            if (error) throw error

            setEmployees(prev => prev.filter(item => item.id !== id))
            alert(`Đã xóa nhân viên "${name}"`)
        } catch (error) {
            alert(`Lỗi: ${error.message}`)
        }
    }

    const downloadTemplate = async () => {
        const XLSX = await loadXlsx()
        // Dòng mẫu dùng chuỗi SĐT/CCCD có số 0 đầu để cột được lưu dạng Text.
        const sampleRow = EMPLOYEE_EXCEL_HEADERS.map((header) => {
            if (header === 'SĐT') return '0912345678'
            if (header === 'SỐ CCCD') return '001234567890'
            if (header === 'SỐ TK') return '0123456789'
            return ''
        })
        const ws = XLSX.utils.aoa_to_sheet([EMPLOYEE_EXCEL_HEADERS, sampleRow])
        applyIdentityTextColumns(XLSX, ws, EMPLOYEE_EXCEL_HEADERS)
        ws['!cols'] = EMPLOYEE_EXCEL_HEADERS.map((h) => ({ wch: Math.max(16, h.length + 4) }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Nhan_su')
        XLSX.writeFile(wb, 'Mau_import_nhan_su.xlsx')
    }

    const dateCell = (value) => {
        const text = formatDateDisplay(value)
        return text === '-' ? '' : text
    }

    const employeeToExcelRow = (emp, idx) => ([
        idx + 1,
        emp.employeeId || '',
        emp.chi_nhanh || '',
        getEmployeeWorkState(emp),
        emp.ho_va_ten || emp.name || emp.Tên || '',
        emp.gioi_tinh || '',
        dateCell(emp.ngay_sinh || emp.dob),
        emp.vi_tri || '',
        emp.ca_lam_viec || '',
        emp.team || '',
        getEmployeeStage(emp),
        dateCell(emp.ngay_vao_lam),
        dateCell(emp.ngay_lam_chinh_thuc),
        emp.ghi_chu || emp.notes || '',
        emp.co_che_luong || '',
        emp.tong_luong || '',
        asIdentityText(emp.sđt ?? emp.sdt, 'phone'),
        asIdentityText(emp.cccd, 'cccd'),
        dateCell(emp.ngay_cap),
        emp.email || '',
        emp.bo_phan || '',
        emp.loai_hop_dong || '',
        dateCell(emp.ngay_het_han),
        emp.noi_cap || '',
        emp.dia_chi_thuong_tru || emp.address || '',
        emp.dia_chi_tam_tru || '',
        emp.tinh_trang_hon_nhan || '',
    ])

    const exportToExcel = async () => {
        if (filteredEmployees.length === 0) {
            alert('Không có dữ liệu để xuất!')
            return
        }

        const XLSX = await loadXlsx()
        const rows = [
            EMPLOYEE_EXCEL_HEADERS,
            ...filteredEmployees.map((emp, idx) => employeeToExcelRow(emp, idx)),
        ]
        const ws = XLSX.utils.aoa_to_sheet(rows)
        applyIdentityTextColumns(XLSX, ws, EMPLOYEE_EXCEL_HEADERS)
        ws['!cols'] = EMPLOYEE_EXCEL_HEADERS.map((h) => ({ wch: Math.max(16, h.length + 4) }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Nhan_su')
        const dateStr = new Date().toISOString().split('T')[0]
        XLSX.writeFile(wb, `Danh_sach_nhan_su_${dateStr}.xlsx`)
    }

    // Convert Google Drive link to direct image URL
    const convertDriveLink = (url) => {
        if (!url) return ''
        const urlStr = String(url).trim()

        // Check if it's a Google Drive link
        if (urlStr.includes('drive.google.com')) {
            // Extract file ID from various Drive URL formats
            let fileId = ''

            // Format: https://drive.google.com/file/d/FILE_ID/view
            const match1 = urlStr.match(/\/file\/d\/([^\/]+)/)
            if (match1) {
                fileId = match1[1]
            }

            // Format: https://drive.google.com/open?id=FILE_ID
            const match2 = urlStr.match(/[?\&]id=([^\&]+)/)
            if (match2) {
                fileId = match2[1]
            }

            // Format: https://drive.google.com/uc?id=FILE_ID
            const match3 = urlStr.match(/\/uc\?.*id=([^\&]+)/)
            if (match3) {
                fileId = match3[1]
            }

            if (fileId) {
                // Use thumbnail endpoint - works better with CORS
                const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`
                console.log('🔄 Converted Drive link:', urlStr, '→', directUrl)
                console.log('   ℹ️ Alternative format: https://drive.google.com/uc?export=view&id=' + fileId)
                return directUrl
            } else {
                console.warn('⚠️ Could not extract file ID from Drive link:', urlStr)
            }
        }

        // If it's already a direct image URL (imgur, etc), return as is
        if (urlStr) {
            console.log('✅ Using direct URL:', urlStr)
        }
        return urlStr
    }

    const handleImportExcel = async (event) => {
        const file = event.target.files?.[0]
        if (!file || employeeImportInProgress.current) return
        event.target.value = ''
        setEmployeeImportPreview(null)
        setLoading(true)
        try {
            const XLSX = await loadXlsx()
            const readWorkbook = async () => {
                const bytes = new Uint8Array(await file.arrayBuffer())
                const sniff = new TextDecoder('utf-8').decode(bytes.slice(0, 512))
                const fileName = (file.name || '').toLowerCase()
                const looksHtml = /<html|<table|xmlns:x="urn:schemas-microsoft-com:office:excel"/i.test(sniff)
                const looksCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt')

                if (looksHtml || looksCsv) {
                    return XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', raw: false })
                }

                try {
                    return XLSX.read(bytes, { type: 'array', cellDates: false, raw: false })
                } catch {
                    return XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', raw: false })
                }
            }

            const workbook = await readWorkbook()
            const sheets = (workbook.SheetNames || []).map((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName]
                // Preserve blank separators and expand merged metadata headers.
                const rows = expandAttendanceMergedCells(
                    XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, defval: '', blankrows: true, raw: true }),
                    worksheet['!merges'] || []
                )
                return prepareEmployeeImportSheet({
                    sheetName, rows, hidden: workbook.Workbook?.Sheets?.[index]?.Hidden
                })
            }).filter(sheet => sheet && (sheet.employeeCount > 0 || sheet.errors.length > 0))
            if (!sheets.length) throw new Error('Không tìm thấy sheet có cột Họ tên và danh sách nhân viên.')
            setEmployeeImportPreview({
                fileName: file.name, sheets,
                selectedSheetName: sheets.length === 1 && !sheets[0].hidden ? sheets[0].sheetName : ''
            })
        } catch (error) {
            alert('Không đọc được file nhân sự: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const confirmEmployeeImport = async () => {
        if (employeeImportInProgress.current) return
        const selectedSheet = employeeImportPreview?.sheets.find(
            sheet => sheet.sheetName === employeeImportPreview.selectedSheetName
        )
        if (!selectedSheet || !selectedSheet.employeeCount || selectedSheet.errors.length) return
        employeeImportInProgress.current = true
        setLoading(true)
        try {
            const XLSX = await loadXlsx()
            // Re-check the authoritative directory at confirmation, not only the old page state.
            const currentEmployees = (await fetchUsersDirectory(companyId)).map(mapUserToApp)
            const plan = planEmployeeSheetImport(selectedSheet, currentEmployees, companyId)
            if (plan.errors.length) {
                alert(plan.errors.join('\n'))
                return
            }
            const headers = selectedSheet.headers
            const dataRows = plan.records.map(record => record.row)

            const isValidDate = (dateStr) => !dateStr || Boolean(parseFlexibleDate(dateStr))

            const DATE_HEADERS = new Set([
                'ngay_thang_nam_sinh', 'ngay_sinh', 'dob', 'birth_date',
                'ngay_vao_lam', 'ngay_bat_dau', 'ngay_len_chinh_thuc',
                'ngay_chinh_thuc', 'ngay_lam_chinh_thuc', 'ngay_cap'
            ])

            const formatDateValue = (cell) => {
                if (cell == null || cell === '') return ''
                if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
                    const dd = String(cell.getDate()).padStart(2, '0')
                    const mm = String(cell.getMonth() + 1).padStart(2, '0')
                    return `${dd}/${mm}/${cell.getFullYear()}`
                }
                if (typeof cell === 'number' && cell > 20000 && cell < 80000) {
                    const parsed = XLSX.SSF?.parse_date_code?.(cell)
                    if (parsed?.y && parsed?.m && parsed?.d) {
                        const dd = String(parsed.d).padStart(2, '0')
                        const mm = String(parsed.m).padStart(2, '0')
                        return `${dd}/${mm}/${parsed.y}`
                    }
                }
                return String(cell).trim()
            }

            const formatCell = (cell, header = '') => {
                if (cell == null || cell === '') return ''
                if (DATE_HEADERS.has(header) || header.startsWith('ngay_')) {
                    return formatDateValue(cell)
                }
                if (PHONE_IMPORT_HEADERS.has(header)) {
                    return asIdentityText(cell, 'phone')
                }
                if (CCCD_IMPORT_HEADERS.has(header)) {
                    return asIdentityText(cell, 'cccd')
                }
                if (BANK_ACCOUNT_IMPORT_HEADERS.has(header)) {
                    return asIdentityText(cell, 'generic')
                }
                if (typeof cell === 'number') {
                    return Number.isInteger(cell) || Math.abs(cell - Math.round(cell)) < 1e-9
                        ? String(Math.round(cell))
                        : String(cell)
                }
                return String(cell).trim()
            }

            const pick = (rowObj, ...keys) => {
                for (const key of keys) {
                    const value = rowObj[key]
                    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
                }
                return ''
            }

            const normalizeCode = (value) => String(value || '').trim().replace(/\s+/g, '').toLowerCase()
            const describeDbError = (error) => {
                const msg = error?.message || error?.code || ''
                if (/users_employee_id_unique|employee_id/i.test(msg)) return 'Mã NV đã có trên hệ thống'
                if (/users_username_unique|username/i.test(msg)) return 'Tên đăng nhập trùng (không phải mã NV)'
                if (/users_email_unique|email/i.test(msg)) return 'Email đã tồn tại'
                return msg
            }

            const saveImportedContract = async (employeeDbId, row) => {
                if (!row.loai_hop_dong && !row.ngay_het_han) return
                try {
                    await fbSet(`hr/employeeContracts/${employeeContractKey(companyId, employeeDbId)}`, {
                        contractType: row.loai_hop_dong || '',
                        contractEndDate: parseFlexibleDate(row.ngay_het_han) || ''
                    })
                } catch (contractError) {
                    console.error('Không lưu được hợp đồng khi import:', contractError)
                    errors.push({ row: 0, name: row.ho_va_ten, reason: 'Đã lưu hồ sơ nhưng chưa lưu được loại hợp đồng/ngày hết hạn' })
                }
            }

            const existingByCode = new Map()
            currentEmployees.forEach((emp) => {
                const code = normalizeCode(emp.employeeId)
                if (code && emp.id) existingByCode.set(code, emp)
            })

            let imported = 0
            let updated = 0
            let skipped = 0
            let keptExisting = 0
            const errors = []
            const seenImportKeys = new Map()

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i]
                const rowIndex = plan.records[i].rowIndex + 1
                if (plan.records[i].action === 'existing') {
                    keptExisting++
                    continue
                }

                const rowObj = {}
                headers.forEach((h, idx) => {
                    if (!h) return
                    rowObj[h] = formatCell(row[idx], h)
                })

                const payload = {
                    employeeId: pick(rowObj, 'ma_nhan_vien', 'ma_nv', 'employee_id'),
                    ho_va_ten: pick(rowObj, 'ho_va_ten', 'ho_ten', 'ten_nhan_vien', 'ten', 'name'),
                    email: pick(rowObj, 'email_ca_nhan', 'email'),
                    sđt: pick(rowObj, 'sdt', 'so_dien_thoai', 'dien_thoai', 'phone'),
                    username: pick(rowObj, 'ten_dang_nhap', 'username', 'user_name'),
                    role: pick(rowObj, 'vai_tro', 'role') || 'user',
                    password: pick(rowObj, 'mat_khau', 'password'),
                    chi_nhanh: pick(rowObj, 'chi_nhanh', 'branch'),
                    // File mẫu mới có cả cột TEAM lẫn BỘ PHẬN; chỉ lấy TEAM làm bộ phận cho file cũ không có cột bộ phận.
                    bo_phan: pick(rowObj, 'bo_phan', 'phong_ban', 'department') || (headers.some(h => ['bo_phan', 'phong_ban', 'department'].includes(h)) ? '' : pick(rowObj, 'team')),
                    team: pick(rowObj, 'team'),
                    vi_tri: pick(rowObj, 'vi_tri', 'chuc_vu', 'position'),
                    ...composeEmploymentFields({
                        workState: pick(rowObj, 'trang_thai', 'status'),
                        stage: pick(rowObj, 'tinh_trang')
                    }),
                    tinh_trang_hon_nhan: pick(rowObj, 'tinh_trang_hon_nhan', 'hon_nhan'),
                    ngay_sinh: pick(rowObj, 'ngay_thang_nam_sinh', 'ngay_sinh', 'dob', 'birth_date'),
                    ngay_vao_lam: pick(rowObj, 'ngay_vao_lam', 'ngay_bat_dau', 'ngay_nhan_viec'),
                    ngay_lam_chinh_thuc: pick(rowObj, 'ngay_len_chinh_thuc', 'ngay_chinh_thuc', 'ngay_lam_chinh_thuc'),
                    ca_lam_viec: pick(rowObj, 'ca_lam', 'ca_lam_viec', 'ca', 'shift'),
                    cccd: pick(rowObj, 'so_cccd', 'cccd', 'cmnd'),
                    ngay_cap: pick(rowObj, 'ngay_cap'),
                    noi_cap: pick(rowObj, 'noi_cap', 'noi_cap_cccd'),
                    dia_chi_thuong_tru: pick(rowObj, 'dia_chi_thuong_tru', 'thuong_tru', 'dia_chi', 'address'),
                    dia_chi_tam_tru: pick(rowObj, 'dia_chi_tam_tru', 'tam_tru'),
                    loai_hop_dong: pick(rowObj, 'loai_hop_dong'),
                    ngay_het_han: pick(rowObj, 'ngay_het_han_hop_dong', 'ngay_het_han', 'ngay_het_han_hd'),
                    que_quan: pick(rowObj, 'que_quan'),
                    gioi_tinh: pick(rowObj, 'gioi_tinh', 'gender'),
                    ngan_hang: pick(rowObj, 'ngan_hang', 'bank_name', 'bank'),
                    so_tk: pick(rowObj, 'so_tk', 'so_tai_khoan', 'stk', 'bank_account_number'),
                    ten_tai_khoan: pick(rowObj, 'ten_tai_khoan', 'bank_account_name', 'chu_tai_khoan'),
                    ghi_chu: pick(rowObj, 'noted', 'note', 'ghi_chu', 'notes'),
                    co_che_luong: pick(rowObj, 'co_che_luong'),
                    tong_luong: pick(rowObj, 'tong_luong'),
                    avatarUrl: convertDriveLink(pick(rowObj, 'link_anh', 'avatar', 'anh', 'hinh_anh', 'image'))
                }

                if (!payload.ho_va_ten) {
                    continue
                }

                // Bảng chấm công thường lặp lại một nhân viên theo từng ngày.
                // Chỉ tạo hồ sơ một lần, đồng thời báo rõ mã có nhiều tên khác nhau.
                const codeKey = normalizeCode(payload.employeeId)
                const importKey = selectedSheet.isMonthlyMatrix
                    ? `${normalizeCode(payload.ho_va_ten)}::${normalizeCode(payload.bo_phan)}`
                    : codeKey || normalizeCode(payload.ho_va_ten)
                const previousName = seenImportKeys.get(importKey)
                if (previousName) {
                    if (normalizeCode(previousName) !== normalizeCode(payload.ho_va_ten)) {
                        errors.push({
                            row: rowIndex,
                            name: payload.ho_va_ten,
                            reason: `Mã NV ${payload.employeeId || '(trống)'} xuất hiện với tên khác (${previousName}); giữ hồ sơ đầu tiên`
                        })
                    }
                    skipped++
                    continue
                }
                seenImportKeys.set(importKey, payload.ho_va_ten)

                const rowErrors = []

                if (!isValidDate(payload.ngay_sinh)) rowErrors.push(`Ngày sinh không hợp lệ: "${payload.ngay_sinh}" (cần dd/mm/yyyy)`)
                if (!isValidDate(payload.ngay_vao_lam)) rowErrors.push(`Ngày vào làm không hợp lệ: "${payload.ngay_vao_lam}" (cần dd/mm/yyyy)`)
                if (!isValidDate(payload.ngay_lam_chinh_thuc)) rowErrors.push(`Ngày chính thức không hợp lệ: "${payload.ngay_lam_chinh_thuc}" (cần dd/mm/yyyy)`)
                if (!isValidDate(payload.ngay_het_han)) rowErrors.push(`Ngày hết hạn hợp đồng không hợp lệ: "${payload.ngay_het_han}" (cần dd/mm/yyyy)`)
                if (!isValidDate(payload.ngay_cap)) rowErrors.push(`Ngày cấp CCCD không hợp lệ: "${payload.ngay_cap}" (cần dd/mm/yyyy)`)

                if (rowErrors.length > 0) {
                    errors.push({
                        row: rowIndex,
                        name: payload.ho_va_ten || 'Không tên',
                        reason: rowErrors.join(', ')
                    })
                    skipped++
                    continue
                }

                const dbPayload = { ...mapAppToUser(payload) }
                const existing = codeKey ? existingByCode.get(codeKey) : null
                // Không ghi đè trạng thái hiện có bằng giá trị rỗng khi file không có cột trạng thái/tình trạng.
                if (existing?.id && !payload.trang_thai && !payload.tinh_trang) {
                    delete dbPayload.employment_status
                    delete dbPayload.status
                }

                let mutationResult
                if (existing?.id) {
                    mutationResult = await runUsersMutationWithSchemaFallback(
                        (payloadToSave) => supabase.from('users').update(payloadToSave).eq('id', existing.id),
                        dbPayload
                    )
                } else {
                    dbPayload.id = crypto.randomUUID()
                    dbPayload.password = payload.password || '123456'
                    if (!dbPayload.username) {
                        dbPayload.username = payload.employeeId || (selectedSheet.isMonthlyMatrix
                            ? `nv_${dbPayload.id.replace(/-/g, '')}`
                            : `nv${String(rowIndex).padStart(4, '0')}`)
                    }
                    mutationResult = await runUsersMutationWithSchemaFallback(
                        (payloadToInsert) => supabase.from('users').insert([payloadToInsert]),
                        dbPayload
                    )
                }

                const { error } = mutationResult

                if (error) {
                    const finalError = error
                    console.error('❌ Import error for:', payload.ho_va_ten, finalError)
                    errors.push({
                        row: rowIndex,
                        name: payload.ho_va_ten,
                        reason: describeDbError(finalError)
                    })
                    skipped++
                } else if (existing?.id) {
                    updated++
                    await saveImportedContract(existing.id, payload)
                } else {
                    imported++
                    await saveImportedContract(dbPayload.id, payload)
                    if (codeKey) {
                        existingByCode.set(codeKey, { id: dbPayload.id, employeeId: payload.employeeId })
                    }
                }
            }

            await loadEmployees()
            setEmployeeImportPreview(null)

            let message = `Sheet ${selectedSheet.sheetName}: đã thêm mới ${imported} nhân viên`
            if (updated) message += `, cập nhật ${updated} nhân viên đã có mã NV`
            if (keptExisting) message += `, giữ nguyên ${keptExisting} hồ sơ đã có`
            message += '.'
            if (skipped > 0) {
                message += `\nCó ${skipped} dòng bị lỗi/bỏ qua:\n\n`
                const showErrors = errors.slice(0, 10)
                showErrors.forEach(err => {
                    message += `• Dòng ${err.row} (${err.name}): ${err.reason}\n`
                })
                if (errors.length > 10) {
                    message += `... và ${errors.length - 10} dòng khác.`
                }
            }

            alert(message)
        } catch (error) {
            console.error('❌ Import error:', error)
            alert('Lỗi import: ' + error.message)
        } finally {
            employeeImportInProgress.current = false
            setLoading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }



    const isActiveEmployee = (e) => getEmployeeEmploymentStatus(e) !== 'Nghỉ việc'
    const activeEmployees = employees.filter(isActiveEmployee)

    // Employees scoped by selected branch (for department tabs)
    const employeesInBranch = activeEmployees.filter(e => {
        if (!filterBranch) return true
        if (filterBranch === '__none__') return !e.chi_nhanh
        return e.chi_nhanh === filterBranch
    })

    const branches = [...new Set(activeEmployees.map(e => e.chi_nhanh).filter(Boolean))].sort()
    const noBranchCount = activeEmployees.filter(e => !e.chi_nhanh).length

    const departments = [...new Set(employeesInBranch.map(e => e.bo_phan).filter(Boolean))].sort()
    const noDeptCount = employeesInBranch.filter(e => !e.bo_phan).length

    const getBranchCount = (branch) => {
        if (branch === '') return activeEmployees.length
        if (branch === '__none__') return noBranchCount
        return activeEmployees.filter(e => e.chi_nhanh === branch).length
    }

    const getDeptCount = (dept) => {
        if (dept === '') return employeesInBranch.length
        if (dept === '__none__') return noDeptCount
        return employeesInBranch.filter(e => e.bo_phan === dept).length
    }

    // Group filtered list by department
    const groupedEmployees = (() => {
        const groups = new Map()
        filteredEmployees.forEach(emp => {
            const key = emp.bo_phan || 'Chưa phân bộ phận'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(emp)
        })

        const sortedKeys = [...groups.keys()].sort((a, b) => {
            if (a === 'Chưa phân bộ phận') return 1
            if (b === 'Chưa phân bộ phận') return -1
            return a.localeCompare(b, 'vi')
        })

        return sortedKeys.map(key => ({
            dept: key,
            items: groups.get(key)
        }))
    })()

    const openView = (emp) => {
        setSelectedEmployee(emp)
        setIsReadOnly(true)
        setIsModalOpen(true)
    }

    const openEdit = (emp) => {
        setSelectedEmployee(emp)
        setIsReadOnly(false)
        setIsModalOpen(true)
    }

    const renderCard = (emp, idx) => {
        const name = emp.ho_va_ten || emp.name || emp.Tên || 'N/A'
        const avatar = emp.avatarDataUrl || emp.avatarUrl || emp.avatar || ''
        const status = getEmployeeEmploymentStatus(emp)
        return (
            <article key={emp.id || idx} className="employee-photo-card">
                <div className="employee-photo-card__media">
                    {avatar ? (
                        <img
                            src={avatar}
                            alt={name}
                            onError={(e) => {
                                e.target.style.display = 'none'
                                const placeholder = e.target.nextSibling
                                if (placeholder) placeholder.style.display = 'flex'
                            }}
                        />
                    ) : null}
                    <div
                        className="employee-photo-card__placeholder"
                        style={{ display: avatar ? 'none' : 'flex' }}
                    >
                        <i className="fas fa-user"></i>
                    </div>
                    {status && (
                        <span className="employee-photo-card__status">{status}</span>
                    )}
                </div>
                <div className="employee-photo-card__body">
                    <h3 className="employee-photo-card__name">{name}</h3>
                    <p className="employee-photo-card__meta">
                        {emp.employeeId ? emp.employeeId : `#${idx + 1}`}
                    </p>
                    <div className="employee-photo-card__actions">
                        <div className="actions">
                            <button className="view" title="Xem" onClick={() => openView(emp)}>
                                <i className="fas fa-eye"></i>
                            </button>
                            <button className="edit" title="Sửa" onClick={() => openEdit(emp)}>
                                <i className="fas fa-edit"></i>
                            </button>
                            <button className="delete" title="Xóa" onClick={() => handleDelete(emp.id, name)}>
                                <i className="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        )
    }

    const renderListRow = (emp, idx) => {
        const name = emp.ho_va_ten || emp.name || emp.Tên || 'N/A'
        const avatar = emp.avatarDataUrl || emp.avatarUrl || emp.avatar || ''
        const status = getEmployeeEmploymentStatus(emp)
        return (
            <div key={emp.id || idx} className="employee-list-row">
                <div className="employee-list-row__photo">
                    {avatar ? (
                        <img
                            src={avatar}
                            alt={name}
                            onError={(e) => {
                                e.target.style.display = 'none'
                                const placeholder = e.target.nextSibling
                                if (placeholder) placeholder.style.display = 'flex'
                            }}
                        />
                    ) : null}
                    <div
                        className="employee-photo-card__placeholder"
                        style={{ display: avatar ? 'none' : 'flex' }}
                    >
                        <i className="fas fa-user"></i>
                    </div>
                </div>
                <div className="employee-list-row__info">
                    <h3 className="employee-list-row__name">{name}</h3>
                    <div className="employee-list-row__meta">
                        <span>{emp.employeeId || `#${idx + 1}`}</span>
                        <span>Sinh: {formatDateDisplay(emp.ngay_sinh || emp.dob) || '—'}</span>
                        <span>Chính thức: {formatDateDisplay(emp.ngay_lam_chinh_thuc) || '—'}</span>
                    </div>
                </div>
                {status && (
                    <span className="employee-list-row__status">{status}</span>
                )}
                <div className="employee-list-row__actions">
                    <div className="actions">
                        <button className="view" title="Xem" onClick={() => openView(emp)}>
                            <i className="fas fa-eye"></i>
                        </button>
                        <button className="edit" title="Sửa" onClick={() => openEdit(emp)}>
                            <i className="fas fa-edit"></i>
                        </button>
                        <button className="delete" title="Xóa" onClick={() => handleDelete(emp.id, name)}>
                            <i className="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const handleSelectBranch = (branch) => {
        setFilterBranch(branch)
        setFilterDept('')
    }

    const tabBtnStyle = (active) => ({
        padding: '8px 14px',
        border: '1px solid',
        borderColor: active ? 'var(--primary)' : '#ddd',
        borderRadius: '6px',
        background: active ? 'var(--primary)' : '#fff',
        color: active ? '#fff' : '#444',
        cursor: 'pointer',
        fontWeight: active ? 600 : 500,
        fontSize: '0.9rem'
    })

    if (loading) {
        return <div className="loadingState">Đang tải dữ liệu...</div>
    }

    return <><EmployeeDirectory
        companyId={companyId}
        employees={employees}
        filteredEmployees={filteredEmployees}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterBranch={filterBranch}
        setFilterBranch={setFilterBranch}
        filterDept={filterDept}
        setFilterDept={setFilterDept}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterContract={filterContract}
        setFilterContract={setFilterContract}
        filterShift={filterShift}
        setFilterShift={setFilterShift}
        statFilter={statFilter}
        onSelectStat={handleSelectStat}
        onClearStat={() => setStatFilter('')}
        activityByEmployee={activityByEmployee}
        activityLoading={activityLoading}
        activityError={activityError}
        contractError={contractError}
        selectedEmployee={selectedEmployee}
        setSelectedEmployee={setSelectedEmployee}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isReadOnly={isReadOnly}
        setIsReadOnly={setIsReadOnly}
        onReload={loadEmployees}
        onExport={exportToExcel}
        onDownloadTemplate={downloadTemplate}
        onImport={handleImportExcel}
        onDelete={handleDelete}
        onResolveEmployee={resolveEmployee}
        onResetData={handleResetData}
        onResetFilters={handleResetFilters}
        adminEmail={user?.email || 'admin@company.local'}
    />
        <EmployeeImportPreview
            preview={employeeImportPreview}
            employees={employees}
            companyId={companyId}
            busy={loading}
            onSelectSheet={selectedSheetName => setEmployeeImportPreview(previous => ({ ...previous, selectedSheetName }))}
            onClose={() => { if (!employeeImportInProgress.current) setEmployeeImportPreview(null) }}
            onConfirm={confirmEmployeeImport}
        />
    </>

    /*
    return (
        <div>
            <div className="page-header" style={{ marginBottom: '10px' }}>
                <h1 className="page-title">
                    <i className="fas fa-users"></i>
                    Hồ sơ nhân sự
                </h1>
                {activeTab === 'list' && (
                    <div>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setSelectedEmployee(null)
                                setIsModalOpen(true)
                            }}
                            style={{ marginRight: '10px' }}
                        >
                            <i className="fas fa-plus"></i>
                            Tạo mới NV
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setIsImportModalOpen(true)}
                            style={{ marginRight: '10px' }}
                        >
                            <i className="fas fa-file-upload"></i>
                            Upload Excel
                        </button>


                        <button
                            className="btn btn-info"
                            onClick={downloadTemplate}
                            style={{
                                marginRight: '10px',
                                color: '#fff',
                                background: '#17a2b8',
                                borderColor: '#17a2b8'
                            }}
                        >
                            <i className="fas fa-download"></i>
                            Tải file mẫu
                        </button>
                        <button
                            className="btn btn-success"
                            onClick={exportToExcel}
                            style={{
                                marginRight: '10px',
                                background: '#28a745',
                                borderColor: '#28a745',
                                color: '#fff'
                            }}
                        >
                            <i className="fas fa-file-excel"></i>
                            Xuất Excel
                        </button>
                        <button className="btn btn-primary" onClick={loadEmployees}>
                            <i className="fas fa-sync"></i>
                            Làm mới
                        </button>
                    </div>
                )}
            </div>

            <div className="main-tabs" style={{
                borderBottom: '1px solid #ddd',
                marginBottom: '20px',
                display: 'flex',
                gap: '5px'
            }}>
                <button
                    onClick={() => setActiveTab('list')}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: activeTab === 'list' ? '#fff' : '#f8f9fa',
                        borderBottom: activeTab === 'list' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: activeTab === 'list' ? '600' : '500',
                        color: activeTab === 'list' ? 'var(--primary)' : '#666',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    <i className="fas fa-list" style={{ marginRight: '8px' }}></i>
                    Danh sách nhân viên
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: activeTab === 'history' ? '#fff' : '#f8f9fa',
                        borderBottom: activeTab === 'history' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: activeTab === 'history' ? '600' : '500',
                        color: activeTab === 'history' ? 'var(--primary)' : '#666',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    <i className="fas fa-history" style={{ marginRight: '8px' }}></i>
                    Biến động trạng thái
                </button>
            </div>

            {activeTab === 'list' ? (
                <>
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>
                            Chi nhánh
                        </div>
                        <div className="branch-tabs" style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            marginBottom: '12px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid #eee'
                        }}>
                            <button
                                type="button"
                                onClick={() => handleSelectBranch('')}
                                style={tabBtnStyle(filterBranch === '')}
                            >
                                Tất cả
                                <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                    ({getBranchCount('')})
                                </span>
                            </button>
                            {branches.map(branch => (
                                <button
                                    key={branch}
                                    type="button"
                                    onClick={() => handleSelectBranch(branch)}
                                    style={tabBtnStyle(filterBranch === branch)}
                                >
                                    {branch}
                                    <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                        ({getBranchCount(branch)})
                                    </span>
                                </button>
                            ))}
                            {noBranchCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleSelectBranch('__none__')}
                                    style={tabBtnStyle(filterBranch === '__none__')}
                                >
                                    Chưa có chi nhánh
                                    <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                        ({noBranchCount})
                                    </span>
                                </button>
                            )}
                        </div>

                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>
                            Bộ phận{filterBranch && filterBranch !== '__none__' ? ` · ${filterBranch}` : ''}
                        </div>
                        <div className="dept-tabs" style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            paddingBottom: '4px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setFilterDept('')}
                                style={tabBtnStyle(filterDept === '')}
                            >
                                Tất cả
                                <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                    ({getDeptCount('')})
                                </span>
                            </button>
                            {departments.map(dept => (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => setFilterDept(dept)}
                                    style={tabBtnStyle(filterDept === dept)}
                                >
                                    {dept}
                                    <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                        ({getDeptCount(dept)})
                                    </span>
                                </button>
                            ))}
                            {noDeptCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setFilterDept('__none__')}
                                    style={tabBtnStyle(filterDept === '__none__')}
                                >
                                    Chưa phân bộ phận
                                    <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '0.8rem' }}>
                                        ({noDeptCount})
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="search-box" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Tìm theo Mã NV, Họ tên, SĐT, Email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <StatusFilterOptions />
                        </select>
                        <select value={filterBirthMonth} onChange={(e) => setFilterBirthMonth(e.target.value)}>
                            <option value="">Tất cả tháng sinh</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                                <option key={month} value={month}>Tháng {month}</option>
                            ))}
                        </select>
                        <div className="employee-view-toggle">
                            <button
                                type="button"
                                className={viewMode === 'cards' ? 'active' : ''}
                                onClick={() => setViewMode('cards')}
                                title="Dạng thẻ"
                            >
                                <i className="fas fa-th-large"></i>
                            </button>
                            <button
                                type="button"
                                className={viewMode === 'list' ? 'active' : ''}
                                onClick={() => setViewMode('list')}
                                title="Dạng list"
                            >
                                <i className="fas fa-list"></i>
                            </button>
                        </div>
                    </div>

                    {filteredEmployees.length === 0 ? (
                        <div className="employee-card-empty">
                            {activeEmployees.length === 0 ? 'Chưa có dữ liệu nhân sự' : 'Không tìm thấy kết quả'}
                        </div>
                    ) : (
                        <div className="employee-dept-groups">
                            {groupedEmployees.map(group => (
                                <section key={group.dept} className="employee-dept-group">
                                    <div className="employee-dept-group__header">
                                        <h3>
                                            <i className="fas fa-building"></i>
                                            {group.dept}
                                        </h3>
                                        <span>{group.items.length} nhân viên</span>
                                    </div>
                                    {viewMode === 'cards' ? (
                                        <div className="employee-card-grid">
                                            {group.items.map((emp, idx) => renderCard(emp, idx))}
                                        </div>
                                    ) : (
                                        <div className="employee-list">
                                            {group.items.map((emp, idx) => renderListRow(emp, idx))}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <StatusHistoryView employees={employees} onDataChange={() => { }} />
            )}

            <EmployeeModal
                employee={selectedEmployee}
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false)
                    setSelectedEmployee(null)
                    setIsReadOnly(false)
                }}
                onSave={loadEmployees}
                readOnly={isReadOnly}
                departmentOptions={[...new Set(employees.map(e => e.bo_phan).filter(Boolean))]}
                teamOptions={[...new Set(employees.map(e => e.team).filter(Boolean))]}
                positionOptions={[...new Set(employees.map(e => e.vi_tri).filter(Boolean))]}
            />

            {isImportModalOpen && (
                <div className="modal show" onClick={() => setIsImportModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                <i className="fas fa-file-upload"></i>
                                Upload Excel nhân sự
                            </h3>
                            <button className="modal-close" onClick={() => setIsImportModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Chọn tệp (.xlsx, .xls, .csv)</label>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    ref={fileInputRef}
                                    onChange={(e) => {
                                        handleImportExcel(e)
                                        setIsImportModalOpen(false)
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Lưu ý định dạng cột (theo thứ tự):</label>
                                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                    <li>STT, Mã NV, Chi nhánh, Trạng thái (Đang làm việc/Tạm nghỉ/Nghỉ việc), Họ tên</li>
                                    <li>Giới tính, Ngày sinh, Vị trí, Ca làm, TEAM</li>
                                    <li>Tình trạng (Thử việc/Chính thức), Ngày vào làm, Ngày lên chính thức, Noted</li>
                                    <li>Cơ chế lương, Tổng lương</li>
                                    <li>SĐT, Số CCCD (giữ số 0 đầu), Ngày cấp, Nơi cấp CCCD, Email cá nhân</li>
                                    <li>Bộ phận, Loại hợp đồng, Ngày hết hạn hợp đồng</li>
                                    <li>Địa chỉ thường trú, Địa chỉ tạm trú, Tình trạng hôn nhân</li>
                                </ul>
                                <small>Hàng đầu tiên là header. Tải mẫu Excel để đúng cột. CCCD/SĐT/Số TK nên để định dạng Text trên Excel.</small>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn" onClick={() => setIsImportModalOpen(false)}>Đóng</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
    */
}

export default Employees
