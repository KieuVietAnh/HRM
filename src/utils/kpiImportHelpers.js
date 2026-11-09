import * as XLSX from 'xlsx'
import { fbPush } from '../services/firebase'

// Handle Excel import for KPI Templates (Bảng 1)
export const handleTemplateFileSelect = async (e, setIsTemplateImporting, setTemplateImportPreviewData) => {
    const file = e.target.files[0]
    if (!file) return

    setIsTemplateImporting(true)
    try {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

        if (jsonData.length < 2) {
            alert('File Excel không có dữ liệu')
            setIsTemplateImporting(false)
            return
        }

        const headers = jsonData[0].map(h => String(h).toLowerCase().trim())

        const codeIdx = headers.findIndex(h => h.includes('mã') && h.includes('kpi') || h.includes('code'))
        const nameIdx = headers.findIndex(h => (h.includes('tên') || h.includes('ten')) && h.includes('kpi') || h === 'name')
        const unitIdx = headers.findIndex(h => h.includes('đơn vị') || h.includes('don vi') || h === 'unit')
        const targetIdx = headers.findIndex(h => h.includes('đối tượng') || h.includes('doi tuong') || h === 'target')
        const weightIdx = headers.findIndex(h => h.includes('trọng số') || h.includes('trong so') || h === 'weight')
        const monthIdx = headers.findIndex(h => h.includes('tháng') || h.includes('thang') || h === 'month')
        const statusIdx = headers.findIndex(h => h.includes('trạng thái') || h.includes('trang thai') || h === 'status')

        if (codeIdx === -1 || nameIdx === -1) {
            alert('File Excel cần có các cột: Mã KPI, Tên KPI')
            setIsTemplateImporting(false)
            return
        }

        const parsedData = []
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i]
            if (!row[codeIdx] || !row[nameIdx]) continue

            parsedData.push({
                code: row[codeIdx] || '',
                name: row[nameIdx] || '',
                unit: unitIdx !== -1 ? (row[unitIdx] || '') : '',
                target: targetIdx !== -1 ? (row[targetIdx] || '') : '',
                weight: weightIdx !== -1 ? Number(row[weightIdx]) || 0 : 0,
                month: monthIdx !== -1 ? (row[monthIdx] || '') : '',
                status: statusIdx !== -1 ? (row[statusIdx] || 'Đang áp dụng') : 'Đang áp dụng'
            })
        }

        setTemplateImportPreviewData(parsedData)
        setIsTemplateImporting(false)
    } catch (error) {
        alert('Lỗi khi đọc file: ' + error.message)
        setIsTemplateImporting(false)
    }
}

export const handleConfirmTemplateImport = async (templateImportPreviewData, setIsTemplateImporting, setIsTemplateImportModalOpen, setTemplateImportPreviewData, loadData) => {
    if (templateImportPreviewData.length === 0) {
        alert('Không có dữ liệu để import')
        return
    }

    setIsTemplateImporting(true)
    try {
        let successCount = 0
        for (const template of templateImportPreviewData) {
            await fbPush('hr/kpiTemplates', template)
            successCount++
        }

        alert(`Đã import thành công ${successCount} KPI`)
        setIsTemplateImportModalOpen(false)
        setTemplateImportPreviewData([])
        await loadData()
    } catch (error) {
        alert('Lỗi khi import: ' + error.message)
    } finally {
        setIsTemplateImporting(false)
    }
}

export const handleEmployeeKPIFileSelect = async (e, employees, kpiTemplates, setIsEmployeeKPIImporting, setEmployeeKPIImportPreviewData) => {
    const file = e.target.files[0]
    if (!file) return

    setIsEmployeeKPIImporting(true)
    try {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

        if (jsonData.length < 2) {
            alert('File Excel không có dữ liệu')
            setIsEmployeeKPIImporting(false)
            return
        }

        const headers = jsonData[0].map(h => String(h).toLowerCase().trim())

        const empIdIdx = headers.findIndex(h => (h.includes('mã') && h.includes('nv')) || h.includes('employeeid') || h === 'employee id')
        const monthIdx = headers.findIndex(h => h.includes('tháng') || h.includes('thang') || h === 'month')
        const statusIdx = headers.findIndex(h => h.includes('trạng thái') || h.includes('trang thai') || h === 'status')

        if (empIdIdx === -1) {
            alert('File Excel cần có cột: Mã NV')
            setIsEmployeeKPIImporting(false)
            return
        }

        const kpiColumns = []
        kpiTemplates.forEach(template => {
            const kpiCode = (template.code || template.id || '').toLowerCase()
            const idx = headers.findIndex(h => h.includes(kpiCode))
            if (idx !== -1) {
                kpiColumns.push({
                    kpiId: template.id,
                    kpiCode: template.code,
                    columnIndex: idx
                })
            }
        })

        const parsedData = []
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i]
            if (!row[empIdIdx]) continue

            const empId = String(row[empIdIdx]).trim()
            const employee = employees.find(e => e.id === empId)

            if (!employee) {
                console.warn(`Không tìm thấy nhân viên với mã: ${empId}`)
                continue
            }

            const kpiValues = {}
            kpiColumns.forEach(kpiCol => {
                const value = row[kpiCol.columnIndex]
                if (value !== undefined && value !== null && value !== '') {
                    kpiValues[kpiCol.kpiId] = {
                        kpiId: kpiCol.kpiId,
                        target: Number(value) || value,
                        weight: kpiTemplates.find(t => t.id === kpiCol.kpiId)?.weight || 0
                    }
                }
            })

            parsedData.push({
                employeeId: empId,
                employeeName: employee.ho_va_ten || employee.name || '',
                department: employee.bo_phan || '',
                month: monthIdx !== -1 ? (row[monthIdx] || '') : '',
                status: statusIdx !== -1 ? (row[statusIdx] || 'Chưa chốt') : 'Chưa chốt',
                kpiValues
            })
        }

        setEmployeeKPIImportPreviewData(parsedData)
        setIsEmployeeKPIImporting(false)
    } catch (error) {
        alert('Lỗi khi đọc file: ' + error.message)
        setIsEmployeeKPIImporting(false)
    }
}

export const handleConfirmEmployeeKPIImport = async (employeeKPIImportPreviewData, setIsEmployeeKPIImporting, setIsEmployeeKPIImportModalOpen, setEmployeeKPIImportPreviewData, loadData) => {
    if (employeeKPIImportPreviewData.length === 0) {
        alert('Không có dữ liệu để import')
        return
    }

    setIsEmployeeKPIImporting(true)
    try {
        let successCount = 0
        for (const empKPI of employeeKPIImportPreviewData) {
            const { employeeName, department, ...dataToSave } = empKPI
            await fbPush('hr/employeeKPIs', dataToSave)
            successCount++
        }

        alert(`Đã import thành công ${successCount} KPI nhân viên`)
        setIsEmployeeKPIImportModalOpen(false)
        setEmployeeKPIImportPreviewData([])
        await loadData()
    } catch (error) {
        alert('Lỗi khi import: ' + error.message)
    } finally {
        setIsEmployeeKPIImporting(false)
    }
}
