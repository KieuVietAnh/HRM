import { fbGet, fbPush } from '../services/firebase'

function SeedKPIDataButton({ onComplete }) {
  const handleSeedKPIData = async () => {
    if (!confirm('Bạn có chắc muốn tạo data mẫu KPI? Dữ liệu cũ sẽ không bị xóa.')) {
      return
    }

    try {
      const today = new Date()
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

      // Create KPI Templates
      const templates = [
        {
          code: 'KPI-M1',
          name: 'Doanh thu',
          unit: 'VNĐ',
          target: 'Cá nhân MKT',
          weight: 50,
          month: firstDayOfMonth,
          status: 'Đang áp dụng'
        },
        {
          code: 'KPI-M2',
          name: 'Tỷ lệ chi phí Ads',
          unit: '%',
          target: 'Cá nhân MKT',
          weight: 30,
          month: firstDayOfMonth,
          status: 'Đang áp dụng'
        },
        {
          code: 'KPI-M3',
          name: 'Số lượng Mes cam kết',
          unit: 'Lead',
          target: 'Cá nhân MKT',
          weight: 20,
          month: firstDayOfMonth,
          status: 'Đang áp dụng'
        }
      ]

      const createdTemplates = []
      for (const template of templates) {
        const result = await fbPush('hr/kpiTemplates', template)
        createdTemplates.push({ ...template, id: result.name })
      }

      // Create conversion rates for each KPI
      const conversionRates = [
        { fromPercent: 0, toPercent: 50, conversionPercent: 30 },
        { fromPercent: 50, toPercent: 70, conversionPercent: 60 },
        { fromPercent: 70, toPercent: 80, conversionPercent: 75 },
        { fromPercent: 80, toPercent: 90, conversionPercent: 90 },
        { fromPercent: 90, toPercent: 95, conversionPercent: 100 },
        { fromPercent: 95, toPercent: 100, conversionPercent: 110 }
      ]

      for (const template of createdTemplates) {
        for (const rate of conversionRates) {
          await fbPush('hr/kpiConversions', {
            kpiId: template.id,
            kpiCode: template.code,
            fromPercent: rate.fromPercent,
            toPercent: rate.toPercent,
            conversionPercent: rate.conversionPercent
          })
        }
      }

      // Create sample employee KPIs
      const employees = await fbGet('employees')
      if (employees && Object.keys(employees).length > 0) {
        const employeeList = Object.entries(employees)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
          .slice(0, 3) // Take first 3 employees

        const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

        for (const emp of employeeList) {
          const kpiValues = {}
          for (const template of createdTemplates) {
            kpiValues[template.id] = {
              kpiId: template.id,
              target: template.code === 'KPI-M1' ? 500000000 :
                template.code === 'KPI-M2' ? 20 :
                  1000
            }
          }

          await fbPush('hr/employeeKPIs', {
            employeeId: emp.id,
            month: monthStr,
            status: 'Chưa chốt',
            kpiValues
          })
        }
      }

      // Create sample KPI results (so Board 1 and 2 are visible)
      if (employees && Object.keys(employees).length > 0) {
        const employeeList = Object.entries(employees)
          .filter(([k, v]) => v !== null && v !== undefined)
          .map(([k, v]) => ({ ...v, id: k }))
          .slice(0, 3)

        const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

        for (const emp of employeeList) {
          const kpiRes = {}
          let totalKPI = 0

          for (const template of createdTemplates) {
            // Mock actual values
            let actual = 0
            if (template.code === 'KPI-M1') actual = 520000000 // Target 500m
            else if (template.code === 'KPI-M2') actual = 18 // Target 20%
            else actual = 1250 // Target 1000

            // Mock completion rate
            let completion = 0
            if (template.code === 'KPI-M1') completion = (actual / 500000000) * 100
            else if (template.code === 'KPI-M2') completion = (20 / actual) * 100 // Lower is better approximation for simpler seed
            else completion = (actual / 1000) * 100

            // Mock conversion (simple logic for seed)
            let conversion = completion >= 100 ? 110 : 90

            // Weight contribution
            totalKPI += (conversion * (template.weight / 100))

            kpiRes[template.id] = {
              kpiId: template.id,
              actual: actual,
              conversionPercent: conversion,
              dataSource: 'Seed'
            }
          }

          await fbPush('hr/kpiResults', {
            employeeId: emp.id,
            department: emp.bo_phan || emp.department || 'Sale',
            month: monthStr,
            kpiResults: kpiRes,
            totalKPI: totalKPI
          })
        }
      }

      alert('Đã tạo data mẫu KPI thành công!')
      if (onComplete) {
        onComplete()
      } else {
        window.location.reload()
      }
    } catch (error) {
      alert('Lỗi khi tạo data mẫu: ' + error.message)
      console.error(error)
    }
  }

  return (
    <button
      className="btn btn-info btn-sm"
      onClick={handleSeedKPIData}
      style={{ marginLeft: '10px' }}
      title="Tạo data mẫu KPI"
    >
      <i className="fas fa-database"></i>
      Tạo data mẫu KPI
    </button>
  )
}

export default SeedKPIDataButton

