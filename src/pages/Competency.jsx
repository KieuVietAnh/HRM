import { useEffect, useState } from 'react'


import CompetencyFrameworkModal from '../components/CompetencyFrameworkModal'
import EvaluationDetailModal from '../components/EvaluationDetailModal'
import SeedCompetencyDataButton from '../components/SeedCompetencyDataButton'
import TrainingParticipantModal from '../components/TrainingParticipantModal'
import TrainingProgramModal from '../components/TrainingProgramModal'
import { fbDelete, fbGet, fbPush, fbUpdate } from '../services/firebase'
import { normalizeString } from '../utils/helpers'

function Competency() {
  const [activeTab, setActiveTab] = useState('framework')
  const [competencyFramework, setCompetencyFramework] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [trainingPrograms, setTrainingPrograms] = useState([])
  const [trainingParticipants, setTrainingParticipants] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal states

  const [isEvaluationDetailModalOpen, setIsEvaluationDetailModalOpen] = useState(false)

  // Training Modal State
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false)
  const [selectedTraining, setSelectedTraining] = useState(null)

  // Participant Modal State
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false)
  const [participantInitialView, setParticipantInitialView] = useState('participants')
  const [isParticipantReadOnly, setIsParticipantReadOnly] = useState(false)


  // Selected items
  const [selectedFramework, setSelectedFramework] = useState(null)
  const [selectedEvaluation, setSelectedEvaluation] = useState(null)
  const [selectedEvaluationDetail, setSelectedEvaluationDetail] = useState(null)

  // Filters
  const [filterDept, setFilterDept] = useState('')
  const [filterEvaluationDept, setFilterEvaluationDept] = useState('')
  const [filterEvaluationPeriod, setFilterEvaluationPeriod] = useState('')
  const [filterTrainingProgram, setFilterTrainingProgram] = useState('')

  // Bảng 1: Nhập đánh giá state
  const [assessmentForm, setAssessmentForm] = useState({
    employeeId: '',
    employeeCode: '',
    position: '',
    department: '',
    period: '',
    evaluationDate: new Date().toISOString().split('T')[0],
    items: []
  })
  const [inputFilterDept, setInputFilterDept] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Excel Import/Export states for Competency Framework
  const [isFrameworkImportModalOpen, setIsFrameworkImportModalOpen] = useState(false)
  const [frameworkImportFile, setFrameworkImportFile] = useState(null)
  const [frameworkImportPreviewData, setFrameworkImportPreviewData] = useState([])
  const [isFrameworkImporting, setIsFrameworkImporting] = useState(false)

  // Excel Import/Export states for Evaluations
  const [isEvalImportModalOpen, setIsEvalImportModalOpen] = useState(false)
  const [evalImportFile, setEvalImportFile] = useState(null)
  const [evalImportPreviewData, setEvalImportPreviewData] = useState([])
  const [isEvalImporting, setIsEvalImporting] = useState(false)

  // Excel Import/Export states for Training
  const [isTrainingImportModalOpen, setIsTrainingImportModalOpen] = useState(false)
  const [trainingImportFile, setTrainingImportFile] = useState(null)
  const [trainingImportPreviewData, setTrainingImportPreviewData] = useState([])
  const [isTrainingImporting, setIsTrainingImporting] = useState(false)

  // Bảng 1: Khai báo khung năng lực state
  const [isFrameworkModalOpen, setIsFrameworkModalOpen] = useState(false)
  const [isFrameworkReadOnly, setIsFrameworkReadOnly] = useState(false)

  // Bảng 1: Khai báo khung năng lực state (Inline Form)
  const [frameworkForm, setFrameworkForm] = useState({
    id: null,
    department: '',
    position: '',
    group: 'Chuyên môn',
    name: '',
    level: 1,
    status: 'Áp dụng',
    note: ''
  })
  const [isFrameworkSaving, setIsFrameworkSaving] = useState(false)

  // Searchable Select State
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Framework Form Dropdown States
  const [showPositionDropdown, setShowPositionDropdown] = useState(false)
  const [showNameDropdown, setShowNameDropdown] = useState(false)

  // Sync search term with assessmentForm.employeeId
  useEffect(() => {
    if (assessmentForm.employeeId) {
      const emp = employees.find(e => e.id === assessmentForm.employeeId)
      if (emp) {
        setSearchTerm(emp.ho_va_ten || emp.name || '')
      }
    } else {
      setSearchTerm('')
    }
  }, [assessmentForm.employeeId, employees])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      console.time('LoadData')

      const [empData, frameworkData, evalsData, trainingsData, participantsData] = await Promise.all([
        fbGet('employees'),
        fbGet('hr/competencyFramework'),
        fbGet('hr/employee_competency_assessment'),
        fbGet('hr/trainings'),
        fbGet('hr/trainingParticipants')
      ])

      // Process Employees
      let empList = []
      if (empData) {
        if (Array.isArray(empData)) {
          empList = empData.filter(item => item !== null && item !== undefined)
        } else if (typeof empData === "object") {
          empList = Object.entries(empData)
            .filter(([k, v]) => v !== null && v !== undefined)
            .map(([k, v]) => ({ ...v, id: k }))
        }
      }
      setEmployees(empList)

      // Process Framework
      const framework = frameworkData ? Object.entries(frameworkData).map(([k, v]) => ({ ...v, id: k })) : []
      setCompetencyFramework(framework)

      // Process Evaluations
      const evals = evalsData ? Object.entries(evalsData).map(([k, v]) => ({ ...v, id: k })) : []
      setEvaluations(evals)

      // Process Trainings
      const trainings = trainingsData ? Object.entries(trainingsData).map(([k, v]) => ({ ...v, id: k })) : []
      setTrainingPrograms(trainings)

      // Process Participants
      const participants = participantsData ? Object.entries(participantsData).map(([k, v]) => ({ ...v, id: k })) : []
      setTrainingParticipants(participants)

      console.timeEnd('LoadData')
      setLoading(false)
    } catch (error) {
      console.error('Error loading competency data:', error)
      setLoading(false)
    }
  }

  const handleDeleteFramework = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa năng lực này?')) return
    try {
      await fbDelete(`hr/competencyFramework/${id}`)
      setCompetencyFramework(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa năng lực')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  const handleDeleteTraining = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa chương trình đào tạo này?')) return
    try {
      await fbDelete(`hr/trainings/${id}`)
      setTrainingPrograms(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa chương trình đào tạo')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  const handleDeleteParticipant = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa học viên này khỏi chương trình đào tạo?')) return
    try {
      await fbDelete(`hr/trainingParticipants/${id}`)
      setTrainingParticipants(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa học viên khỏi chương trình')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  // --- Competency Framework Excel Functions ---

  const exportFrameworkToExcel = () => {
    if (competencyFramework.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = competencyFramework.map((item, idx) => ({
      'STT': idx + 1,
      'Bộ phận': item.department || '',
      'Vị trí': item.position || '',
      'Nhóm năng lực': item.group || '',
      'Tên năng lực': item.name || '',
      'Level yêu cầu': item.level || 1,
      'Trạng thái': item.status || 'Áp dụng',
      'Ghi chú': item.note || ''
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Khung_nang_luc')
    XLSX.writeFile(wb, `KHNL_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const downloadFrameworkTemplate = () => {
    const data = [
      ['Bộ phận', 'Vị trí', 'Nhóm năng lực', 'Tên năng lực', 'Level yêu cầu (1-5)', 'Trạng thái (Áp dụng/Ngừng)', 'Ghi chú'],
      ['MKT', 'MKT 1', 'Chuyên môn', 'Lập kế hoạch & giám sát KPI', 3, 'Áp dụng', ''],
      ['Sale', 'Sale 1', 'Cá nhân', 'Giao tiếp thuyết phục', 2, 'Áp dụng', '']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_KHNL')
    XLSX.writeFile(wb, 'Mau_import_khung_nang_luc.xlsx')
  }

  const handleFrameworkFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setFrameworkImportFile(file)
    setIsFrameworkImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsFrameworkImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
      const requiredHeaders = [
        { key: 'bộ phận', label: 'Bộ phận' },
        { key: 'vị trí', label: 'Vị trí' },
        { key: 'tên năng lực', label: 'Tên năng lực' }
      ]

      const missingHeaders = requiredHeaders.filter(req => !headers.some(h => h.includes(req.key)))

      if (missingHeaders.length > 0) {
        alert(`File không đúng mẫu! Thiếu các cột: ${missingHeaders.map(m => m.label).join(', ')}.`)
        setIsFrameworkImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)
      const parsedData = []

      for (const row of dataRows) {
        const dept = String(row[headers.findIndex(h => h.includes('bộ phận'))] || '').trim()
        const pos = String(row[headers.findIndex(h => h.includes('vị trí'))] || '').trim()
        const group = String(row[headers.findIndex(h => h.includes('nhóm'))] || 'Chuyên môn').trim()
        const name = String(row[headers.findIndex(h => h.includes('tên năng lực'))] || '').trim()
        const levelRaw = row[headers.findIndex(h => h.includes('level'))]
        const status = String(row[headers.findIndex(h => h.includes('trạng thái'))] || 'Áp dụng').trim()
        const note = String(row[headers.findIndex(h => h.includes('ghi chú'))] || '').trim()

        if (!dept || !pos || !name) continue

        const level = parseInt(levelRaw) || 1

        parsedData.push({
          department: dept,
          position: pos,
          group,
          name,
          level,
          status: status.includes('Ngừng') ? 'Ngừng' : 'Áp dụng',
          note,
          isValid: true,
          note_val: ''
        })
      }

      setFrameworkImportPreviewData(parsedData)
      setIsFrameworkImporting(false)
    } catch (error) {
      alert('Lỗi đọc file: ' + error.message)
      setIsFrameworkImporting(false)
    }
  }

  const handleConfirmFrameworkImport = async () => {
    const validData = frameworkImportPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ để import')
      return
    }

    if (!confirm(`Xác nhận import ${validData.length} năng lực vào khung đào tạo?`)) return

    setIsFrameworkImporting(true)
    try {
      for (const item of validData) {
        const { isValid, note_val, ...payload } = item
        await fbPush('hr/competencyFramework', payload)
      }
      alert('Import thành công!')
      setIsFrameworkImportModalOpen(false)
      setFrameworkImportPreviewData([])
      loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsFrameworkImporting(false)
    }
  }

  // --- Evaluation Excel Functions ---

  const exportEvaluationsToExcel = () => {
    if (evaluations.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = []
    evaluations.forEach(evalItem => {
      const emp = employees.find(e => e.id === evalItem.employeeId)
      const empName = emp ? (emp.ho_va_ten || emp.name) : (evalItem.employeeName || 'N/A')

      evalItem.items?.forEach(item => {
        exportData.push({
          'Kỳ đánh giá': evalItem.period || '',
          'Mã NV': evalItem.employeeCode || evalItem.employeeId || '',
          'Họ tên': empName,
          'Bộ phận': evalItem.department || '',
          'Vị trí': evalItem.position || '',
          'Ngày đánh giá': evalItem.evaluationDate || '',
          'Nhóm NL': item.group || '',
          'Tên năng lực': item.competencyName || '',
          'Level yêu cầu': item.requiredLevel || 0,
          'Level đạt được': item.achievedLevel || 0,
          'Chênh lệch': item.difference || 0,
          'Nhận xét': item.comment || ''
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ket_qua_danh_gia')
    XLSX.writeFile(wb, `KQ_DanhGia_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const downloadEvalTemplate = () => {
    const data = [
      ['Mã nhân viên', 'Kỳ đánh giá (YYYY-MM)', 'Ngày đánh giá (YYYY-MM-DD)', 'Tên năng lực', 'Level đạt được (1-5)', 'Nhận xét'],
      ['NV001', '2024-10', '2024-10-25', 'Lập kế hoạch & giám sát KPI', 4, 'Làm tốt'],
      ['NV001', '2024-10', '2024-10-25', 'Giao tiếp thuyết phục', 3, 'Cần cố gắng']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_KQDG')
    XLSX.writeFile(wb, 'Mau_import_ket_qua_danh_gia.xlsx')
  }

  const handleEvalFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setEvalImportFile(file)
    setIsEvalImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsEvalImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
      const requiredFields = [
        { key: 'mã nhân viên', label: 'Mã nhân viên' },
        { key: 'kỳ đánh giá', label: 'Kỳ đánh giá' },
        { key: 'tên năng lực', label: 'Tên năng lực' },
        { key: 'level đạt được', label: 'Level đạt được' }
      ]

      const missing = requiredFields.filter(f => !headers.some(h => h.includes(f.key)))
      if (missing.length > 0) {
        alert(`Thiếu các cột: ${missing.map(m => m.label).join(', ')}`)
        setIsEvalImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)
      const items = []

      for (const row of dataRows) {
        const empId = String(row[headers.findIndex(h => h.includes('mã nhân viên'))] || '').trim()
        const period = String(row[headers.findIndex(h => h.includes('kỳ đánh giá'))] || '').trim()
        const dateRaw = row[headers.findIndex(h => h.includes('ngày đánh giá'))]
        const compName = String(row[headers.findIndex(h => h.includes('tên năng lực'))] || '').trim()
        const levelRaw = row[headers.findIndex(h => h.includes('level đạt được'))]
        const comment = String(row[headers.findIndex(h => h.includes('nhận xét'))] || '').trim()

        if (!empId || !period || !compName) continue

        const emp = employees.find(e => e.id === empId || e.employeeCode === empId || e.ma_nhan_vien === empId)
        const frameworkItem = competencyFramework.find(f =>
          f.name.toLowerCase().trim() === compName.toLowerCase().trim() &&
          (emp ? (f.position === (emp.vi_tri || emp.position)) : true)
        )

        let note = ''
        if (!emp) note += 'NV không tồn tại. '
        if (!frameworkItem) note += 'NL không thuộc vị trí này. '

        items.push({
          empId: emp ? emp.id : empId,
          empName: emp ? (emp.ho_va_ten || emp.name) : 'Unknown',
          period,
          evaluationDate: dateRaw ? String(dateRaw) : new Date().toISOString().split('T')[0],
          competencyId: frameworkItem ? frameworkItem.id : null,
          competencyName: compName,
          group: frameworkItem ? frameworkItem.group : 'Unknown',
          requiredLevel: frameworkItem ? frameworkItem.level : 0,
          achievedLevel: parseInt(levelRaw) || 0,
          comment,
          isValid: emp && frameworkItem,
          note
        })
      }

      // Group by empId and period
      const grouped = items.reduce((acc, current) => {
        const key = `${current.empId}_${current.period}`
        if (!acc[key]) {
          acc[key] = {
            id: key,
            employeeId: current.empId,
            employeeCode: current.empId,
            employeeName: current.empName,
            period: current.period,
            evaluationDate: current.evaluationDate,
            items: [],
            isValid: true,
            note: ''
          }
        }
        acc[key].items.push({
          competencyId: current.competencyId,
          competencyName: current.competencyName,
          group: current.group,
          requiredLevel: current.requiredLevel,
          achievedLevel: current.achievedLevel,
          difference: current.achievedLevel - current.requiredLevel,
          comment: current.comment
        })
        if (!current.isValid) {
          acc[key].isValid = false
          acc[key].note += `[${current.competencyName}: ${current.note}] `
        }
        return acc
      }, {})

      setEvalImportPreviewData(Object.values(grouped))
      setIsEvalImporting(false)
    } catch (error) {
      alert('Lỗi khi đọc file: ' + error.message)
      setIsEvalImporting(false)
    }
  }

  const handleConfirmEvalImport = async () => {
    const validData = evalImportPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ')
      return
    }

    if (!confirm(`Import ${validData.length} kết quả đánh giá?`)) return

    setIsEvalImporting(true)
    try {
      for (const assessment of validData) {
        const avgRequired = assessment.items.reduce((sum, i) => sum + i.requiredLevel, 0) / assessment.items.length
        const avgAchieved = assessment.items.reduce((sum, i) => sum + i.achievedLevel, 0) / assessment.items.length

        const emp = employees.find(e => e.id === assessment.employeeId)

        const payload = {
          employeeId: assessment.employeeId,
          employeeCode: assessment.employeeCode,
          period: assessment.period,
          evaluationDate: assessment.evaluationDate,
          items: assessment.items,
          diemYC: avgRequired || 0,
          diemKQ: avgAchieved || 0,
          result: (avgAchieved || 0) >= (avgRequired || 0) ? 'Đạt' : 'Cần cải thiện',
          department: emp ? (emp.bo_phan || emp.department || '') : '',
          position: emp ? (emp.vi_tri || emp.position || '') : '',
          updatedAt: new Date().toISOString()
        }
        await fbPush('hr/employee_competency_assessment', payload)
      }
      alert('Import thành công!')
      setIsEvalImportModalOpen(false)
      loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsEvalImporting(false)
    }
  }

  // --- Training Excel Functions ---

  const exportTrainingToExcel = () => {
    if (trainingPrograms.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = trainingPrograms.map((t, idx) => ({
      'STT': idx + 1,
      'Mã chương trình': t.code || t.id || '',
      'Tên chương trình': t.name || '',
      'Hình thức': t.format || t.hinhThuc || '',
      'Đơn vị đào tạo': t.provider || t.donVi || '',
      'Thời gian bắt đầu': t.startDate || '',
      'Thời gian kết thúc': t.endDate || '',
      'Mục tiêu': t.objective || t.mucTieu || '',
      'Trạng thái': t.status || ''
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Chuong_trinh_dao_tao')
    XLSX.writeFile(wb, `CT_DaoTao_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const downloadTrainingTemplate = () => {
    const data = [
      ['Mã chương trình', 'Tên chương trình', 'Hình thức', 'Đơn vị đào tạo', 'Thời gian bắt đầu (YYYY-MM-DD)', 'Thời gian kết thúc (YYYY-MM-DD)', 'Mục tiêu', 'Trạng thái'],
      ['CT001', 'Đào tạo kỹ năng giao tiếp', 'Nội bộ', 'Phòng HR', '2024-11-01', '2024-11-05', 'Nâng cao kỹ năng thuyết phục', 'Sắp diễn ra'],
      ['CT002', 'Kỹ thuật bán hàng nâng cao', 'External', 'PwC', '2024-12-01', '2024-12-10', 'Tăng tỷ lệ chốt đơn', 'Sắp diễn ra']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_CTDT')
    XLSX.writeFile(wb, 'Mau_import_chuong_trinh_dao_tao.xlsx')
  }

  const handleTrainingFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setTrainingImportFile(file)
    setIsTrainingImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsTrainingImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
      const required = ['tên chương trình', 'hình thức', 'đơn vị đào tạo']
      const missing = required.filter(r => !headers.some(h => h.includes(r)))

      if (missing.length > 0) {
        alert(`Thiếu các cột: ${missing.join(', ')}`)
        setIsTrainingImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)
      const parsedData = []

      for (const row of dataRows) {
        const code = String(row[headers.findIndex(h => h.includes('mã chương trình'))] || '').trim()
        const name = String(row[headers.findIndex(h => h.includes('tên chương trình'))] || '').trim()
        const format = String(row[headers.findIndex(h => h.includes('hình thức'))] || '').trim()
        const provider = String(row[headers.findIndex(h => h.includes('đơn vị đào tạo'))] || '').trim()
        const start = row[headers.findIndex(h => h.includes('bắt đầu'))]
        const end = row[headers.findIndex(h => h.includes('kết thúc'))]
        const objective = String(row[headers.findIndex(h => h.includes('mục tiêu'))] || '').trim()
        const status = String(row[headers.findIndex(h => h.includes('trạng thái'))] || 'Sắp diễn ra').trim()

        if (!name || !format || !provider) continue

        parsedData.push({
          code,
          name,
          format,
          provider,
          startDate: start ? String(start) : null,
          endDate: end ? String(end) : null,
          objective,
          status,
          isValid: true
        })
      }

      setTrainingImportPreviewData(parsedData)
      setIsTrainingImporting(false)
    } catch (error) {
      alert('Lỗi khi đọc file: ' + error.message)
      setIsTrainingImporting(false)
    }
  }

  const handleConfirmTrainingImport = async () => {
    const validData = trainingImportPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ')
      return
    }

    if (!confirm(`Import ${validData.length} chương trình đào tạo?`)) return

    setIsTrainingImporting(true)
    try {
      for (const item of validData) {
        const { isValid, ...payload } = item
        await fbPush('hr/trainings', payload)
      }
      alert('Import thành công!')
      setIsTrainingImportModalOpen(false)
      loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsTrainingImporting(false)
    }
  }

  // Filter competency framework by department
  const filteredFramework = filterDept
    ? competencyFramework.filter(c => c.department === filterDept)
    : competencyFramework

  // Pivot dữ liệu cho Ma trận (Bảng 2)
  const matrixPositions = [...new Set(filteredFramework.map(c => c.position).filter(Boolean))].sort()

  const pivotRows = Object.values(
    filteredFramework.reduce((acc, item) => {
      const group = item.group || 'Khác'
      const name = item.name || 'Khác'
      const key = `${group}__${name}`
      if (!acc[key]) {
        acc[key] = { group, name, levels: {} }
      }
      acc[key].levels[item.position || ''] = item.level || '–'
      return acc
    }, {})
  ).sort((a, b) => {
    // Sort by group then by name
    if (a.group !== b.group) return a.group.localeCompare(b.group)
    return a.name.localeCompare(b.name)
  })

  // Filter evaluations
  const filteredEvaluations = evaluations.filter(e => {
    if (filterEvaluationDept && e.department !== filterEvaluationDept) return false
    if (filterEvaluationPeriod && e.period !== filterEvaluationPeriod) return false
    return true
  })

  // Filter training participants
  const [filteredParticipants, setFilteredParticipants] = useState([])
  useEffect(() => {
    setFilteredParticipants(filterTrainingProgram
      ? trainingParticipants.filter(p => p.trainingProgramId === filterTrainingProgram)
      : trainingParticipants)
  }, [filterTrainingProgram, trainingParticipants])

  // Bảng 1 Logic
  const handleAssessmentFormChange = (e) => {
    const { name, value } = e.target
    setAssessmentForm(prev => ({ ...prev, [name]: value }))

    if (name === 'employeeId') {
      const emp = employees.find(e => e.id === value)
      if (emp) {
        // Try to auto-match position from framework
        const empPosition = String(emp.vi_tri || emp.position || '').trim()
        const empDept = String(emp.bo_phan || emp.department || '').trim()

        // Find if this position exists in framework (case-insensitive)
        const frameworkPositions = [...new Set(competencyFramework
          .filter(c => (!inputFilterDept || c.department === inputFilterDept))
          .map(c => c.position))]

        const matchingPos = frameworkPositions.find(p => p.toLowerCase() === empPosition.toLowerCase())
        const positionToUse = matchingPos || empPosition // Fallback to employee's own position string if no match found, user can change later

        setAssessmentForm(prev => ({
          ...prev,
          employeeId: value,
          employeeCode: emp.ma_nhan_vien || emp.employeeCode || emp.code || emp.id || '',
          position: positionToUse, // Set the tentative position
          department: emp.bo_phan || emp.department || ''
        }))
        loadAssessmentItems(positionToUse, empDept)
      } else {
        setAssessmentForm(prev => ({ ...prev, items: [] }))
      }
    }

    if (name === 'position') {
      // User manually changed the framework position
      loadAssessmentItems(value, assessmentForm.department)
    }
  }

  const loadAssessmentItems = (position, department, existingItems = null) => {
    if (!position) return

    const searchPos = position.trim().toLowerCase()
    const searchDept = String(department || '').trim().toLowerCase()

    const frameworkItems = competencyFramework.filter(c => {
      const framePosition = String(c.position || '').trim().toLowerCase()
      const frameDept = String(c.department || '').trim().toLowerCase()

      // Match Position AND Department (if Dept is specified in framework)
      // Note: We prioritize the explicitly selected 'position'
      return framePosition === searchPos && (!c.department || frameDept === searchDept || searchDept === '') && c.status !== 'Không áp dụng'
    })

    const items = frameworkItems.map(item => {
      const existing = existingItems?.find(i => i.competencyId === item.id)
      const requiredLevel = Number(item.level || 0)
      const achievedLevel = existing ? Number(existing.achievedLevel || 0) : requiredLevel

      return {
        competencyId: item.id,
        competencyCode: item.code || item.id,
        competencyName: item.name,
        group: item.group,
        requiredLevel: requiredLevel,
        achievedLevel: achievedLevel,
        difference: achievedLevel - requiredLevel,
        comment: existing ? existing.comment : ''
      }
    })

    setAssessmentForm(prev => ({ ...prev, items }))
  }

  const handleAssessmentItemChange = (index, field, value) => {
    const newItems = [...assessmentForm.items]
    const item = { ...newItems[index] }
    item[field] = field === 'achievedLevel' ? (parseInt(value) || 0) : value
    if (field === 'achievedLevel') {
      item.difference = item.achievedLevel - item.requiredLevel
    }
    newItems[index] = item
    setAssessmentForm(prev => ({ ...prev, items: newItems }))
  }

  const handleSaveAssessment = async () => {
    if (!assessmentForm.employeeId || !assessmentForm.period) {
      alert('Vui lòng chọn nhân viên và kỳ đánh giá')
      return
    }
    if (assessmentForm.items.length === 0) {
      alert('Không có năng lực để đánh giá cho nhân viên này. Vui lòng kiểm tra Khung năng lực.')
      return
    }

    try {
      setIsSaving(true)
      const avgRequired = assessmentForm.items.reduce((sum, i) => sum + i.requiredLevel, 0) / assessmentForm.items.length
      const avgAchieved = assessmentForm.items.reduce((sum, i) => sum + i.achievedLevel, 0) / assessmentForm.items.length

      const dataToSave = {
        ...assessmentForm,
        diemYC: avgRequired,
        diemKQ: avgAchieved,
        result: avgAchieved >= avgRequired ? 'Đạt' : 'Cần cải thiện',
        updatedAt: new Date().toISOString()
      }

      if (assessmentForm.id) {
        const { id, ...cleanData } = dataToSave
        await fbUpdate(`hr/employee_competency_assessment/${id}`, cleanData)
      } else {
        await fbPush('hr/employee_competency_assessment', dataToSave)
      }

      alert('Đã lưu kết quả đánh giá thành công')
      setAssessmentForm({
        employeeId: '',
        employeeCode: '',
        position: '',
        department: '',
        period: '',
        evaluationDate: new Date().toISOString().split('T')[0],
        items: []
      })
      loadData()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Khung năng lực Logic (Inline Form)
  const handleFrameworkFormChange = (e) => {
    const { name, value } = e.target
    const val = name === 'level' ? (parseInt(value) || 1) : value
    setFrameworkForm(prev => ({ ...prev, [name]: val }))
  }

  const handleSaveFramework = async (e) => {
    e.preventDefault()
    if (!frameworkForm.department || !frameworkForm.position || !frameworkForm.name) {
      alert('Vui lòng nhập đầy đủ Bộ phận, Vị trí và Tên năng lực')
      return
    }

    try {
      setIsFrameworkSaving(true)
      const { id, ...dataToSave } = frameworkForm

      if (id) {
        // Nếu có ID (trường hợp sửa từ Bảng 1 - dù hiện tại ưu tiên Modal cho sửa)
        await fbUpdate(`hr/competencyFramework/${id}`, dataToSave)
        alert('Cập nhật năng lực thành công')
      } else {
        await fbPush('hr/competencyFramework', dataToSave)
        alert('Thêm năng lực thành công')
      }

      setFrameworkForm({
        id: null,
        department: '',
        position: '',
        group: 'Chuyên môn',
        name: '',
        level: 1,
        status: 'Áp dụng',
        note: ''
      })
      loadData()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    } finally {
      setIsFrameworkSaving(false)
    }
  }

  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-graduation-cap"></i>
          Năng lực nhân sự
        </h1>
        {activeTab === 'framework' && (
          <>
            <SeedCompetencyDataButton onComplete={loadData} />
            <button
              className="btn"
              onClick={exportFrameworkToExcel}
              style={{
                marginLeft: '10px',
                background: '#28a745',
                borderColor: '#28a745',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: '500'
              }}
              title="Xuất dữ liệu ra file Excel"
            >
              <i className="fas fa-file-excel"></i> Xuất Excel
            </button>
            <button
              className="btn btn-info"
              onClick={downloadFrameworkTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsFrameworkImportModalOpen(true)}
              style={{
                marginLeft: '10px',
                background: '#6f42c1',
                borderColor: '#6f42c1',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Nhập dữ liệu từ file Excel mẫu"
            >
              <i className="fas fa-file-import"></i>
              Import Excel
            </button>
          </>
        )}
        {activeTab === 'evaluation' && (
          <>
            <button
              className="btn"
              onClick={exportEvaluationsToExcel}
              style={{
                marginLeft: '10px',
                background: '#28a745',
                borderColor: '#28a745',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: '500'
              }}
              title="Xuất dữ liệu đánh giá"
            >
              <i className="fas fa-file-excel"></i> Xuất Excel
            </button>
            <button
              className="btn btn-info"
              onClick={downloadEvalTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsEvalImportModalOpen(true)}
              style={{
                marginLeft: '10px',
                background: '#6f42c1',
                borderColor: '#6f42c1',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Nhập dữ liệu đánh giá từ Excel"
            >
              <i className="fas fa-file-import"></i>
              Import Excel
            </button>
          </>
        )}
        {activeTab === 'training' && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedTraining(null)
                setIsTrainingModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Thêm CTĐT
            </button>
            <button
              className="btn"
              onClick={exportTrainingToExcel}
              style={{
                marginLeft: '10px',
                background: '#28a745',
                borderColor: '#28a745',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: '500'
              }}
              title="Xuất danh sách CTĐT"
            >
              <i className="fas fa-file-excel"></i> Xuất Excel
            </button>
            <button
              className="btn btn-info"
              onClick={downloadTrainingTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsTrainingImportModalOpen(true)}
              style={{
                marginLeft: '10px',
                background: '#6f42c1',
                borderColor: '#6f42c1',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Nhập danh sách CTĐT từ Excel"
            >
              <i className="fas fa-file-import"></i>
              Import Excel
            </button>
          </>
        )}
      </div>

      <div className="tabs">
        <div
          className={`tab ${activeTab === 'framework' ? 'active' : ''}`}
          onClick={() => setActiveTab('framework')}
        >
          📋 Khung năng lực
        </div>
        <div
          className={`tab ${activeTab === 'evaluation' ? 'active' : ''}`}
          onClick={() => setActiveTab('evaluation')}
        >
          ⭐ Đánh giá năng lực
        </div>
        <div
          className={`tab ${activeTab === 'training' ? 'active' : ''}`}
          onClick={() => setActiveTab('training')}
        >
          📚 Đào tạo nội bộ
        </div>
      </div>

      {/* Tab 1: Khung năng lực */}
      {activeTab === 'framework' && (
        <>

          {/* Bảng 1: Khai báo khung năng lực theo vị trí (Inline) */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <h3 className="card-title">Bảng 1: Khai báo khung năng lực theo vị trí</h3>
            </div>
            <div style={{ padding: '15px' }}>
              <form onSubmit={handleSaveFramework}>
                <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Bộ phận *</label>
                    <select
                      name="department"
                      value={frameworkForm.department}
                      onChange={handleFrameworkFormChange}
                      style={{ width: '100%', padding: '8px' }}
                      required
                    >
                      <option value="">Chọn bộ phận</option>
                      {['MKT', 'Sale', 'BOD', 'Nhân sự', 'Kế toán', 'Vận đơn', 'CSKH'].sort().map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      {[...new Set(employees.map(e => e.bo_phan || e.department).filter(Boolean))].filter(d => !['MKT', 'Sale', 'BOD', 'Nhân sự', 'Kế toán', 'Vận đơn', 'CSKH'].includes(d)).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: '1', minWidth: '200px', position: 'relative' }}>
                    <label>Vị trí *</label>
                    <input
                      type="text"
                      name="position"
                      value={frameworkForm.position}
                      onChange={handleFrameworkFormChange}
                      onFocus={() => setShowPositionDropdown(true)}
                      onBlur={() => setTimeout(() => setShowPositionDropdown(false), 200)}
                      placeholder="Nhập vị trí mới hoặc chọn từ danh sách..."
                      style={{ width: '100%', padding: '8px' }}
                      required
                      autoComplete="off"
                    />
                    {showPositionDropdown && (
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
                        {[...new Set([
                          ...competencyFramework.map(c => c.position),
                          ...employees.map(e => e.vi_tri || e.position)
                        ].filter(Boolean))].sort().filter(p => normalizeString(p).includes(normalizeString(frameworkForm.position || ''))).map((pos, idx) => (
                          <li
                            key={idx}
                            onClick={() => setFrameworkForm(prev => ({ ...prev, position: pos }))}
                            style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {pos}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Nhóm năng lực *</label>
                    <select
                      name="group"
                      value={frameworkForm.group}
                      onChange={handleFrameworkFormChange}
                      style={{ width: '100%', padding: '8px' }}
                      required
                    >
                      <option value="Chuyên môn">Chuyên môn</option>
                      <option value="Lãnh đạo">Lãnh đạo</option>
                      <option value="Cá nhân">Cá nhân</option>
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '2', minWidth: '300px', position: 'relative' }}>
                    <label>Tên năng lực *</label>
                    <input
                      type="text"
                      name="name"
                      value={frameworkForm.name}
                      onChange={handleFrameworkFormChange}
                      onFocus={() => setShowNameDropdown(true)}
                      onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                      placeholder="VD: Lập kế hoạch & giám sát KPI"
                      style={{ width: '100%', padding: '8px' }}
                      required
                      autoComplete="off"
                    />
                    {showNameDropdown && (
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
                        {[...new Set(competencyFramework.map(c => c.name).filter(Boolean))].sort()
                          .filter(n => normalizeString(n).includes(normalizeString(frameworkForm.name || '')))
                          .map((name, idx) => (
                            <li
                              key={idx}
                              onClick={() => setFrameworkForm(prev => ({ ...prev, name: name }))}
                              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              {name}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
                    <label>Level yêu cầu (1-5) *</label>
                    <select
                      name="level"
                      value={frameworkForm.level}
                      onChange={handleFrameworkFormChange}
                      style={{ width: '100%', padding: '8px' }}
                      required
                    >
                      {[1, 2, 3, 4, 5].map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
                    <label>Trạng thái</label>
                    <select
                      name="status"
                      value={frameworkForm.status}
                      onChange={handleFrameworkFormChange}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      <option value="Áp dụng">Áp dụng</option>
                      <option value="Ngừng">Ngừng</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label>Ghi chú</label>
                  <textarea
                    name="note"
                    value={frameworkForm.note}
                    onChange={handleFrameworkFormChange}
                    rows="2"
                    style={{ width: '100%', padding: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  {frameworkForm.id && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setFrameworkForm({
                        id: null,
                        department: '',
                        position: '',
                        group: 'Chuyên môn',
                        name: '',
                        level: 1,
                        status: 'Áp dụng',
                        note: ''
                      })}
                    >Hủy</button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={isFrameworkSaving}>
                    {isFrameworkSaving ? 'Đang lưu...' : (frameworkForm.id ? 'Cập nhật Năng lực' : 'Tạo mới Năng lực')}
                  </button>
                </div>
              </form>
            </div>
          </div>


          {/* Bảng 2: Danh mục khung năng lực theo bộ phận (Ma trận) */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title">Bảng 2: Danh mục khung năng lực theo bộ phận</h3>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px' }}
              >
                <option value="">Chọn Bộ phận để xem Ma trận</option>
                {[...new Set(competencyFramework.map(c => c.department).filter(Boolean))].sort().map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            {filterDept ? (
              matrixPositions.length > 0 ? (
                <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: '500px', border: '1px solid #e0e0e0', padding: 0 }}>
                  <table style={{ minWidth: '101%', marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th rowSpan="2" style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 12, minWidth: '50px' }}>STT</th>
                        <th rowSpan="2" style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 12, minWidth: '150px' }}>Nhóm năng lực</th>
                        <th rowSpan="2" style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 12, minWidth: '200px' }}>Tên năng lực</th>
                        {matrixPositions.map(pos => (
                          <th key={pos} style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 12, minWidth: '100px' }}>{pos}</th>
                        ))}
                      </tr>
                      <tr>
                        {matrixPositions.map((pos, idx) => (
                          <th key={`code_${pos}`} style={{ fontSize: '0.85em', color: '#666', background: '#f8f9fa', position: 'sticky', top: '40px', zIndex: 11 }}>B{idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotRows.length > 0 ? (
                        pivotRows.map((row, idx) => (
                          <tr key={`${row.group}_${row.name}`}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td>{row.group}</td>
                            <td>{row.name}</td>
                            {matrixPositions.map(pos => (
                              <td key={pos} style={{ textAlign: 'center', fontWeight: 'bold', color: row.levels[pos] !== '–' ? 'var(--primary)' : 'inherit' }}>
                                {row.levels[pos] || '–'}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3 + matrixPositions.length} className="empty-state">
                            Chưa có dữ liệu để hiển thị ma trận
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state" style={{ padding: '40px' }}>Bộ phận này chưa có dữ liệu khung năng lực</p>
              )
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <i className="fas fa-hand-pointer" style={{ fontSize: '24px', marginBottom: '10px' }}></i>
                <p>Vui lòng chọn <strong>Bộ phận</strong> ở trên để hiển thị Ma trận năng lực</p>
              </div>
            )}
          </div>

          {/* Bảng 3: Danh sách tổng hợp */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Bảng 3: Danh sách chi tiết khung năng lực</h3>
            </div>
            <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: '500px', border: '1px solid #e0e0e0' }}>
              <table style={{ minWidth: '101%', marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Nhóm năng lực</th>
                    <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tên năng lực</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Level yêu cầu</th>
                    <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Trạng thái</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {competencyFramework.length > 0 ? (
                    competencyFramework.map((c, idx) => (
                      <tr key={c.id}>
                        <td>{idx + 1}</td>
                        <td>{c.department || '-'}</td>
                        <td>{c.position || '-'}</td>
                        <td>{c.group || '-'}</td>
                        <td>{c.name || '-'}</td>
                        <td style={{ textAlign: 'center' }}>{c.level || '-'}</td>
                        <td>
                          <span className={`badge ${c.status === 'Áp dụng' ? 'badge-success' : 'badge-danger'}`}>
                            {c.status || 'Áp dụng'}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="view"
                              onClick={() => {
                                setSelectedFramework(c)
                                setIsFrameworkReadOnly(true)
                                setIsFrameworkModalOpen(true)
                              }}
                              title="Xem chi tiết"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                            <button
                              className="edit"
                              onClick={() => {
                                setSelectedFramework(c)
                                setIsFrameworkReadOnly(false)
                                setIsFrameworkModalOpen(true)
                              }}
                              title="Sửa"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              className="delete"
                              onClick={() => handleDeleteFramework(c.id)}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-state">Chưa có khung năng lực</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )
      }

      {/* Tab 2: Đánh giá năng lực */}
      {
        activeTab === 'evaluation' && (
          <>
            {/* Bảng 1: Nhập kết quả đánh giá năng lực cho 1 nhân sự */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3 className="card-title">Bảng 1: HR nhập kết quả đánh giá năng lực cho 1 nhân sự</h3>
              </div>
              <div style={{ padding: '15px' }}>
                <div className="form-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Chọn Bộ phận</label>
                    <select
                      value={inputFilterDept}
                      onChange={(e) => setInputFilterDept(e.target.value)}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      <option value="">Tất cả bộ phận</option>
                      {[...new Set(employees.map(e => e.bo_phan || e.department).filter(Boolean))].sort().map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Nhân sự *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder={inputFilterDept ? `Tìm nhân viên ${inputFilterDept}...` : "Tìm kiếm nhân viên..."}
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value)
                          setShowDropdown(true)
                          if (assessmentForm.employeeId) {
                            // Clear selection if user types (optional, strictly forcing re-select)
                            handleAssessmentFormChange({ target: { name: 'employeeId', value: '' } })
                          }
                        }}
                        onFocus={() => setShowDropdown(true)}
                        style={{ width: '100%', padding: '8px' }}
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
                            .filter(e => {
                              const matchDept = !inputFilterDept || (e.bo_phan || e.department) === inputFilterDept
                              const matchName = normalizeString(e.ho_va_ten || e.name || '').includes(normalizeString(searchTerm))
                              return matchDept && matchName
                            })
                            .map(e => (
                              <li
                                key={e.id}
                                onClick={() => {
                                  handleAssessmentFormChange({ target: { name: 'employeeId', value: e.id } })
                                  setSearchTerm(e.ho_va_ten || e.name || '')
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
                                <strong>{e.ho_va_ten || e.name || 'N/A'}</strong>
                                <br />
                                <small style={{ color: '#666' }}>{e.vi_tri || '-'} | {e.bo_phan || '-'}</small>
                              </li>
                            ))}
                          {employees.filter(e => {
                            const matchDept = !inputFilterDept || (e.bo_phan || e.department) === inputFilterDept
                            const matchName = normalizeString(e.ho_va_ten || e.name || '').includes(normalizeString(searchTerm))
                            return matchDept && matchName
                          }).length === 0 && (
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
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Vị trí áp dụng KHNL *</label>
                    <select
                      name="position"
                      value={assessmentForm.position}
                      onChange={handleAssessmentFormChange}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      <option value="">Chọn vị trí KHNL</option>
                      {[...new Set(competencyFramework
                        .filter(c => !inputFilterDept || c.department === inputFilterDept)
                        .map(c => c.position)
                      )].sort().map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Kỳ đánh giá (Tháng) *</label>
                    <input
                      type="month"
                      name="period"
                      value={assessmentForm.period}
                      onChange={handleAssessmentFormChange}
                      style={{ width: '100%', padding: '8px' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Ngày đánh giá</label>
                    <input
                      type="date"
                      name="evaluationDate"
                      value={assessmentForm.evaluationDate}
                      onChange={handleAssessmentFormChange}
                      style={{ width: '100%', padding: '8px' }}
                    />
                  </div>
                </div>

                {assessmentForm.items.length > 0 ? (
                  <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: '400px', marginBottom: '15px', border: '1px solid #e0e0e0' }}>
                    <table style={{ minWidth: '101%', marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                          <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Nhóm năng lực</th>
                          <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tên năng lực</th>
                          <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Level yêu cầu</th>
                          <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Level đạt được</th>
                          <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Điểm chênh lệch</th>
                          <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Nhận xét</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessmentForm.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{item.group || '-'}</td>
                            <td>{item.competencyName || '-'}</td>
                            <td style={{ textAlign: 'center' }}>{item.requiredLevel}</td>
                            <td>
                              <select
                                value={item.achievedLevel}
                                onChange={(e) => handleAssessmentItemChange(idx, 'achievedLevel', e.target.value)}
                                style={{ width: '100%', padding: '5px' }}
                              >
                                {[1, 2, 3, 4, 5].map(v => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{
                              textAlign: 'center',
                              fontWeight: 'bold',
                              color: item.difference > 0 ? 'var(--success)' : item.difference < 0 ? 'var(--danger)' : 'inherit'
                            }}>
                              {item.difference > 0 ? `+${item.difference}` : item.difference}
                            </td>
                            <td>
                              <input
                                type="text"
                                value={item.comment}
                                onChange={(e) => handleAssessmentItemChange(idx, 'comment', e.target.value)}
                                placeholder="Nhập nhận xét..."
                                style={{ width: '100%', padding: '5px' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : assessmentForm.employeeId && (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    Nhân sự này chưa được cài đặt Khung năng lực cho vị trí: <strong>{assessmentForm.position}</strong>. <br />
                    Vui lòng qua tab <strong>Khung năng lực</strong> để thiết lập trước.
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    className="btn"
                    onClick={() => setAssessmentForm({
                      employeeId: '',
                      employeeCode: '',
                      position: '',
                      department: '',
                      period: '',
                      evaluationDate: new Date().toISOString().split('T')[0],
                      items: []
                    })}
                  >Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveAssessment}
                    disabled={isSaving || assessmentForm.items.length === 0}
                  >
                    {isSaving ? 'Đang lưu...' : (assessmentForm.id ? 'Cập nhật kết quả' : 'Lưu kết quả')}
                  </button>
                </div>
              </div>
            </div>
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title">Bảng 2: Kết quả đánh giá năng lực</h3>
                <div className="search-box" style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={filterEvaluationDept}
                    onChange={(e) => setFilterEvaluationDept(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px' }}
                  >
                    <option value="">Tất cả bộ phận</option>
                    {[...new Set(evaluations.map(e => e.department).filter(Boolean))].sort().map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <select
                    value={filterEvaluationPeriod}
                    onChange={(e) => setFilterEvaluationPeriod(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px' }}
                  >
                    <option value="">Tất cả kỳ</option>
                    {[...new Set(evaluations.map(e => e.period).filter(Boolean))].sort().map(period => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
                <table style={{ minWidth: '101%', marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Kỳ đánh giá</th>
                      <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã NV</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Họ và tên</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                      <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Điểm YC</th>
                      <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Điểm KQ</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Kết quả</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ngày đánh giá</th>
                      <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvaluations.length > 0 ? (
                      filteredEvaluations.map((evaluation, idx) => {
                        const employee = employees.find(e => e.id === evaluation.employeeId)
                        const avgRequired = evaluation.diemYC || evaluation.avgRequired || 0
                        const avgAchieved = evaluation.diemKQ || evaluation.avgAchieved || 0
                        const result = avgAchieved >= avgRequired ? 'Đạt' : 'Cần cải thiện'

                        return (
                          <tr key={evaluation.id}>
                            <td>{idx + 1}</td>
                            <td>{evaluation.period || '-'}</td>
                            <td>{evaluation.employeeCode || evaluation.employeeId || '-'}</td>
                            <td>{employee ? (employee.ho_va_ten || employee.name || '-') : (evaluation.employeeName || '-')}</td>
                            <td>{evaluation.department || '-'}</td>
                            <td>{evaluation.position || '-'}</td>
                            <td style={{ fontWeight: 'bold' }}>{avgRequired.toFixed(1)}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{avgAchieved.toFixed(1)}</td>
                            <td>
                              <span className={`badge ${result === 'Đạt' ? 'badge-success' : 'badge-warning'}`}>
                                {result}
                              </span>
                            </td>
                            <td>{evaluation.evaluationDate ? new Date(evaluation.evaluationDate).toLocaleDateString('vi-VN') : '-'}</td>
                            <td>
                              <div className="actions">
                                <button
                                  className="view"
                                  onClick={() => {
                                    setSelectedEvaluationDetail(evaluation)
                                    setIsEvaluationDetailModalOpen(true)
                                  }}
                                  title="Xem chi tiết"
                                >
                                  <i className="fas fa-eye"></i>
                                </button>
                                <button
                                  className="edit"
                                  onClick={() => {
                                    const emp = employees.find(e => e.id === evaluation.employeeId)
                                    setAssessmentForm({ ...evaluation })
                                    // Load items based on the saved position (or employee position if missing) and department
                                    loadAssessmentItems(evaluation.position || (emp ? emp.vi_tri : ''), evaluation.department, evaluation.items)
                                    // Scroll to top to see Bảng 1
                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                  }}
                                  title="Sửa (Load lên Bảng 1)"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan="11" className="empty-state">Chưa có đánh giá năng lượng</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      }

      {/* Tab 3: Đào tạo nội bộ */}
      {
        activeTab === 'training' && (
          <>
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3 className="card-title">Bảng 1: Danh sách chương trình đào tạo</h3>
              </div>
              <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
                <table style={{ minWidth: '101%', marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã chương trình</th>
                      <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tên chương trình đào tạo</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Hình thức đào tạo</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Đơn vị đào tạo</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thời gian bắt đầu</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thời gian kết thúc</th>
                      <th style={{ minWidth: '250px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mục tiêu đào tạo</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Trạng thái</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingPrograms.length > 0 ? (
                      trainingPrograms.map((training, idx) => (
                        <tr key={training.id}>
                          <td>{idx + 1}</td>
                          <td>{training.code || training.id || '-'}</td>
                          <td>{training.name || '-'}</td>
                          <td>{training.format || training.hinhThuc || '-'}</td>
                          <td>{training.provider || training.donVi || '-'}</td>
                          <td>{training.startDate ? new Date(training.startDate).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{training.endDate ? new Date(training.endDate).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{training.objective || training.mucTieu || '-'}</td>
                          <td>
                            <span className={`badge ${training.status === 'Đã kết thúc' ? 'badge-success' :
                              training.status === 'Đang diễn ra' ? 'badge-info' :
                                training.status === 'Sắp diễn ra' ? 'badge-warning' :
                                  'badge-danger'
                              }`}>
                              {training.status || '-'}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                className="edit"
                                onClick={() => {
                                  setSelectedTraining(training)
                                  setIsTrainingModalOpen(true)
                                }}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                className="delete"
                                onClick={() => handleDeleteTraining(training.id)}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                              <button
                                className="view"
                                onClick={() => {
                                  setSelectedTraining(training)
                                  setParticipantInitialView('participants')
                                  setIsParticipantModalOpen(true)
                                }}
                                title="Gán học viên"
                              >
                                <i className="fas fa-user-plus"></i>
                              </button>
                              {training.status === 'Đã kết thúc' && (
                                <button
                                  className="view"
                                  onClick={() => {
                                    setSelectedTraining(training)
                                    setParticipantInitialView('results')
                                    setIsParticipantModalOpen(true)
                                  }}
                                  title="Xem chi tiết & kết quả"
                                >
                                  <i className="fas fa-eye"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="10" className="empty-state">Chưa có chương trình đào tạo</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bảng 2: Danh sách học viên tham gia */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Bảng 2: Danh sách học viên tham gia</h3>
                <select
                  value={filterTrainingProgram}
                  onChange={(e) => setFilterTrainingProgram(e.target.value)}
                  style={{ padding: '8px', borderRadius: '4px' }}
                >
                  <option value="">Tất cả chương trình</option>
                  {trainingPrograms.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.code}</option>
                  ))}
                </select>
              </div>
              <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
                <table style={{ minWidth: '101%', marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                      <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã NV</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Họ và tên</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Chương trình đào tạo</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tình trạng tham gia</th>
                      <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Tỷ lệ tham dự (%)</th>
                      <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ghi chú</th>
                      <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.length > 0 ? (
                      filteredParticipants.map((participant, idx) => {
                        const employee = employees.find(e => e.id === participant.employeeId)
                        const training = trainingPrograms.find(t => t.id === participant.trainingProgramId)
                        return (
                          <tr key={participant.id}>
                            <td>{idx + 1}</td>
                            <td>{participant.employeeId || '-'}</td>
                            <td>{employee ? (employee.ho_va_ten || employee.name || '-') : '-'}</td>
                            <td>{employee ? (employee.bo_phan || '-') : '-'}</td>
                            <td>{employee ? (employee.vi_tri || '-') : '-'}</td>
                            <td>{training ? (training.name || '-') : '-'}</td>
                            <td>
                              <span className={`badge ${participant.status === 'Đã tham gia' ? 'badge-success' :
                                participant.status === 'Vắng' ? 'badge-danger' :
                                  'badge-warning'
                                }`}>
                                {participant.status || '-'}
                              </span>
                            </td>
                            <td>{participant.attendanceRate || participant.tyLeThamDu || 0}%</td>
                            <td>{participant.note || participant.ghiChu || '-'}</td>
                            <td>
                              <div className="actions">
                                <button
                                  className="view"
                                  onClick={() => {
                                    setSelectedTraining(training)
                                    setIsParticipantReadOnly(true)
                                    setIsParticipantModalOpen(true)
                                  }}
                                  title="Xem chi tiết"
                                >
                                  <i className="fas fa-eye"></i>
                                </button>
                                <button
                                  className="edit"
                                  onClick={() => {
                                    setSelectedTraining(training)
                                    setIsParticipantReadOnly(false)
                                    setIsParticipantModalOpen(true)
                                  }}
                                  title="Cập nhật trạng thái"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  className="delete"
                                  onClick={() => handleDeleteParticipant(participant.id)}
                                  title="Xóa học viên"
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
                        <td colSpan="10" className="empty-state">Chưa có học viên tham gia</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      }

      {/* Modals */}




      <EvaluationDetailModal
        evaluation={selectedEvaluationDetail}
        employee={selectedEvaluationDetail ? employees.find(e => e.id === selectedEvaluationDetail.employeeId) : null}
        competencyFramework={competencyFramework}
        isOpen={isEvaluationDetailModalOpen}
        onClose={() => {
          setIsEvaluationDetailModalOpen(false)
          setSelectedEvaluationDetail(null)
        }}
      />

      <TrainingProgramModal
        training={selectedTraining}
        isOpen={isTrainingModalOpen}
        onClose={() => {
          setIsTrainingModalOpen(false)
          setSelectedTraining(null)
        }}
        onSave={loadData}
      />

      <TrainingParticipantModal
        training={selectedTraining}
        employees={employees}
        trainingPrograms={trainingPrograms}
        isOpen={isParticipantModalOpen}
        onClose={() => {
          setIsParticipantModalOpen(false)
          setSelectedTraining(null)
          setIsParticipantReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isParticipantReadOnly}
      />
      <CompetencyFrameworkModal
        framework={selectedFramework}
        isOpen={isFrameworkModalOpen}
        onClose={() => {
          setIsFrameworkModalOpen(false)
          setSelectedFramework(null)
          setIsFrameworkReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isFrameworkReadOnly}
        employees={employees}
        competencyFramework={competencyFramework}
      />

      {isFrameworkImportModalOpen && (
        <div className="modal show" onClick={() => setIsFrameworkImportModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>Import Khung Năng Lực</h3>
              <button className="modal-close" onClick={() => setIsFrameworkImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                Vui lòng sử dụng file mẫu. Hệ thống sẽ import danh sách năng lực theo vị trí và bộ phận.
              </div>
              <input type="file" onChange={handleFrameworkFileSelect} accept=".xlsx,.xls" />

              {frameworkImportPreviewData.length > 0 && (
                <div style={{ marginTop: '15px', maxHeight: '400px', overflow: 'auto' }}>
                  <table className="table table-bordered">
                    <thead>
                      <tr>
                        <th>Bộ phận</th>
                        <th>Vị trí</th>
                        <th>Nhóm</th>
                        <th>Tên năng lực</th>
                        <th>Level</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frameworkImportPreviewData.map((d, i) => (
                        <tr key={i} style={{ backgroundColor: d.isValid ? 'transparent' : '#fff3f3' }}>
                          <td>{d.department}</td>
                          <td>{d.position}</td>
                          <td>{d.group}</td>
                          <td>{d.name}</td>
                          <td style={{ textAlign: 'center' }}>{d.level}</td>
                          <td>
                            {d.isValid ? (
                              <span style={{ color: 'green' }}>✓ Hợp lệ</span>
                            ) : (
                              <span style={{ color: 'red' }}>✕ {d.note_val}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '15px', textAlign: 'right' }}>
                <button className="btn" onClick={() => setIsFrameworkImportModalOpen(false)}>Hủy</button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmFrameworkImport}
                  disabled={isFrameworkImporting || frameworkImportPreviewData.filter(d => d.isValid).length === 0}
                  style={{ marginLeft: '10px' }}
                >
                  {isFrameworkImporting ? 'Đang import...' : 'Xác nhận Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEvalImportModalOpen && (
        <div className="modal show" onClick={() => setIsEvalImportModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
            <div className="modal-header">
              <h3>Import Kết Quả Đánh Giá</h3>
              <button className="modal-close" onClick={() => setIsEvalImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                Hệ thống sẽ tự động tổng hợp kết quả theo Nhân viên và Kỳ đánh giá.
              </div>
              <input type="file" onChange={handleEvalFileSelect} accept=".xlsx,.xls" />

              {evalImportPreviewData.length > 0 && (
                <div style={{ marginTop: '15px', maxHeight: '400px', overflow: 'auto' }}>
                  <table className="table table-bordered">
                    <thead>
                      <tr>
                        <th>Mã NV</th>
                        <th>Họ tên</th>
                        <th>Kỳ</th>
                        <th>Số lượng NL</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalImportPreviewData.map((d, i) => (
                        <tr key={i} style={{ backgroundColor: d.isValid ? 'transparent' : '#fff3f3' }}>
                          <td>{d.employeeId}</td>
                          <td>{d.employeeName}</td>
                          <td>{d.period}</td>
                          <td style={{ textAlign: 'center' }}>{d.items.length}</td>
                          <td>
                            {d.isValid ? (
                              <span style={{ color: 'green' }}>✓ Hợp lệ</span>
                            ) : (
                              <span style={{ color: 'red' }}>✕ {d.note}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '15px', textAlign: 'right' }}>
                <button className="btn" onClick={() => setIsEvalImportModalOpen(false)}>Hủy</button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmEvalImport}
                  disabled={isEvalImporting || evalImportPreviewData.filter(d => d.isValid).length === 0}
                  style={{ marginLeft: '10px' }}
                >
                  {isEvalImporting ? 'Đang import...' : 'Xác nhận Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isTrainingImportModalOpen && (
        <div className="modal show" onClick={() => setIsTrainingImportModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>Import Chương Trình Đào Tạo</h3>
              <button className="modal-close" onClick={() => setIsTrainingImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                Vui lòng sử dụng file mẫu để import danh sách chương trình đào tạo nội bộ.
              </div>
              <input type="file" onChange={handleTrainingFileSelect} accept=".xlsx,.xls" />

              {trainingImportPreviewData.length > 0 && (
                <div style={{ marginTop: '15px', maxHeight: '400px', overflow: 'auto' }}>
                  <table className="table table-bordered">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Tên chương trình</th>
                        <th>Hình thức</th>
                        <th>Đơn vị</th>
                        <th>Bắt đầu</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingImportPreviewData.map((d, i) => (
                        <tr key={i} style={{ backgroundColor: d.isValid ? 'transparent' : '#fff3f3' }}>
                          <td>{d.code}</td>
                          <td>{d.name}</td>
                          <td>{d.format}</td>
                          <td>{d.provider}</td>
                          <td>{d.startDate}</td>
                          <td>
                            {d.isValid ? (
                              <span style={{ color: 'green' }}>✓ Hợp lệ</span>
                            ) : (
                              <span style={{ color: 'red' }}>✕ Không hợp lệ</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '15px', textAlign: 'right' }}>
                <button className="btn" onClick={() => setIsTrainingImportModalOpen(false)}>Hủy</button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmTrainingImport}
                  disabled={isTrainingImporting || trainingImportPreviewData.filter(d => d.isValid).length === 0}
                  style={{ marginLeft: '10px' }}
                >
                  {isTrainingImporting ? 'Đang import...' : 'Xác nhận Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}

export default Competency
