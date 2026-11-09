import { useEffect, useState } from 'react'
import { fbDelete, fbPush } from '../services/firebase'

function KPIConversionModal({ kpiTemplate, conversions, isOpen, onClose, onSave }) {
  const [conversionRows, setConversionRows] = useState([])

  useEffect(() => {
    if (conversions && conversions.length > 0) {
      setConversionRows(conversions.sort((a, b) => (a.fromPercent || 0) - (b.fromPercent || 0)))
    } else {
      // Default conversion rates (10 rows as requested)
      setConversionRows([
        { fromPercent: 0, toPercent: 50, conversionPercent: 30 },
        { fromPercent: 50, toPercent: 70, conversionPercent: 60 },
        { fromPercent: 70, toPercent: 80, conversionPercent: 75 },
        { fromPercent: 80, toPercent: 90, conversionPercent: 90 },
        { fromPercent: 90, toPercent: 95, conversionPercent: 100 },
        { fromPercent: 95, toPercent: 100, conversionPercent: 110 },
        { fromPercent: 0, toPercent: 0, conversionPercent: 0 },
        { fromPercent: 0, toPercent: 0, conversionPercent: 0 },
        { fromPercent: 0, toPercent: 0, conversionPercent: 0 },
        { fromPercent: 0, toPercent: 0, conversionPercent: 0 }
      ])
    }
  }, [conversions, isOpen])

  const handleChange = (index, field, value) => {
    let numericValue = parseFloat(value) || 0

    // Enforce max 100 rule only for From/To percentages
    if ((field === 'fromPercent' || field === 'toPercent') && numericValue > 100) {
      alert('Giá trị không được lớn hơn 100')
      numericValue = 100
    }

    if (numericValue < 0) numericValue = 0

    const newRows = [...conversionRows]
    newRows[index] = {
      ...newRows[index],
      [field]: numericValue
    }
    setConversionRows(newRows)
  }

  const handleAddRow = () => {
    setConversionRows([...conversionRows, { fromPercent: 0, toPercent: 0, conversionPercent: 0 }])
  }

  const handleRemoveRow = async (index) => {
    const row = conversionRows[index]
    if (row.id) {
      if (confirm('Bạn có chắc muốn xóa dòng này?')) {
        try {
          await fbDelete(`hr/kpiConversions/${row.id}`)
          const newRows = conversionRows.filter((_, i) => i !== index)
          setConversionRows(newRows)
        } catch (error) {
          alert('Lỗi khi xóa: ' + error.message)
        }
      }
    } else {
      const newRows = conversionRows.filter((_, i) => i !== index)
      setConversionRows(newRows)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!kpiTemplate) {
      alert('Vui lòng chọn KPI template')
      return
    }

    try {
      // Delete existing conversions
      for (const conv of conversions) {
        if (conv.id) {
          await fbDelete(`hr/kpiConversions/${conv.id}`)
        }
      }

      // Create new conversions
      for (const row of conversionRows) {
        if (row.fromPercent !== undefined && row.toPercent !== undefined && row.conversionPercent !== undefined) {
          await fbPush('hr/kpiConversions', {
            kpiId: kpiTemplate.id,
            kpiCode: kpiTemplate.code,
            fromPercent: row.fromPercent,
            toPercent: row.toPercent,
            conversionPercent: row.conversionPercent
          })
        }
      }

      alert('Đã lưu tỷ lệ quy đổi')
      onSave()
      onClose()
    } catch (error) {
      alert('Lỗi khi lưu: ' + error.message)
    }
  }

  if (!isOpen || !kpiTemplate) return null

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-exchange-alt"></i>
            Khai báo tỷ lệ quy đổi - {kpiTemplate.code || kpiTemplate.id}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '15px' }}>
              {/* <button type="button" className="btn btn-sm" onClick={handleAddRow}>
                <i className="fas fa-plus"></i> Thêm dòng
              </button> */}
            </div>
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tỷ lệ hoàn thành KPI từ (%)</th>
                  <th>Tỷ lệ hoàn thành KPI đến (%)</th>
                  <th>% Quy đổi KPI</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {conversionRows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <input
                        type="number"
                        value={row.fromPercent || 0}
                        onChange={(e) => handleChange(idx, 'fromPercent', e.target.value)}
                        min="0"
                        max="100"
                        step="1"
                        style={{ width: '100px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.toPercent === null || row.toPercent === undefined ? '' : row.toPercent}
                        onChange={(e) => handleChange(idx, 'toPercent', e.target.value)}
                        min="0"
                        max="100"
                        step="1"
                        style={{ width: '100px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.conversionPercent || 0}
                        onChange={(e) => handleChange(idx, 'conversionPercent', e.target.value)}
                        min="0"
                        step="1"
                        style={{ width: '100px' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete"
                        onClick={() => handleRemoveRow(idx)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                <i className="fas fa-save"></i>
                Lưu
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default KPIConversionModal

