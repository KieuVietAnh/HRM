import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import CandidateModal from '../components/CandidateModal'
import RecruitmentPlanModal from '../components/RecruitmentPlanModal'
import { fbDelete, fbGet, fbPush, fbUpdate } from '../services/firebase'
import { asIdentityText } from '../utils/helpers'

function Recruitment() {
  const [plans, setPlans] = useState([])
  const [candidates, setCandidates] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  const [selectedPlan, setSelectedPlan] = useState(null)
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [isPlanReadOnly, setIsPlanReadOnly] = useState(false)

  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false)
  const [isCandidateReadOnly, setIsCandidateReadOnly] = useState(false)

  const [filterPosition, setFilterPosition] = useState('')

  // Excel Import/Export states for Candidates
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreviewData, setImportPreviewData] = useState([])
  const [isImporting, setIsImporting] = useState(false)

  // Excel Import/Export states for Recruitment Plans
  const [isPlanImportModalOpen, setIsPlanImportModalOpen] = useState(false)
  const [planImportFile, setPlanImportFile] = useState(null)
  const [planImportPreviewData, setPlanImportPreviewData] = useState([])
  const [isPlanImporting, setIsPlanImporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      const [empData, plansData, candidatesData] = await Promise.all([
        fbGet('employees'),
        fbGet('hr/recruitmentPlans'),
        fbGet('hr/candidates')
      ])

      // Process Employees
      let empList = []
      if (empData) {
        if (Array.isArray(empData)) {
          empList = empData.filter(item => item !== null && item !== undefined)
        } else if (typeof empData === 'object') {
          empList = Object.entries(empData)
            .filter(([k, v]) => v !== null && v !== undefined)
            .map(([k, v]) => ({ ...v, id: k }))
        }
      }
      setEmployees(empList)

      // Process Recruitment Plans
      const plans = plansData
        ? Object.entries(plansData)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
        : []

      // Process Candidates
      const candidates = candidatesData
        ? Object.entries(candidatesData)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
        : []

      setPlans(plans)
      setCandidates(candidates)
      setLoading(false)
    } catch (error) {
      console.error('Error loading recruitment data:', error)
      setLoading(false)
    }
  }

  const handleDeletePlan = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa nhu cầu tuyển dụng này?')) return
    try {
      await fbDelete(`hr/recruitmentPlans/${id}`)
      setPlans(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa nhu cầu tuyển dụng')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  const handleDeleteCandidate = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa CV này?')) return
    try {
      await fbDelete(`hr/candidates/${id}`)
      setCandidates(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa CV ứng viên')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  const handleConvertToEmployee = async (candidate) => {
    if (!candidate) return
    if (!confirm('Chuyển ứng viên này sang Nhân viên thử việc?')) return

    try {
      const payload = {
        ho_va_ten: candidate.ho_ten || candidate.name || '',
        email: candidate.email || '',
        sđt: asIdentityText(candidate.sdt || candidate.sđt, 'phone'),
        chi_nhanh: candidate.chi_nhanh || '',
        bo_phan: candidate.bo_phan || candidate.department || '',
        // Set vị trí hiển thị là Thử việc theo yêu cầu
        vi_tri: 'Thử việc',
        trang_thai: 'Thử việc',
        status: 'probation',
        ngay_vao_lam: new Date().toISOString().split('T')[0],
        cccd: asIdentityText(candidate.cccd, 'cccd'),
        ngay_cap: candidate.ngay_cap || '',
        noi_cap: candidate.noi_cap || '',
        que_quan: candidate.que_quan || '',
        gioi_tinh: candidate.gioi_tinh || '',
        tinh_trang_hon_nhan: candidate.tinh_trang_hon_nhan || '',
        avatarDataUrl: '',
        images: [],
        files: candidate.cv_files || []
      }

      const res = await fbPush('employees', payload)
      const newEmpId = res?.name || ''

      await fbUpdate(`hr/candidates/${candidate.id}`, {
        da_chuyen_sang_nv: true,
        linkedEmployeeId: newEmpId
      })

      // Log trạng thái
      await fbPush('hr/candidateStatusLogs', {
        candidateId: candidate.id,
        action: 'Chuyển sang nhân viên thử việc',
        newStatus: 'probation',
        createdAt: new Date().toISOString()
      })

      await loadData()
      alert('Đã chuyển ứng viên sang Nhân viên thử việc')
    } catch (error) {
      alert('Lỗi chuyển ứng viên: ' + error.message)
    }
  }

  // Export Recruitment Plans to Excel
  const exportPlansToExcel = () => {
    if (plans.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const headers = [
      'STT',
      'Bộ phận',
      'Vị trí',
      'Nhân sự hiện có',
      'Định biên',
      'Cần tuyển',
      'Ghi chú'
    ]

    const escapeCell = (val) => {
      return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    const rowsHtml = plans.map((plan, idx) => {
      const current = Number(plan.nhan_su_hien_co || 0)
      const target = Number(plan.dinh_bien || 0)
      const need = Math.max(target - current, 0)

      const cells = [
        idx + 1,
        plan.bo_phan || '',
        plan.vi_tri || '',
        current,
        target,
        need,
        plan.ghi_chu || ''
      ]
      const tds = cells.map(cell => `<td>${escapeCell(cell)}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')

    const headerHtml = headers.map(h => `<th>${escapeCell(h)}</th>`).join('')
    const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`

    const htmlContent = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head>
        <body>${tableHtml}</body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    const date = new Date()
    const dateStr = date.toISOString().split('T')[0]
    link.href = url
    link.download = `Dinh_bien_nhan_su_${dateStr}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Download Template for Recruitment Plans
  const downloadPlanTemplate = () => {
    const headers = [
      'STT',
      'Bộ phận',
      'Vị trí',
      'Nhân sự hiện có',
      'Định biên',
      'Cần tuyển',
      'Ghi chú'
    ]

    const sampleData = [
      [1, 'Kinh doanh', 'Nhân viên kinh doanh', 5, 10, 5, 'Tuyển gấp'],
      [2, 'Marketing', 'Content Writer', 2, 3, 1, '']
    ]

    const escapeCell = (val) => String(val || '').replace(/"/g, '&quot;')

    // Create Excel content manually to avoid library dependency for simple template
    const headerHtml = headers.map(h => `<th>${escapeCell(h)}</th>`).join('')
    const rowsHtml = sampleData.map(row => {
      const tds = row.map(cell => `<td>${escapeCell(cell)}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')

    const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`
    const htmlContent = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head>
        <body>${tableHtml}</body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'Mau_dinh_bien_nhan_su.xls'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle file selection for plan import
  const handlePlanFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPlanImportFile(file)
    setIsPlanImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File Excel không có dữ liệu')
        setIsPlanImporting(false)
        return
      }

      const headers = Array.from(jsonData[0] || []).map(h => String(h || '').toLowerCase().trim())

      // Find column indexes
      const boPhanIdx = headers.findIndex(h => h.includes('bộ phận'))
      const viTriIdx = headers.findIndex(h => h.includes('vị trí'))
      const nhanSuHienCoIdx = headers.findIndex(h => h.includes('hiện có'))
      const dinhBienIdx = headers.findIndex(h => h.includes('định biên'))
      const ghiChuIdx = headers.findIndex(h => h.includes('ghi chú'))

      // Validate required columns
      if (boPhanIdx === -1 || viTriIdx === -1 || dinhBienIdx === -1) {
        alert('File Excel cần có các cột: Bộ phận, Vị trí, Định biên')
        setIsPlanImporting(false)
        return
      }

      // Parse data rows
      const parsedData = []
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row[boPhanIdx] || !row[viTriIdx] || !row[dinhBienIdx]) continue

        parsedData.push({
          bo_phan: row[boPhanIdx] || '',
          vi_tri: row[viTriIdx] || '',
          nhan_su_hien_co: nhanSuHienCoIdx !== -1 ? (row[nhanSuHienCoIdx] || '0') : '0',
          dinh_bien: row[dinhBienIdx] || '0',
          ghi_chu: ghiChuIdx !== -1 ? (row[ghiChuIdx] || '') : ''
        })
      }

      setPlanImportPreviewData(parsedData)
      setIsPlanImporting(false)
    } catch (error) {
      alert('Lỗi khi đọc file: ' + error.message)
      setIsPlanImporting(false)
    }
  }

  // Confirm and import plan data to Firebase
  const handleConfirmPlanImport = async () => {
    if (planImportPreviewData.length === 0) {
      alert('Không có dữ liệu để import')
      return
    }

    setIsPlanImporting(true)
    try {
      let successCount = 0
      for (const plan of planImportPreviewData) {
        await fbPush('hr/recruitmentPlans', plan)
        successCount++
      }

      alert(`Đã import thành công ${successCount} định biên`)
      setIsPlanImportModalOpen(false)
      setPlanImportFile(null)
      setPlanImportPreviewData([])
      await loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsPlanImporting(false)
    }
  }

  // Export Candidates to Excel
  const exportCandidatesToExcel = () => {
    if (candidates.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const headers = [
      'STT',
      'Họ và tên',
      'Vị trí ứng tuyển',
      'Bộ phận',
      'Nguồn CV',
      'HR phụ trách',
      'SĐT',
      'Email',
      'Trạng thái hiện tại',
      'Ngày tiếp nhận',
      'CCCD',
      'Ngày cấp',
      'Nơi cấp',
      'Quê quán',
      'Giới tính',
      'Tình trạng hôn nhân'
    ]

    const escapeCell = (val) => {
      return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    const rowsHtml = candidates.map((c, idx) => {
      const cells = [
        idx + 1,
        c.ho_ten || c.name || '',
        c.vi_tri_ung_tuyen || c.vi_tri || '',
        c.bo_phan || '',
        c.nguon_cv || '',
        c.hr_phu_trach || '',
        asIdentityText(c.sdt || c.sđt, 'phone'),
        c.email || '',
        c.trang_thai || '',
        c.ngay_tiep_nhan || '',
        asIdentityText(c.cccd, 'cccd'),
        c.ngay_cap || '',
        c.noi_cap || '',
        c.que_quan || '',
        c.gioi_tinh || '',
        c.tinh_trang_hon_nhan || ''
      ]
      const tds = cells.map(cell => `<td>${escapeCell(cell)}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')

    const headerHtml = headers.map(h => `<th>${escapeCell(h)}</th>`).join('')
    const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`

    const htmlContent = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head>
        <body>${tableHtml}</body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    const date = new Date()
    const dateStr = date.toISOString().split('T')[0]
    link.href = url
    link.download = `Danh_sach_ung_vien_${dateStr}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Download Template for Candidates
  const downloadCandidateTemplate = () => {
    const headers = [
      'Họ và tên',
      'Vị trí ứng tuyển',
      'Bộ phận',
      'Nguồn CV',
      'HR phụ trách',
      'SĐT',
      'Email',
      'Trạng thái hiện tại',
      'Ngày tiếp nhận',
      'CCCD',
      'Ngày cấp',
      'Nơi cấp',
      'Quê quán',
      'Giới tính',
      'Tình trạng hôn nhân'
    ]

    const sampleData = [
      [
        'Nguyễn Văn A',
        'Lập trình viên',
        'Công nghệ',
        'TopCV',
        'HR Nguyễn A',
        '0901234567',
        'nguyenvana@example.com',
        'Phỏng vấn vòng 1',
        '2024-03-01',
        '001234567890',
        '2020-01-01',
        'CA TP.HCM',
        'TP.HCM',
        'Nam',
        'Độc thân'
      ]
    ]

    const escapeCell = (val) => String(val || '').replace(/"/g, '&quot;')

    const headerHtml = headers.map(h => `<th>${escapeCell(h)}</th>`).join('')
    const rowsHtml = sampleData.map(row => {
      const tds = row.map(cell => `<td>${escapeCell(cell)}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')

    const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`
    const htmlContent = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head>
        <body>${tableHtml}</body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'Mau_import_ung_vien.xls'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle file selection for import
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setImportFile(file)
    setIsImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File Excel không có dữ liệu')
        setIsImporting(false)
        return
      }

      const headers = Array.from(jsonData[0] || []).map(h => String(h || '').toLowerCase().trim())

      // Find column indexes
      const hoTenIdx = headers.findIndex(h => h.includes('họ và tên') || h.includes('họ tên') || h.includes('name'))
      const viTriIdx = headers.findIndex(h => h.includes('vị trí'))
      const emailIdx = headers.findIndex(h => h.includes('email'))
      const boPhanIdx = headers.findIndex(h => h.includes('bộ phận'))
      const nguonCvIdx = headers.findIndex(h => h.includes('nguồn cv'))
      const hrPhuTrachIdx = headers.findIndex(h => h.includes('hr phụ trách'))
      const sdtIdx = headers.findIndex(h => h.includes('sđt') || h.includes('số điện thoại') || h.includes('phone'))
      const trangThaiIdx = headers.findIndex(h => h.includes('trạng thái'))
      const ngayTiepNhanIdx = headers.findIndex(h => h.includes('ngày tiếp nhận'))
      const cccdIdx = headers.findIndex(h => h.includes('cccd'))
      const ngayCapIdx = headers.findIndex(h => h.includes('ngày cấp'))
      const noiCapIdx = headers.findIndex(h => h.includes('nơi cấp'))
      const queQuanIdx = headers.findIndex(h => h.includes('quê quán'))
      const gioiTinhIdx = headers.findIndex(h => h.includes('giới tính'))
      const honNhanIdx = headers.findIndex(h => h.includes('hôn nhân'))

      // Validate required columns
      if (hoTenIdx === -1 || viTriIdx === -1 || emailIdx === -1) {
        alert('File Excel cần có các cột: Họ và tên, Vị trí ứng tuyển, Email')
        setIsImporting(false)
        return
      }

      // Parse data rows
      const parsedData = []
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row[hoTenIdx] || !row[viTriIdx] || !row[emailIdx]) continue

        parsedData.push({
          ho_ten: row[hoTenIdx] || '',
          vi_tri_ung_tuyen: row[viTriIdx] || '',
          bo_phan: boPhanIdx !== -1 ? (row[boPhanIdx] || '') : '',
          nguon_cv: nguonCvIdx !== -1 ? (row[nguonCvIdx] || '') : '',
          hr_phu_trach: hrPhuTrachIdx !== -1 ? (row[hrPhuTrachIdx] || '') : '',
          sdt: sdtIdx !== -1 ? (row[sdtIdx] || '') : '',
          email: row[emailIdx] || '',
          trang_thai: trangThaiIdx !== -1 ? row[trangThaiIdx] || 'CV mới' : 'CV mới',
          ngay_tiep_nhan: ngayTiepNhanIdx !== -1 ? row[ngayTiepNhanIdx] || new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          cccd: cccdIdx !== -1 ? row[cccdIdx] || '' : '',
          ngay_cap: ngayCapIdx !== -1 ? row[ngayCapIdx] || '' : '',
          noi_cap: noiCapIdx !== -1 ? row[noiCapIdx] || '' : '',
          que_quan: queQuanIdx !== -1 ? row[queQuanIdx] || '' : '',
          gioi_tinh: gioiTinhIdx !== -1 ? row[gioiTinhIdx] || '' : '',
          tinh_trang_hon_nhan: honNhanIdx !== -1 ? row[honNhanIdx] || '' : ''
        })
      }

      setImportPreviewData(parsedData)
      setIsImporting(false)
    } catch (error) {
      alert('Lỗi khi đọc file: ' + error.message)
      setIsImporting(false)
    }
  }

  // Confirm and import data to Firebase
  const handleConfirmImport = async () => {
    if (importPreviewData.length === 0) {
      alert('Không có dữ liệu để import')
      return
    }

    setIsImporting(true)
    try {
      let successCount = 0
      for (const candidate of importPreviewData) {
        await fbPush('hr/candidates', candidate)
        successCount++
      }

      alert(`Đã import thành công ${successCount} ứng viên`)
      setIsImportModalOpen(false)
      setImportFile(null)
      setImportPreviewData([])
      await loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsImporting(false)
    }
  }

  const positions = [...new Set(candidates.map(c => c.vi_tri_ung_tuyen || c.vi_tri).filter(Boolean))].sort()

  const filteredCandidates = candidates.filter(c => {
    if (filterPosition && (c.vi_tri_ung_tuyen || c.vi_tri) !== filterPosition) return false
    return true
  })

  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-user-plus"></i>
          Tuyển dụng
        </h1>
      </div>

      {/* Bảng 1: Định biên nhân sự */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3 className="card-title">Định biên nhân sự</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-success"
              onClick={exportPlansToExcel}
              title="Xuất dữ liệu ra Excel"
            >
              <i className="fas fa-file-excel"></i>
              Xuất Excel
            </button>
            <button
              className="btn btn-info"
              onClick={downloadPlanTemplate}
              title="Tải file mẫu Excel"
              style={{ background: '#17a2b8', borderColor: '#17a2b8', color: '#fff' }}
            >
              <i className="fas fa-download"></i>
              Tải file mẫu
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsPlanImportModalOpen(true)}
              title="Import từ Excel"
            >
              <i className="fas fa-file-import"></i>
              Import từ Excel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedPlan(null)
                setIsPlanModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Tạo mới Nhu cầu tuyển dụng
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0', position: 'relative' }}>
          <table style={{ minWidth: '101%', marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ minWidth: '80px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                <th style={{ minWidth: '180px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí cần tuyển</th>
                <th style={{ minWidth: '140px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bậc năng lực</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Kinh nghiệm</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Số lượng</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Hiện có</th>
                <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Định biên</th>
                <th style={{ minWidth: '220px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mô tả / mục đích</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {plans.length > 0 ? (
                plans.map((plan, idx) => {
                  const current = Number(plan.nhan_su_hien_co || 0)
                  const target = Number(plan.dinh_bien || 0)
                  const need = Number(plan.so_luong || 0) || Math.max(target - current, 0)
                  return (
                    <tr key={plan.id || idx}>
                      <td>{idx + 1}</td>
                      <td>{plan.bo_phan || ''}</td>
                      <td>{plan.vi_tri || ''}</td>
                      <td>{plan.bac_nang_luc || ''}</td>
                      <td>{plan.so_nam_kinh_nghiem || ''}</td>
                      <td>{need}</td>
                      <td>{current}</td>
                      <td>{target}</td>
                      <td>{plan.mo_ta || plan.ghi_chu || ''}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="view"
                            title="Xem"
                            onClick={() => {
                              setSelectedPlan(plan)
                              setIsPlanReadOnly(true)
                              setIsPlanModalOpen(true)
                            }}
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            className="edit"
                            title="Sửa"
                            onClick={() => {
                              setSelectedPlan(plan)
                              setIsPlanReadOnly(false)
                              setIsPlanModalOpen(true)
                            }}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            className="delete"
                            title="Xóa"
                            onClick={() => handleDeletePlan(plan.id)}
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
                  <td colSpan="8" className="empty-state">
                    Chưa có định biên nhân sự
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng 2: Quản lý CV */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quản lý CV ứng viên</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '4px' }}
            >
              <option value="">Tất cả vị trí</option>
              {positions.map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
            <button
              className="btn btn-success"
              onClick={exportCandidatesToExcel}
              title="Xuất dữ liệu ra Excel"
            >
              <i className="fas fa-file-excel"></i>
              Xuất Excel
            </button>
            <button
              className="btn btn-info"
              onClick={downloadCandidateTemplate}
              title="Tải file mẫu Excel"
              style={{ background: '#17a2b8', borderColor: '#17a2b8', color: '#fff' }}
            >
              <i className="fas fa-download"></i>
              Tải file mẫu
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsImportModalOpen(true)}
              title="Import từ Excel"
            >
              <i className="fas fa-file-import"></i>
              Import từ Excel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedCandidate(null)
                setIsCandidateModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Tạo mới CV
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0', position: 'relative' }}>
          <table style={{ minWidth: '101%', marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ minWidth: '80px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Họ và tên</th>
                <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí ứng tuyển</th>
                <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Nguồn CV</th>
                <th style={{ minWidth: '180px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>HR phụ trách</th>
                <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>SĐT</th>
                <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Email</th>
                <th style={{ minWidth: '180px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Trạng thái hiện tại</th>
                <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ngày tiếp nhận</th>
                <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length > 0 ? (
                filteredCandidates.map((c, idx) => {
                  const status = c.trang_thai || ''
                  const showConvert =
                    status === 'CV trúng tuyển' && !c.da_chuyen_sang_nv

                  return (
                    <tr key={c.id || idx}>
                      <td>{idx + 1}</td>
                      <td>{c.ho_ten || c.name || ''}</td>
                      <td>{c.vi_tri_ung_tuyen || c.vi_tri || ''}</td>
                      <td>{c.bo_phan || ''}</td>
                      <td>{c.nguon_cv || ''}</td>
                      <td>{c.hr_phu_trach || ''}</td>
                      <td>{asIdentityText(c.sdt || c.sđt, 'phone')}</td>
                      <td>{c.email || ''}</td>
                      <td>{status}</td>
                      <td>{c.ngay_tiep_nhan ? new Date(c.ngay_tiep_nhan).toLocaleDateString('vi-VN') : ''}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="view"
                            title="Xem"
                            onClick={() => {
                              setSelectedCandidate(c)
                              setIsCandidateReadOnly(true)
                              setIsCandidateModalOpen(true)
                            }}
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            className="edit"
                            title="Sửa"
                            onClick={() => {
                              setSelectedCandidate(c)
                              setIsCandidateReadOnly(false)
                              setIsCandidateModalOpen(true)
                            }}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          {showConvert && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#28a745', color: '#fff', marginLeft: '4px' }}
                              onClick={() => handleConvertToEmployee(c)}
                              title="Chuyển sang Nhân viên thử việc"
                            >
                              + Chuyển sang Nhân viên thử việc
                            </button>
                          )}
                          <button
                            className="delete"
                            title="Xóa"
                            onClick={() => handleDeleteCandidate(c.id)}
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
                  <td colSpan="10" className="empty-state">
                    Chưa có CV ứng viên
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <RecruitmentPlanModal
        plan={selectedPlan}
        isOpen={isPlanModalOpen}
        onClose={() => {
          setIsPlanModalOpen(false)
          setSelectedPlan(null)
          setIsPlanReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isPlanReadOnly}
        departments={[...new Set(employees.map(e => e.bo_phan || e.department).filter(Boolean))].sort()}
        positions={[...new Set(employees.map(e => e.vi_tri || e.position).filter(Boolean))].sort()}
      />

      <CandidateModal
        candidate={selectedCandidate}
        isOpen={isCandidateModalOpen}
        onClose={() => {
          setIsCandidateModalOpen(false)
          setSelectedCandidate(null)
          setIsCandidateReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isCandidateReadOnly}
        employees={employees}
      />

      {/* Import Excel Modal for Candidates */}
      {isImportModalOpen && (
        <div className="modal show" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-file-import"></i>
                Import CV ứng viên từ Excel
              </h3>
              <button className="modal-close" onClick={() => setIsImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Chọn file Excel</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>

              <div style={{ marginTop: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px', fontSize: '0.9rem' }}>
                <strong>Lưu ý:</strong>
                <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                  <li>File Excel cần có các cột bắt buộc: <b>Họ và tên, Vị trí ứng tuyển, Email</b></li>
                  <li>Các cột khác: Bộ phận, Nguồn CV, SĐT, Trạng thái, Ngày tiếp nhận, CCCD, v.v.</li>
                  <li>Tải file Excel mẫu để xem định dạng chuẩn</li>
                </ul>
              </div>

              {importPreviewData.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4>Preview dữ liệu ({importPreviewData.length} ứng viên)</h4>
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5' }}>
                        <tr>
                          <th>STT</th>
                          <th>Họ tên</th>
                          <th>Vị trí</th>
                          <th>Bộ phận</th>
                          <th>HR phụ trách</th>
                          <th>Email</th>
                          <th>SĐT</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{item.ho_ten}</td>
                            <td>{item.vi_tri_ung_tuyen}</td>
                            <td>{item.bo_phan}</td>
                            <td>{item.hr_phu_trach}</td>
                            <td>{item.email}</td>
                            <td>{asIdentityText(item.sdt, 'phone')}</td>
                            <td>{item.trang_thai}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIsImportModalOpen(false)
                    setImportFile(null)
                    setImportPreviewData([])
                  }}
                  disabled={isImporting}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmImport}
                  disabled={isImporting || importPreviewData.length === 0}
                >
                  {isImporting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang import...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i> Xác nhận Import ({importPreviewData.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal for Recruitment Plans */}
      {isPlanImportModalOpen && (
        <div className="modal show" onClick={() => setIsPlanImportModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-file-import"></i>
                Import Định biên nhân sự từ Excel
              </h3>
              <button className="modal-close" onClick={() => setIsPlanImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Chọn file Excel</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handlePlanFileSelect}
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>

              <div style={{ marginTop: '15px', padding: '10px', background: '#f0f8ff', borderRadius: '4px', fontSize: '0.9rem' }}>
                <strong>Lưu ý:</strong>
                <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                  <li>File Excel cần có các cột bắt buộc: <b>Bộ phận, Vị trí, Định biên</b></li>
                  <li>Các cột khác: Nhân sự hiện có, Ghi chú</li>
                  <li>Tải file Excel mẫu để xem định dạng chuẩn</li>
                </ul>
              </div>

              {planImportPreviewData.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4>Preview dữ liệu ({planImportPreviewData.length} định biên)</h4>
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5' }}>
                        <tr>
                          <th>STT</th>
                          <th>Bộ phận</th>
                          <th>Vị trí</th>
                          <th>Nhân sự hiện có</th>
                          <th>Định biên</th>
                          <th>Cần tuyển</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planImportPreviewData.map((item, idx) => {
                          const current = Number(item.nhan_su_hien_co || 0)
                          const target = Number(item.dinh_bien || 0)
                          const need = Math.max(target - current, 0)
                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td>{item.bo_phan}</td>
                              <td>{item.vi_tri}</td>
                              <td>{current}</td>
                              <td>{target}</td>
                              <td>{need}</td>
                              <td>{item.ghi_chu}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIsPlanImportModalOpen(false)
                    setPlanImportFile(null)
                    setPlanImportPreviewData([])
                  }}
                  disabled={isPlanImporting}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmPlanImport}
                  disabled={isPlanImporting || planImportPreviewData.length === 0}
                >
                  {isPlanImporting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang import...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i> Xác nhận Import ({planImportPreviewData.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Recruitment


