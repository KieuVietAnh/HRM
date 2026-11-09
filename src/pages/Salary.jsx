import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import EmployeeSalaryModal from '../components/EmployeeSalaryModal'
import PromotionHistoryModal from '../components/PromotionHistoryModal'
import PromotionModal from '../components/PromotionModal'
import SalaryGradeModal from '../components/SalaryGradeModal'
import SeedDataButton from '../components/SeedDataButton'
import SeedPromotionHistoryButton from '../components/SeedPromotionHistoryButton'
import { fbDelete, fbGet, fbPush } from '../services/firebase'
import { formatMoney } from '../utils/helpers'


function Salary() {
  const [activeTab, setActiveTab] = useState('grades')
  const [salaryGrades, setSalaryGrades] = useState([])
  const [employeeSalaries, setEmployeeSalaries] = useState([])
  const [promotionHistory, setPromotionHistory] = useState([])
  const [insuranceInfo, setInsuranceInfo] = useState([])
  const [taxInfo, setTaxInfo] = useState([])
  const [dependents, setDependents] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false)
  const [isEmployeeSalaryModalOpen, setIsEmployeeSalaryModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false)
  const [isInsuranceModalOpen, setIsInsuranceModalOpen] = useState(false)
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false)

  const [selectedGrade, setSelectedGrade] = useState(null)
  const [selectedEmployeeSalary, setSelectedEmployeeSalary] = useState(null)
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState(null)
  const [selectedPromotion, setSelectedPromotion] = useState(null)
  const [selectedInsurance, setSelectedInsurance] = useState(null)
  const [selectedTax, setSelectedTax] = useState(null)
  const [isGradeReadOnly, setIsGradeReadOnly] = useState(false)
  const [isTaxReadOnly, setIsTaxReadOnly] = useState(false)
  const [isEmployeeSalaryReadOnly, setIsEmployeeSalaryReadOnly] = useState(false)
  const [isInsuranceReadOnly, setIsInsuranceReadOnly] = useState(false)

  // Excel Import/Export states for Salary Grades
  const [isGradeImportModalOpen, setIsGradeImportModalOpen] = useState(false)
  const [gradeImportFile, setGradeImportFile] = useState(null)
  const [gradeImportPreviewData, setGradeImportPreviewData] = useState([])
  const [isGradeImporting, setIsGradeImporting] = useState(false)

  // Excel Import/Export states for Employee Salaries
  const [isEmpSalaryImportModalOpen, setIsEmpSalaryImportModalOpen] = useState(false)
  const [empSalaryImportFile, setEmpSalaryImportFile] = useState(null)
  const [empSalaryImportPreviewData, setEmpSalaryImportPreviewData] = useState([])
  const [isEmpSalaryImporting, setIsEmpSalaryImporting] = useState(false)

  // Excel Import/Export states for Promotion History
  const [isHistoryImportModalOpen, setIsHistoryImportModalOpen] = useState(false)
  const [historyImportFile, setHistoryImportFile] = useState(null)
  const [historyImportPreviewData, setHistoryImportPreviewData] = useState([])
  const [isHistoryImporting, setIsHistoryImporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      const [
        empData,
        gradesData,
        salariesData,
        historyData,
        insData,
        taxData,
        depData
      ] = await Promise.all([
        fbGet('employees'),
        fbGet('hr/salaryGrades'),
        fbGet('hr/employeeSalaries'),
        fbGet('hr/promotionHistory'),
        fbGet('hr/insuranceInfo'),
        fbGet('hr/taxInfo'),
        fbGet('hr/dependents')
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

      // Process Salary Grades
      const grades = gradesData ? Object.entries(gradesData).map(([k, v]) => ({ ...v, id: k })) : []
      setSalaryGrades(grades)

      // Process Employee Salaries
      const empSalaries = salariesData ? Object.entries(salariesData).map(([k, v]) => ({ ...v, id: k })) : []
      setEmployeeSalaries(empSalaries)

      // Process History
      const history = historyData ? Object.entries(historyData).map(([k, v]) => ({ ...v, id: k })) : []
      setPromotionHistory(history)

      // Process Insurance
      const insList = insData ? Object.entries(insData).map(([k, v]) => ({ ...v, id: k })) : []
      setInsuranceInfo(insList)

      // Process Tax
      const taxList = taxData ? Object.entries(taxData).map(([k, v]) => ({ ...v, id: k })) : []
      setTaxInfo(taxList)

      // Process Dependents
      const depList = depData ? Object.entries(depData).map(([k, v]) => ({ ...v, id: k })) : []
      setDependents(depList)

      setLoading(false)
    } catch (error) {
      console.error('Error loading salary data:', error)
      setLoading(false)
    }
  }

  const handleDeleteGrade = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa bậc lương này?')) return
    try {
      await fbDelete(`hr/salaryGrades/${id}`)
      setSalaryGrades(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa bậc lương')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }

  const handleDeleteEmployeeSalary = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa bậc lương nhân viên này?')) return
    try {
      await fbDelete(`hr/employeeSalaries/${id}`)
      setEmployeeSalaries(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa bậc lương nhân viên')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }


  // Export Grades
  const exportGradesToExcel = () => {
    if (salaryGrades.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = salaryGrades.map((grade, idx) => ({
      'STT': idx + 1,
      'Vị trí': grade.position || grade.name || '',
      'Ca làm việc': grade.shift || '',
      'Doanh thu từ (triệu)': grade.revenueFrom || 0,
      'Doanh thu đến (triệu)': grade.revenueTo || 'Không giới hạn',
      'Bậc lương': grade.level || 1,
      'Lương P1 (VNĐ)': grade.salary || 0,
      'Trạng thái': grade.status || 'Đang áp dụng'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bac_luong')
    XLSX.writeFile(wb, `Danh_muc_bac_luong_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Download Template
  const downloadGradeTemplate = () => {
    const data = [
      ['Vị trí', 'Ca làm việc', 'Doanh thu từ', 'Doanh thu đến', 'Bậc lương', 'Lương P1'],
      ['Nhân viên kinh doanh', 'Ca ngày', 0, 100, 1, 5000000],
      ['Nhân viên kinh doanh', 'Ca đêm', 0, 100, 1, 5500000]
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_bac_luong')
    XLSX.writeFile(wb, 'Mau_import_bac_luong.xlsx')
  }

  // --- Employee Salary Excel Functions ---

  const downloadEmpSalaryTemplate = () => {
    const data = [
      ['Mã nhân viên', 'Vị trí', 'Ca làm việc', 'Bậc', 'Ngày hiệu lực (YYYY-MM-DD)'],
      ['NV001', 'Nhân viên kinh doanh', 'Ca ngày', '1', '2024-01-01'],
      ['NV002', 'Công nhân', 'Ca đêm', '2', '2024-01-01']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_luong_nv')
    XLSX.writeFile(wb, 'Mau_import_luong_nhan_vien.xlsx')
  }


  // Handle File Select
  const handleGradeFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setGradeImportFile(file)
    setIsGradeImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsGradeImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())

      // Strict Template Validation
      const requiredHeaders = [
        { key: 'vị trí', label: 'Vị trí' },
        { key: 'ca', label: 'Ca làm việc' },
        { key: 'bậc', label: 'Bậc lương' },
        { key: 'lương', label: 'Lương P1' }
      ]

      const missingHeaders = requiredHeaders.filter(req => !headers.some(h => h.includes(req.key)))

      if (missingHeaders.length > 0) {
        alert(`File không đúng mẫu! Thiếu các cột: ${missingHeaders.map(m => m.label).join(', ')}. Vui lòng tải file mẫu và nhập lại.`)
        setIsGradeImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)

      const parsedData = dataRows.map(row => {
        // Map columns by index or name approximation
        const position = row[headers.findIndex(h => h.includes('vị trí'))] || ''
        const shift = row[headers.findIndex(h => h.includes('ca'))] || 'Ca ngày'
        const revenueFrom = row[headers.findIndex(h => h.includes('từ'))] || 0
        const revenueTo = row[headers.findIndex(h => h.includes('đến'))] || ''
        const level = row[headers.findIndex(h => h.includes('bậc'))] || 1
        const salary = row[headers.findIndex(h => h.includes('lương'))] || 0

        if (!position) return null

        return {
          position,
          shift,
          revenueFrom: Number(revenueFrom),
          revenueTo: revenueTo === 'Không giới hạn' ? '' : (revenueTo ? Number(revenueTo) : ''),
          level: Number(level),
          salary: Number(salary),
          status: 'Đang áp dụng'
        }
      }).filter(item => item !== null)

      setGradeImportPreviewData(parsedData)
      setIsGradeImporting(false)
    } catch (error) {
      alert('Lỗi đọc file: ' + error.message)
      setIsGradeImporting(false)
    }
  }

  // Confirm Import
  const handleConfirmGradeImport = async () => {
    if (gradeImportPreviewData.length === 0) return

    if (!confirm(`Xác nhận import ${gradeImportPreviewData.length} bậc lương?`)) return

    setIsGradeImporting(true)
    try {
      for (const grade of gradeImportPreviewData) {
        await fbPush('hr/salaryGrades', grade)
      }
      alert('Import thành công!')
      setIsGradeImportModalOpen(false)
      setGradeImportPreviewData([])
      setGradeImportFile(null)
      loadData()
    } catch (error) {
      alert('Lỗi khi import: ' + error.message)
    } finally {
      setIsGradeImporting(false)
    }
  }

  // --- Employee Salary Excel Functions ---

  const exportEmpSalariesToExcel = () => {
    if (employeeSalaries.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = employeeSalaries.map((item, idx) => {
      const employee = employees.find(e => e.id === item.employeeId)
      const grade = salaryGrades.find(g => g.id === item.salaryGradeId)

      return {
        'STT': idx + 1,
        'Mã NV': item.employeeId || '',
        'Họ tên': employee ? (employee.ho_va_ten || employee.name || '') : '',
        'Bộ phận': employee ? (employee.bo_phan || '') : '',
        'Vị trí': grade ? (grade.position || grade.name || '') : '',
        'Ca': grade ? (grade.shift || '') : '',
        'Bậc': grade ? (grade.level || '') : '',
        'Lương cơ bản': grade ? (grade.salary || 0) : 0,
        'Ngày hiệu lực': item.effectiveDate || ''
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bac_luong_nhan_vien')
    XLSX.writeFile(wb, `Bac_luong_nhan_vien_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleEmpSalaryFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setEmpSalaryImportFile(file)
    setIsEmpSalaryImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsEmpSalaryImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
      const requiredHeaders = [
        { key: 'mã nhân viên', label: 'Mã nhân viên' },
        { key: 'vị trí', label: 'Vị trí' },
        { key: 'ca', label: 'Ca làm việc' },
        { key: 'bậc', label: 'Bậc' }
      ]

      const missingHeaders = requiredHeaders.filter(req => !headers.some(h => h.includes(req.key)))

      if (missingHeaders.length > 0) {
        alert(`File không đúng mẫu! Thiếu các cột: ${missingHeaders.map(m => m.label).join(', ')}.`)
        setIsEmpSalaryImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)
      const parsedData = []

      for (const row of dataRows) {
        const empId = String(row[headers.findIndex(h => h.includes('mã nhân viên'))] || '').trim()
        const pos = String(row[headers.findIndex(h => h.includes('vị trí'))] || '').trim()
        const shift = String(row[headers.findIndex(h => h.includes('ca'))] || '').trim()
        const level = String(row[headers.findIndex(h => h.includes('bậc'))] || '').trim()
        const dateRaw = row[headers.findIndex(h => h.includes('ngày hiệu lực'))]

        if (!empId || !pos) continue

        const empExists = employees.find(e => e.id === empId)
        const gradeExists = salaryGrades.find(g =>
          String(g.position).trim().toLowerCase() === pos.toLowerCase() &&
          String(g.shift).trim().toLowerCase() === shift.toLowerCase() &&
          String(g.level).trim() === level
        )

        let note = ''
        if (!empExists) note += 'Mã NV không tồn tại. '
        if (!gradeExists) note += 'Không tìm thấy Bậc lương phù hợp. '

        let effectiveDate = new Date().toISOString().split('T')[0]
        if (dateRaw) effectiveDate = String(dateRaw)

        parsedData.push({
          employeeId: empId,
          salaryGradeId: gradeExists ? gradeExists.id : null,
          effectiveDate,
          employeeName: empExists ? (empExists.ho_va_ten || empExists.name) : 'Unknown',
          gradeName: gradeExists ? `${gradeExists.position} - Bậc ${gradeExists.level}` : 'Unknown',
          isValid: !note,
          note
        })
      }

      setEmpSalaryImportPreviewData(parsedData)
      setIsEmpSalaryImporting(false)
    } catch (error) {
      alert('Lỗi đọc file: ' + error.message)
      setIsEmpSalaryImporting(false)
    }
  }

  const handleConfirmEmpSalaryImport = async () => {
    const validData = empSalaryImportPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ để import')
      return
    }

    if (!confirm(`Xác nhận import ${validData.length} dòng hợp lệ?`)) return

    setIsEmpSalaryImporting(true)
    try {
      for (const item of validData) {
        // Save salary
        const salaryPayload = {
          employeeId: item.employeeId,
          salaryGradeId: item.salaryGradeId,
          effectiveDate: item.effectiveDate
        }
        await fbPush('hr/employeeSalaries', salaryPayload)

        // Auto create promotion history
        const historyPayload = {
          employeeId: item.employeeId,
          salaryGradeId: item.salaryGradeId,
          effectiveDate: item.effectiveDate,
          type: 'Điều chỉnh',
          reason: 'Import từ Excel',
          approvedBy: 'System'
        }
        await fbPush('hr/promotionHistory', historyPayload)
      }
      alert('Import thành công!')
      setIsEmpSalaryImportModalOpen(false)
      setEmpSalaryImportPreviewData([])
      setEmpSalaryImportFile(null)
      loadData()
    } catch (err) {
      alert('Lỗi import: ' + err.message)
    } finally {
      setIsEmpSalaryImporting(false)
    }
  }

  // --- Promotion History Excel Functions ---

  const exportHistoryToExcel = () => {
    if (promotionHistory.length === 0) {
      alert('Không có dữ liệu để xuất!')
      return
    }

    const exportData = promotionHistory.map((item, idx) => {
      const employee = employees.find(e => e.id === item.employeeId)
      const grade = salaryGrades.find(g => g.id === item.salaryGradeId)

      return {
        'STT': idx + 1,
        'Mã NV': item.employeeId || '',
        'Họ tên': employee ? (employee.ho_va_ten || employee.name || '') : '',
        'Bộ phận': employee ? (employee.bo_phan || '') : '',
        'Vị trí': grade ? (grade.position || grade.name || '') : '',
        'Ca': grade ? (grade.shift || '') : '',
        'Bậc': grade ? (grade.level || '') : '',
        'Lương cơ bản': grade ? (grade.salary || 0) : 0,
        'Ngày thay đổi': item.effectiveDate || '',
        'Hình thức': item.type || item.hinhThuc || '',
        'Lý do': item.reason || item.lyDo || ''
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lich_su_thang_tien')
    XLSX.writeFile(wb, `Lich_su_thang_tien_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const downloadHistoryTemplate = () => {
    const data = [
      ['Mã nhân viên', 'Vị trí', 'Ca làm việc', 'Bậc', 'Ngày thay đổi (YYYY-MM-DD)', 'Hình thức', 'Lý do'],
      ['NV001', 'Nhân viên kinh doanh', 'Ca ngày', '1', '2024-01-01', 'Điều chỉnh', 'Tăng lương định kỳ'],
      ['NV002', 'Công nhân', 'Ca đêm', '2', '2024-01-01', 'Thăng cấp', 'Hoàn thành xuất sắc nhiệm vụ']
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_import_lich_su')
    XLSX.writeFile(wb, 'Mau_import_lich_su_thang_tien.xlsx')
  }

  const handleHistoryFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setHistoryImportFile(file)
    setIsHistoryImporting(true)

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        alert('File không có dữ liệu')
        setIsHistoryImporting(false)
        return
      }

      const headers = jsonData[0].map(h => String(h).toLowerCase().trim())

      const requiredHeaders = [
        { key: 'mã nhân viên', label: 'Mã nhân viên' },
        { key: 'vị trí', label: 'Vị trí' },
        { key: 'ca', label: 'Ca làm việc' },
        { key: 'bậc', label: 'Bậc' }
      ]

      const missingHeaders = requiredHeaders.filter(req => !headers.some(h => h.includes(req.key)))

      if (missingHeaders.length > 0) {
        alert(`File không đúng mẫu! Thiếu các cột: ${missingHeaders.map(m => m.label).join(', ')}.`)
        setIsHistoryImporting(false)
        return
      }

      const dataRows = jsonData.slice(1)
      const parsedData = []

      for (const row of dataRows) {
        const empId = String(row[headers.findIndex(h => h.includes('mã nhân viên'))] || '').trim()
        const pos = String(row[headers.findIndex(h => h.includes('vị trí'))] || '').trim()
        const shift = String(row[headers.findIndex(h => h.includes('ca'))] || '').trim()
        const level = String(row[headers.findIndex(h => h.includes('bậc'))] || '').trim()
        const dateRaw = row[headers.findIndex(h => h.includes('ngày'))]
        const type = row[headers.findIndex(h => h.includes('hình thức'))] || 'Điều chỉnh'
        const reason = row[headers.findIndex(h => h.includes('lý do'))] || ''

        if (!empId || !pos) continue

        const empExists = employees.find(e => e.id === empId)
        const gradeExists = salaryGrades.find(g =>
          String(g.position).trim().toLowerCase() === pos.toLowerCase() &&
          String(g.shift).trim().toLowerCase() === shift.toLowerCase() &&
          String(g.level).trim() === level
        )

        let note = ''
        if (!empExists) note += 'Mã NV không tồn tại. '
        if (!gradeExists) note += 'Không tìm thấy Bậc lương tương ứng. '

        let effectiveDate = new Date().toISOString().split('T')[0]
        if (dateRaw) effectiveDate = String(dateRaw)

        parsedData.push({
          employeeId: empId,
          salaryGradeId: gradeExists ? gradeExists.id : null,
          effectiveDate,
          type,
          reason,
          employeeName: empExists ? (empExists.ho_va_ten || empExists.name) : 'Unknown',
          gradeName: gradeExists ? `${gradeExists.position} - Bậc ${gradeExists.level}` : 'Unknown',
          isValid: !note,
          note
        })
      }

      setHistoryImportPreviewData(parsedData)
      setIsHistoryImporting(false)
    } catch (error) {
      alert('Lỗi đọc file: ' + error.message)
      setIsHistoryImporting(false)
    }
  }

  const handleConfirmHistoryImport = async () => {
    const validData = historyImportPreviewData.filter(d => d.isValid)
    if (validData.length === 0) {
      alert('Không có dữ liệu hợp lệ để import')
      return
    }

    if (!confirm(`Xác nhận import ${validData.length} lịch sử thăng tiến?`)) return

    setIsHistoryImporting(true)
    try {
      for (const item of validData) {
        const payload = {
          employeeId: item.employeeId,
          salaryGradeId: item.salaryGradeId,
          effectiveDate: item.effectiveDate,
          type: item.type,
          reason: item.reason,
          approvedBy: 'System Import'
        }
        await fbPush('hr/promotionHistory', payload)
      }
      alert('Import thành công!')
      setIsHistoryImportModalOpen(false)
      setHistoryImportPreviewData([])
      setHistoryImportFile(null)
      loadData()
    } catch (err) {
      alert('Lỗi import: ' + err.message)
    } finally {
      setIsHistoryImporting(false)
    }
  }


  const handleDeletePromotionHistory = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa lịch sử thăng tiến này?')) return
    try {
      await fbDelete(`hr/promotionHistory/${id}`)
      setPromotionHistory(prev => prev.filter(item => item.id !== id))
      alert('Đã xóa lịch sử thăng tiến')
    } catch (error) {
      alert('Lỗi khi xóa: ' + error.message)
    }
  }



  if (loading) {
    return <div className="loadingState">Đang tải dữ liệu...</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-dollar-sign"></i>
          Bậc lương & Thăng tiến
        </h1>
        {activeTab === 'grades' && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedGrade(null)
                setIsGradeModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Thêm bậc lương
            </button>
            <SeedDataButton />
            <button
              className="btn"
              onClick={exportGradesToExcel}
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
              onClick={downloadGradeTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsGradeImportModalOpen(true)}
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
        {activeTab === 'employee-salary' && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedEmployeeSalary(null)
                setIsEmployeeSalaryModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Gán bậc lương NV
            </button>
            <button
              className="btn"
              onClick={exportEmpSalariesToExcel}
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
              onClick={downloadEmpSalaryTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsEmpSalaryImportModalOpen(true)}
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
        {activeTab === 'promotions' && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedPromotion(null)
                setIsPromotionModalOpen(true)
              }}
            >
              <i className="fas fa-plus"></i>
              Thêm lịch sử thăng tiến
            </button>
            <SeedPromotionHistoryButton
              employees={employees}
              salaryGrades={salaryGrades}
              onComplete={loadData}
            />
            <button
              className="btn"
              onClick={exportHistoryToExcel}
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
              onClick={downloadHistoryTemplate}
              style={{ marginLeft: '10px' }}
            >
              <i className="fas fa-download"></i> Tải mẫu
            </button>
            <button
              className="btn"
              onClick={() => setIsHistoryImportModalOpen(true)}
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

      </div>

      <div className="tabs">
        <div
          className={`tab ${activeTab === 'grades' ? 'active' : ''}`}
          onClick={() => setActiveTab('grades')}
        >
          📊 Danh mục bậc lương
        </div>
        <div
          className={`tab ${activeTab === 'employee-salary' ? 'active' : ''}`}
          onClick={() => setActiveTab('employee-salary')}
        >
          👤 Bậc lương NV
        </div>
        <div
          className={`tab ${activeTab === 'promotions' ? 'active' : ''}`}
          onClick={() => setActiveTab('promotions')}
        >
          📈 Lịch sử thăng tiến
        </div>

      </div>

      {/* Tab 1: Danh mục bậc lương */}
      {activeTab === 'grades' && (
        <div className="card">
          <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
            <table style={{ minWidth: '101%', marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                  <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                  <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ca làm việc</th>
                  <th style={{ minWidth: '180px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Doanh thu từ (triệu/tháng)</th>
                  <th style={{ minWidth: '180px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Doanh thu đến (triệu/tháng)</th>
                  <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bậc lương</th>
                  <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Lương P1 (VNĐ)</th>
                  <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Trạng thái</th>
                  <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {salaryGrades.length > 0 ? (
                  salaryGrades
                    .sort((a, b) => (a.level || 0) - (b.level || 0))
                    .map((grade, idx) => (
                      <tr key={grade.id}>
                        <td>{idx + 1}</td>
                        <td>{grade.position || grade.name || '-'}</td>
                        <td>{grade.shift || 'Ca ngày'}</td>
                        <td>{grade.revenueFrom || 0}</td>
                        <td>{grade.revenueTo === null || grade.revenueTo === undefined || grade.revenueTo === '' ? 'Không giới hạn' : grade.revenueTo}</td>
                        <td>Bậc {grade.level || 1}</td>
                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {formatMoney(grade.salary || 0)}
                        </td>
                        <td>
                          <span className={`badge ${grade.status === 'Đang áp dụng' ? 'badge-success' : 'badge-danger'}`}>
                            {grade.status || 'Đang áp dụng'}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="view"
                              onClick={() => {
                                setSelectedGrade(grade)
                                setIsGradeReadOnly(true)
                                setIsGradeModalOpen(true)
                              }}
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                            <button
                              className="edit"
                              onClick={() => {
                                setSelectedGrade(grade)
                                setIsGradeReadOnly(false)
                                setIsGradeModalOpen(true)
                              }}
                            >
                              <i className="fas fa-pencil-alt"></i>
                            </button>
                            <button
                              className="delete"
                              onClick={() => handleDeleteGrade(grade.id)}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan="9" className="empty-state">Chưa có bậc lương</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
      }

      {/* Tab 2: Bậc lương nhân viên */}
      {
        activeTab === 'employee-salary' && (
          <div className="card">
            <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
              <table style={{ minWidth: '101%', marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã NV</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Họ và tên</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                    <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ca làm việc</th>
                    <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bậc lương P1</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Lương P1 (VNĐ)</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ngày hiệu lực</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeSalaries.length > 0 ? (
                    employeeSalaries.map((empSal, idx) => {
                      const employee = employees.find(e => e.id === empSal.employeeId)
                      const grade = salaryGrades.find(g => g.id === empSal.salaryGradeId)
                      return (
                        <tr key={empSal.id}>
                          <td>{idx + 1}</td>
                          <td>{empSal.employeeId || '-'}</td>
                          <td>{employee ? (employee.ho_va_ten || employee.name || '-') : '-'}</td>
                          <td>{employee ? (employee.bo_phan || '-') : '-'}</td>
                          <td>{employee ? (employee.vi_tri || '-') : '-'}</td>
                          <td>{grade ? (grade.shift || 'Ca ngày') : '-'}</td>
                          <td>{grade ? `Bậc ${grade.level || 1}` : '-'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {grade ? formatMoney(grade.salary || 0) : '-'}
                          </td>
                          <td>{empSal.effectiveDate || '-'}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="view"
                                onClick={() => {
                                  setSelectedEmployeeSalary(empSal)
                                  setIsEmployeeSalaryReadOnly(true)
                                  setIsEmployeeSalaryModalOpen(true)
                                }}
                              >
                                <i className="fas fa-eye"></i>
                              </button>
                              <button
                                className="edit"
                                onClick={() => {
                                  setSelectedEmployeeSalary(empSal)
                                  setIsEmployeeSalaryReadOnly(false)
                                  setIsEmployeeSalaryModalOpen(true)
                                }}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                className="delete"
                                onClick={() => handleDeleteEmployeeSalary(empSal.id)}
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
                      <td colSpan="10" className="empty-state">Chưa có bậc lương nhân viên</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div >
        )
      }

      {/* Tab 3: Lịch sử thăng tiến */}
      {
        activeTab === 'promotions' && (
          <div className="card">
            <div style={{ overflowX: 'scroll', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', border: '1px solid #e0e0e0' }}>
              <table style={{ minWidth: '101%', marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '50px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>STT</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Mã NV</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Họ và tên</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bộ phận</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Vị trí</th>
                    <th style={{ minWidth: '120px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ca làm việc</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Bậc lương</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Lương P1 (VNĐ)</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Ngày thay đổi</th>
                    <th style={{ minWidth: '150px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Hình thức</th>
                    <th style={{ minWidth: '200px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Lý do điều chỉnh</th>
                    <th style={{ minWidth: '100px', position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {promotionHistory.length > 0 ? (
                    promotionHistory
                      .sort((a, b) => new Date(b.effectiveDate || 0) - new Date(a.effectiveDate || 0))
                      .map((history, idx) => {
                        const employee = employees.find(e => e.id === history.employeeId)
                        const grade = salaryGrades.find(g => g.id === history.salaryGradeId)
                        return (
                          <tr key={history.id}>
                            <td>{idx + 1}</td>
                            <td>{history.employeeId || '-'}</td>
                            <td>{employee ? (employee.ho_va_ten || employee.name || '-') : '-'}</td>
                            <td>{employee ? (employee.bo_phan || '-') : '-'}</td>
                            <td>{employee ? (employee.vi_tri || '-') : '-'}</td>
                            <td>{grade ? (grade.shift || 'Ca ngày') : '-'}</td>
                            <td>{grade ? `Bậc ${grade.level || 1}` : '-'}</td>
                            <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                              {grade ? formatMoney(grade.salary || 0) : '-'}
                            </td>
                            <td>
                              {history.effectiveDate
                                ? new Date(history.effectiveDate).toLocaleDateString('vi-VN')
                                : '-'}
                            </td>
                            <td>{history.type || history.hinhThuc || '-'}</td>
                            <td>{history.reason || history.lyDo || '-'}</td>
                            <td>
                              <div className="actions">
                                <button
                                  className="view"
                                  onClick={() => {
                                    setSelectedEmployeeForHistory(history)
                                    setIsHistoryModalOpen(true)
                                  }}
                                >
                                  <i className="fas fa-eye"></i>
                                </button>
                                <button
                                  className="edit"
                                  onClick={() => {
                                    setSelectedPromotion(history)
                                    setIsPromotionModalOpen(true)
                                  }}
                                >
                                  <i className="fas fa-pencil-alt"></i>
                                </button>
                                <button
                                  className="delete"
                                  onClick={() => handleDeletePromotionHistory(history.id)}
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
                      <td colSpan="12" className="empty-state">Chưa có lịch sử thăng tiến</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div >
        )
      }






      <SalaryGradeModal
        grade={selectedGrade}
        isOpen={isGradeModalOpen}
        onClose={() => {
          setIsGradeModalOpen(false)
          setSelectedGrade(null)
          setIsGradeReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isGradeReadOnly}
      />

      <EmployeeSalaryModal
        employeeSalary={selectedEmployeeSalary}
        employees={employees}
        salaryGrades={salaryGrades}
        isOpen={isEmployeeSalaryModalOpen}
        onClose={() => {
          setIsEmployeeSalaryModalOpen(false)
          setSelectedEmployeeSalary(null)
          setIsEmployeeSalaryReadOnly(false)
        }}
        onSave={loadData}
        readOnly={isEmployeeSalaryReadOnly}
      />

      <PromotionHistoryModal
        history={selectedEmployeeForHistory}
        employee={selectedEmployeeForHistory ? employees.find(e => e.id === selectedEmployeeForHistory.employeeId) : null}
        promotionHistory={promotionHistory}
        salaryGrades={salaryGrades}
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false)
          setSelectedEmployeeForHistory(null)
        }}
      />

      <PromotionModal
        promotion={selectedPromotion}
        employees={employees}
        salaryGrades={salaryGrades}
        isOpen={isPromotionModalOpen}
        onClose={() => {
          setIsPromotionModalOpen(false)
          setSelectedPromotion(null)
        }}
        onSave={loadData}
      />






      {
        isGradeImportModalOpen && (
          <div className="modal show" onClick={() => setIsGradeImportModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
              <div className="modal-header">
                <h3>Import Bậc Lương</h3>
                <button className="modal-close" onClick={() => setIsGradeImportModalOpen(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <input type="file" onChange={handleGradeFileSelect} accept=".xlsx,.xls" />

                {gradeImportPreviewData.length > 0 && (
                  <div style={{ marginTop: '15px', maxHeight: '300px', overflow: 'auto' }}>
                    <table className="table table-bordered">
                      <thead>
                        <tr>
                          <th>Vị trí</th>
                          <th>Ca</th>
                          <th>Bậc</th>
                          <th>Lương P1</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeImportPreviewData.map((d, i) => (
                          <tr key={i}>
                            <td>{d.position}</td>
                            <td>{d.shift}</td>
                            <td>{d.level}</td>
                            <td>{formatMoney(d.salary)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: '15px', textAlign: 'right' }}>
                  <button className="btn" onClick={() => setIsGradeImportModalOpen(false)}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmGradeImport}
                    disabled={isGradeImporting || gradeImportPreviewData.length === 0}
                    style={{ marginLeft: '10px' }}
                  >
                    {isGradeImporting ? 'Đang import...' : 'Xác nhận'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        isEmpSalaryImportModalOpen && (
          <div className="modal show" onClick={() => setIsEmpSalaryImportModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
              <div className="modal-header">
                <h3>Import Bậc Lương Nhân Viên</h3>
                <button className="modal-close" onClick={() => setIsEmpSalaryImportModalOpen(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  Vui lòng sử dụng file mẫu để đảm bảo định dạng dữ liệu chính xác.
                </div>
                <input type="file" onChange={handleEmpSalaryFileSelect} accept=".xlsx,.xls" />

                {empSalaryImportPreviewData.length > 0 && (
                  <div style={{ marginTop: '15px', maxHeight: '400px', overflow: 'auto' }}>
                    <table className="table table-bordered">
                      <thead>
                        <tr>
                          <th>Mã NV</th>
                          <th>Nhân viên</th>
                          <th>Bậc lương</th>
                          <th>Ngày hiệu lực</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empSalaryImportPreviewData.map((d, i) => (
                          <tr key={i} style={{ backgroundColor: d.isValid ? 'transparent' : '#fff3f3' }}>
                            <td>{d.employeeId}</td>
                            <td>{d.employeeName}</td>
                            <td>{d.gradeName}</td>
                            <td>{d.effectiveDate}</td>
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
                  <button className="btn" onClick={() => setIsEmpSalaryImportModalOpen(false)}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmEmpSalaryImport}
                    disabled={isEmpSalaryImporting || empSalaryImportPreviewData.filter(d => d.isValid).length === 0}
                    style={{ marginLeft: '10px' }}
                  >
                    {isEmpSalaryImporting ? 'Đang import...' : 'Xác nhận Import'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        isHistoryImportModalOpen && (
          <div className="modal show" onClick={() => setIsHistoryImportModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
              <div className="modal-header">
                <h3>Import Lịch Sử Thăng Tiến</h3>
                <button className="modal-close" onClick={() => setIsHistoryImportModalOpen(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  Vui lòng sử dụng file mẫu. Hệ thống sẽ tự tìm Bậc lương dựa trên Vị trí, Ca và Bậc.
                </div>
                <input type="file" onChange={handleHistoryFileSelect} accept=".xlsx,.xls" />

                {historyImportPreviewData.length > 0 && (
                  <div style={{ marginTop: '15px', maxHeight: '400', overflow: 'auto' }}>
                    <table className="table table-bordered">
                      <thead>
                        <tr>
                          <th>Mã NV</th>
                          <th>Nhân viên</th>
                          <th>Bậc lương</th>
                          <th>Ngày</th>
                          <th>Hình thức</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyImportPreviewData.map((d, i) => (
                          <tr key={i} style={{ backgroundColor: d.isValid ? 'transparent' : '#fff3f3' }}>
                            <td>{d.employeeId}</td>
                            <td>{d.employeeName}</td>
                            <td>{d.gradeName}</td>
                            <td>{d.effectiveDate}</td>
                            <td>{d.type}</td>
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
                  <button className="btn" onClick={() => setIsHistoryImportModalOpen(false)}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmHistoryImport}
                    disabled={isHistoryImporting || historyImportPreviewData.filter(d => d.isValid).length === 0}
                    style={{ marginLeft: '10px' }}
                  >
                    {isHistoryImporting ? 'Đang import...' : 'Xác nhận Import'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

    </div >
  )
}

export default Salary
