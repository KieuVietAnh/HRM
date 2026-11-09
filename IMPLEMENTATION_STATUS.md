# BÁO CÁO TÌNH TRẠNG TRIỂN KHAI THEO PTTK

## Tổng quan
Theo file PTTK, hệ thống có **6 module chính** với nhiều tính năng chi tiết.

---

## 1. HỒ SƠ NHÂN SỰ

### ✅ Đã hoàn thành:
- [x] Hiển thị danh sách nhân sự
- [x] Tìm kiếm theo tên, email, SĐT
- [x] Lọc theo chi nhánh (HCM/Hà Nội)
- [x] Lọc theo bộ phận
- [x] Lọc theo trạng thái
- [x] Xóa nhân viên

### ❌ Chưa hoàn thành:
- [ ] **Tạo mới nhân viên** (Modal form)
- [ ] **Sửa nhân viên** (Modal form)
- [ ] **Xem chi tiết nhân viên** (Modal)
- [ ] **Upload ảnh đại diện**
- [ ] **Upload nhiều ảnh**
- [ ] **Upload nhiều file** (hợp đồng, giấy tờ)
- [ ] **Quản lý tuyển dụng**:
  - [ ] Bảng định biên nhân sự (Hiện có, Định biên, Cần tuyển)
  - [ ] Quản lý CV ứng viên (CV tiếp nhận, đã liên hệ, phỏng vấn, trúng tuyển, không phù hợp)
  - [ ] Chuyển CV trúng tuyển → Nhân viên thử việc
- [ ] **Quản lý trạng thái nhân sự**:
  - [ ] Lịch sử thay đổi trạng thái (Thử việc → Chính thức → Tạm nghỉ → Nghỉ việc)
  - [ ] Báo cáo biến động nhân sự theo kỳ

### 📋 Các trường cần bổ sung:
- Mã nhân sự
- Ngày sinh
- CCCD, ngày cấp, nơi cấp
- Ngày chính thức
- Quê quán
- Giới tính
- Tình trạng hôn nhân
- Upload file Excel

---

## 2. QUẢN TRỊ BẬC LƯƠNG & THĂNG TIẾN

### ❌ Chưa hoàn thành (0%):
- [ ] **Quản lý danh mục bậc lương**:
  - [ ] Bảng bậc lương theo vị trí (Vị trí, Ca làm việc, Doanh thu từ-đến, Bậc, Lương P1)
  - [ ] CRUD bậc lương
- [ ] **Quản lý bậc lương nhân viên**:
  - [ ] Gán bậc lương cho nhân viên
  - [ ] Hiển thị bậc lương hiện tại
- [ ] **Lịch sử thăng tiến**:
  - [ ] Lưu lịch sử thay đổi bậc lương
  - [ ] Lưu lịch sử thăng chức
  - [ ] Ghi nhận người phê duyệt, lý do

---

## 3. QUẢN TRỊ NĂNG LỰC NHÂN SỰ

### ❌ Chưa hoàn thành (0%):
- [ ] **Khung năng lực theo vị trí**:
  - [ ] Khai báo năng lực (Bộ phận, Vị trí, Nhóm năng lực, Tên năng lực, Level 1-5)
  - [ ] Hiển thị ma trận năng lực theo vị trí
- [ ] **Đánh giá năng lực định kỳ**:
  - [ ] Nhập kết quả đánh giá (Level yêu cầu, Level đạt được, Điểm chênh lệch, Nhận xét)
  - [ ] Xem kết quả đánh giá theo kỳ
  - [ ] Tính điểm trung bình, kết quả (Đạt/Cần cải thiện)
- [ ] **Quản lý đào tạo nội bộ**:
  - [ ] Tạo chương trình đào tạo (Online/Offline/Bên ngoài)
  - [ ] Gán học viên
  - [ ] Theo dõi tham gia (Tỷ lệ tham dự %)
  - [ ] Kết quả đánh giá sau đào tạo (Điểm thu hoạch, Xếp loại, Đánh giá)

---

## 4. GIAO KPI VÀ ĐÁNH GIÁ KPI

### ❌ Chưa hoàn thành (0%):
- [ ] **Quản lý danh mục KPI**:
  - [ ] Khai báo KPI (Mã KPI, Tên, Đơn vị, Đối tượng, Trọng số %, Tháng áp dụng)
  - [ ] CRUD KPI
- [ ] **Giao KPI cá nhân**:
  - [ ] Nhập KPI cho từng cá nhân
  - [ ] Hiển thị tổng trọng số
  - [ ] Trạng thái (Chưa chốt/Đã giao)
- [ ] **Tỷ lệ quy đổi KPI**:
  - [ ] Khai báo tỷ lệ quy đổi theo % hoàn thành KPI
- [ ] **Theo dõi & đánh giá KPI**:
  - [ ] Tự động lấy dữ liệu từ Sales/MKT/Vận đơn
  - [ ] Hiển thị kết quả hoàn thành và quy đổi
  - [ ] Báo cáo tổng hợp theo bộ phận

---

## 5. QUẢN TRỊ GIAO VIỆC

### ❌ Chưa hoàn thành (0%):
- [ ] **Quản lý task**:
  - [ ] Tạo task (Mã công việc, Tên, Bộ phận, Người giao, Người nhận, Mức ưu tiên, Deadline)
  - [ ] Cập nhật trạng thái (Đang làm/Đã xong/Quá hạn)
  - [ ] Link file kết quả
  - [ ] Lịch sử thay đổi task

---

## 6. CHẤM CÔNG - TÍNH LƯƠNG - BHXH - THUẾ TNCN

### ❌ Chưa hoàn thành (0%):
- [ ] **Chấm công**:
  - [ ] Import chấm công từ Excel
  - [ ] Chọn checkin đầu tiên và checkout cuối cùng trong ca
  - [ ] Chỉnh sửa thủ công có log
- [ ] **Tính lương tổng hợp**:
  - [ ] Bảng lương 3P (P1: Bậc lương, P2: Năng lực, P3: KPI)
  - [ ] Tổng hợp công, KPI, bậc lương
  - [ ] Cộng thưởng nóng
- [ ] **Quản lý BHXH**:
  - [ ] Thông tin BHXH (Số BHXH, Ngày tham gia, Mức lương đóng)
  - [ ] Tính khấu trừ BHXH
- [ ] **Quản lý Thuế TNCN**:
  - [ ] Thông tin thuế (MST, Biểu thuế, Người phụ thuộc)
  - [ ] Tính khấu trừ thuế
- [ ] **Phiếu lương**:
  - [ ] Tạo phiếu lương cá nhân
  - [ ] Báo cáo tổng quỹ lương

---

## TỔNG KẾT

### Tiến độ tổng thể: **~15%**

- ✅ **Hoàn thành**: Dashboard, Danh sách nhân sự cơ bản
- 🔄 **Đang phát triển**: Các tính năng CRUD nhân sự
- ❌ **Chưa bắt đầu**: 5/6 module chính

### Ưu tiên phát triển:
1. **Cao**: Hoàn thiện module Hồ sơ nhân sự (CRUD, Upload file, Tuyển dụng)
2. **Trung bình**: Module Bậc lương & Thăng tiến
3. **Trung bình**: Module Chấm công & Tính lương
4. **Thấp**: Module Năng lực, KPI, Giao việc

