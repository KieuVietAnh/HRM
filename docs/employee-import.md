# Import nhân sự: chọn sheet và preview

## Lỗi cũ

`Employees.handleImportExcel` chọn sheet có nhiều dòng có dữ liệu nhất, kể cả sheet ẩn, rồi ghi ngay. Trong file `BẢNG CÔNG THÁNG 8_2026.xlsx`, quy tắc đó lấy `Tháng 052025` (61 người) thay vì `BẢNG CÔNG T82026` (40 người).

## Luồng mới

1. Nhân sự → Nhập Excel → chọn file.
2. Nếu có nhiều sheet nhân sự, bắt buộc chọn sheet. Danh sách hiển thị tên, số dòng nhân sự và dấu hiệu sheet ẩn. Không tự chọn sheet nhiều dòng nhất. Một sheet hợp lệ duy nhất và không ẩn có thể được chọn sẵn, nhưng vẫn phải xác nhận.
3. Với bảng công tháng, dùng chung detector/vùng nhân viên với import Chấm công. Không đọc thống kê cuối sheet. Giữ tọa độ dòng Excel và mở rộng các ô header gộp.
4. Preview toàn bộ tên, bộ phận, ca và hành động. Bảng công không có mã NV: hồ sơ khớp tên/bộ phận được giữ nguyên; người thiếu được thêm; trùng tên chưa phân biệt được thì chặn để kiểm tra.
5. Chỉ ghi khi nhấn xác nhận. Đọc lại danh mục nhân sự trước khi ghi; nếu không đọc được, không ghi. Khóa chống xác nhận hai lần. Username mới trong luồng bảng công dùng UUID thay vì số dòng, tránh đụng username của lần import trước.
6. Các mẫu nhân sự/CSV thông thường vẫn dùng xử lý mã NV hiện có, nhưng được chọn sheet và preview trước.

Không xóa hồ sơ ngoài sheet; không sửa dữ liệu chấm công; không sửa các hồ sơ đã ghép được từ bảng công. **40 là số người của sheet chọn nhập, không phải lệnh thay thế toàn bộ danh mục hiện có bằng 40 người.**

File thay thế `BẢNG CÔNG THÁNG 8.xlsx` cũng dùng chung luồng này: hệ thống nhận đúng sheet `Trang tính1` với 34 nhân viên, không đọc các dòng thống kê phía dưới. Số 34 chỉ là dữ liệu của file hiện tại; file tháng sau có thể có số nhân viên khác.

File chi tiết `Copy of TỔNG CÔNG THÁNG 8.xlsx` có 1.054 dòng ngày nhưng được nhận diện và rút gọn thành 34 nhân viên duy nhất theo Mã N.Viên. Import lại giữ hồ sơ có mã + tên đúng; xung đột mã/tên bị chặn, không tự ghi đè.

## Kiểm thử

- 7 test helper + 6 test handler giao diện, gồm đúng file mẫu thật (khi cung cấp đường dẫn), 61 người sheet ẩn / 40 người sheet hiện, không ghi trước xác nhận, hủy, nhập lại, xác nhận hai lần, giữ hồ sơ đã có, lỗi tải danh mục và CSV theo mã NV.
- Persistence trong test là mock; không có ghi DB thật.
- Toàn bộ suite: 148 test, 147 pass, 0 fail, 1 skip cũ (thiếu fixture attendanceFormula).

```powershell
$env:ATTENDANCE_SAMPLE_PATH = 'D:\download\BẢNG CÔNG THÁNG 8_2026.xlsx'
$env:NEW_ATTENDANCE_FILE = 'D:\download\BẢNG CÔNG THÁNG 8.xlsx'
$env:DETAIL_ATTENDANCE_FILE = 'D:\download\Copy of TỔNG CÔNG THÁNG 8.xlsx'
node --test src/utils/*.test.mjs src/services/*.test.mjs src/components/*.test.mjs src/pages/*.test.mjs
npm run build -- --outDir .codex-employee-import-build
```

Nếu không đặt đường dẫn file mẫu, các test đọc file thật được skip. Không commit file Excel cá nhân, `.env` hoặc output build.
