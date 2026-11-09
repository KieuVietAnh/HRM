// Script để tạo data mẫu cho module Bậc lương & Thăng tiến
const FIREBASE_URL = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app'

// Data mẫu bậc lương theo yêu cầu PTTK
const sampleSalaryGrades = [
  {
    position: 'Sale 1',
    shift: 'Ca ngày',
    revenueFrom: 0,
    revenueTo: 150,
    level: 1,
    salary: 9000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Sale 1',
    shift: 'Ca đêm',
    revenueFrom: 0,
    revenueTo: 200,
    level: 1,
    salary: 9000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Sale 2',
    shift: 'Ca ngày',
    revenueFrom: 151,
    revenueTo: 220,
    level: 2,
    salary: 11000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Sale 2',
    shift: 'Ca đêm',
    revenueFrom: 251,
    revenueTo: 270,
    level: 2,
    salary: 11000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Sale cứng 1',
    shift: 'Ca ngày',
    revenueFrom: 261,
    revenueTo: 350,
    level: 4,
    salary: 14000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Trưởng nhóm Sale 2',
    shift: 'Ca đêm',
    revenueFrom: 3401,
    revenueTo: null, // Không giới hạn
    level: 7,
    salary: 22000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'MKT 1',
    shift: 'Ca ngày',
    revenueFrom: 0,
    revenueTo: 100,
    level: 1,
    salary: 8000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'MKT 2',
    shift: 'Ca ngày',
    revenueFrom: 101,
    revenueTo: 200,
    level: 2,
    salary: 10000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'MKT 3',
    shift: 'Ca ngày',
    revenueFrom: 201,
    revenueTo: 300,
    level: 3,
    salary: 12000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'MKT 4',
    shift: 'Ca ngày',
    revenueFrom: 301,
    revenueTo: 400,
    level: 4,
    salary: 15000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'MKT 5',
    shift: 'Ca ngày',
    revenueFrom: 401,
    revenueTo: null,
    level: 5,
    salary: 18000000,
    status: 'Đang áp dụng'
  },
  {
    position: 'Trưởng team MKT',
    shift: 'Ca ngày',
    revenueFrom: 0,
    revenueTo: null,
    level: 6,
    salary: 20000000,
    status: 'Đang áp dụng'
  }
]

// Hàm để push data vào Firebase
async function seedSalaryGrades() {
  console.log('Đang tạo data mẫu bậc lương...')
  
  for (const grade of sampleSalaryGrades) {
    try {
      const response = await fetch(`${FIREBASE_URL}/hr/salaryGrades.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(grade)
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log(`✓ Đã tạo bậc lương: ${grade.position} - Ca ${grade.shift} - Bậc ${grade.level}`)
      } else {
        console.error(`✗ Lỗi khi tạo bậc lương: ${grade.position}`, await response.text())
      }
    } catch (error) {
      console.error(`✗ Lỗi khi tạo bậc lương: ${grade.position}`, error)
    }
  }
  
  console.log('Hoàn thành!')
}

// Export để có thể import vào component
export { seedSalaryGrades, sampleSalaryGrades }

// Nếu chạy trực tiếp trong browser console
if (typeof window !== 'undefined') {
  window.seedSalaryGrades = seedSalaryGrades
}

