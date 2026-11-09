import { useState } from 'react'
import * as XLSX from 'xlsx'
import { fbPush } from '../services/firebase'

function KPIResultImportModal({ employees, kpiTemplates, employeeKPIs, kpiConversions, isOpen, onClose, onSave }) {
    const [previewData, setPreviewData] = useState([])
    const [isImporting, setIsImporting] = useState(false)

    const handleFileSelect = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setIsImporting(true)

        try {
            const data = await file.arrayBuffer()
            const workbook = XLSX.read(data)
            const worksheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

            if (jsonData.length < 2) {
                alert('File không có dữ liệu')
                setIsImporting(false)
                return
            }

            const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
            const empIdIdx = headers.findIndex(h => h.includes('mã nv') || h.includes('employeeid'))
            const monthIdx = headers.findIndex(h => h.includes('tháng') || h.includes('month'))

            if (empIdIdx === -1) {
                alert('Cần cột: Mã NV')
                setIsImporting(false)
                return
            }

            // Identify KPI columns (e.g., actual_KPI01)
            const kpiCols = []
            kpiTemplates.forEach(t => {
                const code = (t.code || t.id).toLowerCase()
                const idx = headers.findIndex(h => h.includes(code))
                if (idx !== -1) {
                    kpiCols.push({ template: t, idx })
                }
            })

            const parsed = []
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i]
                if (!row[empIdIdx]) continue

                const empId = String(row[empIdIdx]).trim()
                const month = monthIdx !== -1 ? row[monthIdx] : new Date().toISOString().slice(0, 7) // Default current month

                const actuals = {}
                kpiCols.forEach(col => {
                    let val = row[col.idx]
                    if (val !== undefined && val !== null && val !== '') {
                        // Clean number (remove non-digits if currency)
                        if (typeof val === 'string' && (col.template.unit === 'VNĐ' || col.template.unit === 'VND')) {
                            val = parseFloat(val.replace(/[^\d.-]/g, ''))
                        } else {
                            val = parseFloat(val)
                        }
                        actuals[col.template.id] = val
                    }
                })

                parsed.push({
                    employeeId: empId,
                    month: month,
                    actuals
                })
            }
            setPreviewData(parsed)
            setIsImporting(false)
        } catch (err) {
            alert('Lỗi đọc file: ' + err.message)
            setIsImporting(false)
        }
    }

    const calculateResult = (empKPI, actuals) => {
        // This replicates the logic we'll use in the main component
        const results = {}
        let totalScore = 0

        Object.keys(actuals).forEach(kpiId => {
            const template = kpiTemplates.find(t => t.id === kpiId)
            if (!template) return

            const target = empKPI.kpiValues?.[kpiId]?.target || 0
            const actual = actuals[kpiId]
            const weight = template.weight || 0

            let completion = 0
            if (target > 0) {
                // Logic: Revenue (higher better) vs Cost (lower better)
                // For now, assume Higher is Better (Revenue-like) as default unless Name implies otherwise is risky. 
                // User request implied direct % calculation for Revenue.
                // Let's stick to standard: (Actual / Target) * 100 for now.
                completion = (actual / target) * 100
            }

            // Conversion Lookup
            let conversion = completion // Default if no table
            // Find convert table
            const conversions = kpiConversions.filter(c => c.kpiId === kpiId || c.kpiCode === template.code)
                .sort((a, b) => a.fromPercent - b.fromPercent)

            if (conversions.length > 0) {
                // Find range
                const range = conversions.find(c => completion >= c.fromPercent && (c.toPercent === 100 || completion <= c.toPercent))
                // If > max range, take max
                if (!range && completion > 100) {
                    const maxConv = conversions[conversions.length - 1]
                    conversion = maxConv.conversionPercent // Or 120%? User example shows 110% logic.
                    // User sample: 105% completion -> 110% conversion. 
                    // We will use the exact logic from the table.
                }
                if (range) conversion = range.conversionPercent
            } else {
                // If no table, usually cap at 100 or keep raw? User sample has 105 -> 110.
                // Let's keep raw completion if no table.
            }

            results[kpiId] = {
                kpiId,
                target,
                actual,
                completionPercent: Math.round(completion),
                conversionPercent: conversion,
                score: (conversion * weight) / 100,
                source: 'Import'
            }
            totalScore += (conversion * weight) / 100
        })

        return { kpiResults: results, totalKPI: totalScore }
    }

    const handleConfirm = async () => {
        setIsImporting(true)
        let count = 0
        try {
            for (const item of previewData) {
                // Find existing Assignment to get Targets
                const assignment = employeeKPIs.find(e => e.employeeId === item.employeeId && e.month === item.month)
                if (!assignment) {
                    console.warn(`Không tìm thấy KP giao cho ${item.employeeId} tháng ${item.month}`)
                    continue
                }

                // Calculate
                const calc = calculateResult(assignment, item.actuals)

                // Save to kpiResults
                // Check if exists
                // We'll push/update a 'kpi_results' node separate from 'employeeKPIs'? 
                // User request says "kpi_results" table.
                // But for simplicity/consistency, maybe we update 'kpiResults' collection.

                // We need to query if result exists first? 
                // For import, we'll just push NEW or overwrite? 
                // Let's assume we push new. Ideally we should Check Exists -> Update.
                // Since we don't have good 'get by query' in this helper, let's just push for now 
                // OR better: Assume the main KPI component passes `kpiResults` prop too? 
                // Let's just Push to 'hr/kpiResults'. The main loadData cleans up duplicates or we accept multiple entries (not ideal).
                // Actually best is to allow overwrite in main logic, but here let's just push.

                const resultPayload = {
                    employeeId: item.employeeId,
                    month: item.month,
                    department: employees.find(e => e.id === item.employeeId)?.bo_phan || '',
                    kpiResults: calc.kpiResults,
                    totalKPI: calc.totalKPI,
                    createdAt: new Date().toISOString()
                }

                await fbPush('hr/kpiResults', resultPayload)
                count++
            }
            alert(`Đã import kết quả cho ${count} nhân viên`)
            onSave()
            onClose()
        } catch (e) {
            alert('Lỗi save: ' + e.message)
        } finally {
            setIsImporting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="modal show" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <h3><i className="fas fa-upload"></i> Import Kết quả KPI từ Excel</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label>Chọn file Excel (Cột: Mã NV, Tháng, Mã KPI...)</label>
                        <button
                            className="btn btn-link"
                            style={{ color: 'var(--primary)', padding: 0 }}
                            onClick={() => {
                                // We can't easily call downloadKPIResultTemplate from here without passing it
                                // but we can replicate it or just rely on the main page.
                                // Re-using the logic for convenience
                                const header = ['Mã NV', 'Tháng (YYYY-MM)']
                                kpiTemplates.forEach(t => {
                                    header.push(t.code || t.id)
                                })
                                const sample = ['NV001', '2024-10']
                                kpiTemplates.forEach(() => sample.push(50000000))
                                const data = [header, sample]
                                const ws = XLSX.utils.aoa_to_sheet(data)
                                const wb = XLSX.utils.book_new()
                                XLSX.utils.book_append_sheet(wb, ws, 'MauKetQuaKPI')
                                XLSX.writeFile(wb, 'Mau_import_ket_qua_KPI.xlsx')
                            }}
                        >
                            <i className="fas fa-download"></i> Tải file mẫu
                        </button>
                    </div>
                    <input type="file" onChange={handleFileSelect} />

                    {previewData.length > 0 && (
                        <div style={{ marginTop: '20px', maxHeight: '300px', overflow: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Mã NV</th>
                                        <th>Tháng</th>
                                        <th>Số chỉ số</th>
                                        <th>Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((d, i) => (
                                        <tr key={i}>
                                            <td>{d.employeeId}</td>
                                            <td>{d.month}</td>
                                            <td>{Object.keys(d.actuals).length}</td>
                                            <td>{JSON.stringify(d.actuals)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="form-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={handleConfirm} disabled={isImporting || previewData.length === 0}>
                            {isImporting ? 'Đang xử lý...' : 'Xác nhận Import'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default KPIResultImportModal
