import { formatMoney } from '../utils/helpers'

import { useEffect, useState } from 'react'
import { fbUpdate } from '../services/firebase'

function KPIResultDetailModal({ result, employees, employeeKPIs, kpiTemplates, isOpen, onClose, kpiConversions = [], isEditing = false, onSave }) {
    const [editedResults, setEditedResults] = useState({})

    useEffect(() => {
        if (isOpen && result && result.kpiResults) {
            setEditedResults(JSON.parse(JSON.stringify(result.kpiResults)))
        }
    }, [isOpen, result])

    if (!isOpen || !result) return null

    const employee = employees.find(e => e.id === result.employeeId)

    // Helper to find Assignment Record
    const getAssignment = () => {
        if (!result || !employeeKPIs) return null
        return employeeKPIs.find(e => e.employeeId === result.employeeId && e.month === result.month)
    }

    // Helper to get Target & Weight from Assignment (Table 2)
    // If NOT found in Assignment, fallback to Template default or existing Result
    const getKPIParams = (kpiId) => {
        const assignment = getAssignment()
        const assignedVal = assignment?.kpiValues?.[kpiId]

        // Priority: Assignment Table 2 > Template Default > Existing Result Stored Value
        const template = kpiTemplates.find(t => t.id === kpiId || t.code === kpiId)

        // Target: Must come from Assignment to be "Linked"
        const target = assignedVal?.target !== undefined ? assignedVal.target : (template?.target || 0)

        // Weight: Must come from Assignment
        const weight = assignedVal?.weight !== undefined ? assignedVal.weight : (template?.weight || 0)

        return { target: Number(target), weight: Number(weight) }
    }

    const calculateTotalScore = () => {
        if (!editedResults) return 0
        return Object.values(editedResults).reduce((sum, res) => {
            const { weight } = getKPIParams(res.kpiId || res.kpiCode) // Fetch live weight
            const conversion = res.conversionPercent || 0
            return sum + (conversion * weight / 100)
        }, 0)
    }

    const currentTotalScore = calculateTotalScore()

    const getConversion = (kpiId, actual, target) => {
        const template = kpiTemplates.find(t => t.id === kpiId || t.code === kpiId)
        if (!template) return 0
        const conversions = kpiConversions.filter(c => c.kpiId === template.id || c.kpiCode === template.code)

        let percent = 0
        if (target > 0) percent = (actual / target) * 100

        // Sort conversions by fromPercent ASCENDING to match user expectation (lower range first on overlap)
        const sortedConversions = [...conversions].sort((a, b) => parseFloat(a.fromPercent) - parseFloat(b.fromPercent))

        const match = sortedConversions.find(c => {
            const from = parseFloat(c.fromPercent)
            const to = c.toPercent ? parseFloat(c.toPercent) : Infinity
            return percent >= from && percent <= to
        })

        if (match) return parseFloat(match.conversionPercent)

        // Default logic if no table match found?
        // If they have a table, but value is outside range (e.g. > max), usually capped?
        // For now return 0 or maybe the percent itself if no table exists at all?
        if (conversions.length === 0) {
            if (template.unit === 'Percent' || template.unit === '%') return parseFloat(percent.toFixed(2))
            return parseFloat(percent.toFixed(2)) // Default fallback
        }

        return 0
    }

    const handleChangeActual = (kpiId, value) => {
        const val = parseFloat(value) || 0
        setEditedResults(prev => {
            const current = prev[kpiId] || {}

            // LINKED LOGIC: Fetch Target from Assignment (Table 2)
            const { target, weight } = getKPIParams(kpiId)

            let completion = 0
            if (target !== 0) completion = (val / target) * 100

            const conversion = getConversion(kpiId, val, target)

            return {
                ...prev,
                [kpiId]: {
                    ...current,
                    kpiId, // Ensure ID is present
                    actual: val,
                    target: target, // Save the linked target for reference
                    weight: weight, // Save the linked weight
                    completionPercent: parseFloat(completion.toFixed(2)),
                    conversionPercent: conversion
                }
            }
        })
    }

    const handleSaveFunc = async () => {
        try {
            const totalKPI = calculateTotalScore()
            await fbUpdate(`hr/kpiResults/${result.id}`, {
                kpiResults: editedResults,
                totalKPI: parseFloat(totalKPI.toFixed(2))
            })
            if (onSave) onSave()
            onClose()
            alert('Đã cập nhật kết quả đánh giá')
        } catch (error) {
            alert('Lỗi cập nhật: ' + error.message)
        }
    }

    return (
        <div className="modal show" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px' }}>
                <div className="modal-header">
                    <h3>
                        <i className="fas fa-chart-line"></i>
                        {isEditing ? 'Cập nhật Kết quả KPI' : 'Chi tiết Kết quả KPI'} - {employee ? (employee.ho_va_ten || employee.name) : 'N/A'}
                    </h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '20px', background: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
                        <div><strong>Mã NV:</strong> {result.employeeId}</div>
                        <div><strong>Tháng:</strong> {result.month}</div>
                        <div><strong>Bộ phận:</strong> {employee?.bo_phan || employee?.department}</div>
                        <div><strong>Tổng điểm:</strong> <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{(isEditing ? currentTotalScore : (result.totalKPI || 0)).toFixed(1)}%</span></div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Tên KPI</th>
                                    <th>Kế hoạch</th>
                                    <th>Thực tế</th>
                                    <th>Tỷ lệ hoàn thành</th>
                                    <th>% Quy đổi KPI</th>
                                    <th>Trọng số</th>
                                    <th>Nguồn dữ liệu</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const source = isEditing ? editedResults : result.kpiResults
                                    return Object.keys(source || {}).map((kpiKey, idx) => {
                                        const kpiRes = source[kpiKey]
                                        // Find template info
                                        const template = kpiTemplates.find(t => t.id === kpiKey || t.code === kpiKey || (kpiRes && t.id === kpiRes.kpiId)) || {
                                            id: kpiKey,
                                            code: kpiKey,
                                            name: `KPI: ${kpiKey}`,
                                            unit: '',
                                            weight: 0
                                        }

                                        if (!kpiRes) return null

                                        return (
                                            <tr key={template.id}>
                                                <td>{idx + 1}</td>
                                                <td>
                                                    <div>{template.name}</div>
                                                    <small style={{ color: '#666' }}>{template.code}</small>
                                                </td>
                                                <td>
                                                    {template.unit === 'VNĐ' || template.unit === 'VND'
                                                        ? formatMoney(kpiRes.target)
                                                        : kpiRes.target} {template.unit}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            value={kpiRes.actual}
                                                            onChange={(e) => handleChangeActual(template.id, e.target.value)}
                                                            style={{ width: '100px', fontWeight: 'bold' }}
                                                        />
                                                    ) : (
                                                        <span style={{ fontWeight: 'bold' }}>
                                                            {template.unit === 'VNĐ' || template.unit === 'VND'
                                                                ? formatMoney(kpiRes.actual)
                                                                : kpiRes.actual}
                                                        </span>
                                                    )}
                                                    {template.unit !== 'VNĐ' && template.unit !== 'VND' ? ` ${template.unit}` : ''}
                                                </td>
                                                <td>
                                                    <span className={`badge ${kpiRes.completionPercent >= 100 ? 'badge-success' : 'badge-warning'}`}>
                                                        {kpiRes.completionPercent}%
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                                    {kpiRes.conversionPercent}%
                                                </td>
                                                <td>{template.weight}%</td>
                                                <td style={{ fontStyle: 'italic', color: '#666' }}>
                                                    {kpiRes.source || 'Hệ thống'}
                                                </td>
                                            </tr>
                                        )
                                    })
                                })()
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
                <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn" onClick={onClose}>Đóng</button>
                    {isEditing && (
                        <button className="btn btn-primary" onClick={handleSaveFunc}>
                            <i className="fas fa-save"></i> Lưu thay đổi
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default KPIResultDetailModal
