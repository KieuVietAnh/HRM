# Import bảng công tháng — kết quả kiểm tra

## Phạm vi

Chỉ mở luồng `monthly_matrix_only` trong `AttendanceImportModal`. Nhận diện cấu trúc trước khi phân tích; file khác định dạng báo lỗi. Không gọi AI hoặc yêu cầu map cột. Generic parser, mapping/profile helpers và handler generic được giữ lại, nhưng không được chạy trong chế độ này.

## Cách xử lý

- Header: tìm cùng dòng có Họ tên, Bộ phận, Ca làm, Tổng công và dãy ngày liên tiếp phía sau. Không cố định tên file, tên sheet, dòng 6 hay cột AJ. Hỗ trợ header Tổng công ngày thường + Lễ trong cùng họ workbook.
- Tháng/năm: ưu tiên khoảng ngày phía trên header, rồi tiêu đề trong sheet. Không lấy từ tên file hoặc tháng đang chọn trên giao diện. Khoảng ngày sai bị chặn.
- Ngày: hỗ trợ cả header dạng số ngày `1…31` và ngày Excel đầy đủ `01/08/2026…31/08/2026`; chỉ tạo ngày thực của tháng, bỏ cột 32 và các ngày thừa trong tháng ngắn, hỗ trợ năm nhuận.
- Nhân viên: đọc vùng liên tục sau header, dựa trên STT/tên và dữ liệu bộ phận, ca, ngày; dừng ở ngăn cách hoặc thống kê. Không cố định số người hoặc dòng cuối.
- Metadata: giữ họ tên, bộ phận, ca, loại hợp đồng, trạng thái, Tổng công và tọa độ ô nguồn. Các ô công trống không tạo log.
- Parser: dùng lại `processMatrixFormat` và `classifyMatrixAttendanceCell`. Không giả giờ vào/ra cho bảng tổng hợp. Giữ số thập phân. Profile của mẫu dùng legend X = nghỉ (0), X1 = 1, X2 = 2, X3 = 3, P1 = phép năm (1); X của parser generic vẫn giữ nghĩa cũ. Giá trị lạ hoặc giờ punch trong mẫu bị chặn.
- Tổng công: chỉ hiển thị/cảnh báo so với tổng ngày; không thay thế dữ liệu ngày. Summary giữ công nguồn, bổ sung nhận diện phép P/P1, không viết lại công thức tính công.
- Ghép người: tên chuẩn hóa duy nhất trong công ty tự khớp; nếu trùng tên, xét bộ phận. Còn nhiều hồ sơ thì admin phải chọn. Không gợi ý tên gần giống, không dùng lại mapping đã lưu của monthly upload, không cho chọn hồ sơ khác tên.
- Scope: hồ sơ có company ID phải đúng ID; hồ sơ legacy không có ID chỉ dùng cho `speego-original` (ứng dụng hiện tại là single-company).
- Preview: chọn đúng một sheet khi có nhiều candidate; hiển thị số người/ngày/log, Tổng công, danh sách khớp và toàn bộ log theo ngày. Thiếu hồ sơ, lựa chọn sai, ô lỗi hoặc dòng trùng cùng người/ngày/ca chặn xác nhận. Admin có thể chủ động chọn tạo hồ sơ còn thiếu; có thể chủ động bỏ qua người không nhập.
- Ghi: chỉ qua nút xác nhận, tiếp tục dùng planner cũ để cập nhật log Excel, tránh tạo trùng và bảo vệ chấm công nguồn khác.

## File đã sửa/tạo

- `src/components/AttendanceImportModal.jsx`: route, adapter parser, preview, chọn sheet, kiểm tra mapping và import.
- `src/utils/monthlyAttendanceMatrix.js`: detector, vùng nhân viên/ngày, metadata và chọn sheet.
- `src/utils/attendanceMatching.js`: exact matching, company scope, source-row identity, kiểm tra lựa chọn trước ghi.
- `src/utils/attendanceImport.js`: profile ký hiệu monthly trong classifier sẵn có.
- `src/utils/attendanceSummary.js`: nhận diện công phép P/P1 nguồn matrix.
- `src/components/AttendanceImportModal.test.mjs`: test handler upload/preview thực bằng hook/JSX harness; mock toàn bộ persistence, không kết nối DB.
- `src/utils/monthlyAttendanceMatrix.test.mjs`: test cấu trúc, metadata, vùng dữ liệu và ngày.
- `src/utils/attendanceMatching.test.mjs`: test matching và cách ly công ty.
- `src/utils/attendanceImport.test.mjs`: test ký hiệu, số công và dữ liệu không hỗ trợ.
- `src/utils/attendanceSummary.test.mjs`: regression summary công phép.

## Kiểm thử ngày 23/09/2026

Đã đọc đúng `D:\download\BẢNG CÔNG THÁNG 8_2026.xlsx`, không commit file dữ liệu cá nhân:

- Workbook có nhiều candidate nên phải chọn sheet, không nhập tất cả.
- Sheet `BẢNG CÔNG T82026`: 40 người, 31 ngày, 1.240 ô công có dữ liệu; header dòng 6, nhân viên dòng 7–46.
- Người đầu Nguyễn Đức Anh; người cuối Tô Châu. Không nhập thống kê cuối bảng hoặc ngày 32.
- 5 cảnh báo Tổng công khác tổng ngày: Cao Võ Thanh Thương, Ngô Đắc Chung, Nguyễn Thị Dương, Phan Nhân, Ngô Thị Thu Hương. Không tự sửa số công ngày để ép bằng tổng.
- Test preview dùng đúng file thật xác nhận 40 nhóm và 1.240 log, không có DB write. Test 40 hồ sơ synthetic xác nhận tự khớp, bỏ mapping cũ sai và giá trị X/0.5 chính xác. Đây không phải xác nhận rằng danh mục nhân viên trên DB thực tế đã có đủ 40 hồ sơ.

Đã kiểm tra thêm file thay thế `D:\download\BẢNG CÔNG THÁNG 8.xlsx`:

- Một sheet `Trang tính1`, tháng 08/2026, 34 nhân viên, 31 ngày và 1.054 ô công.
- Header ngày là serial/ngày Excel đầy đủ thay vì số ngày đơn; detector nhận diện theo chuỗi ngày liên tiếp và vẫn ưu tiên khoảng ngày trong sheet.
- Người đầu Nguyễn Minh Nhựt, người cuối Mai Văn Tuấn. File không được commit vào repo.

Đã hỗ trợ thêm đúng định dạng xuất chi tiết `D:\download\Copy of TỔNG CÔNG THÁNG 8.xlsx`:

- Signature riêng: tiêu đề `CHI TIẾT CHẤM CÔNG` và các cột Mã N.Viên, Tên nhân viên, Ngày, Vào/Ra, Công, Giờ, Tên ca, Kí hiệu, Tổng giờ.
- Sheet `Xuất lưới`: 34 nhân viên, 31 ngày và 1.054 dòng chi tiết; dữ liệu tháng 08/2026.
- Dùng lại parser chi tiết hiện có, nhưng chỉ sau detector riêng. Không bật generic mapping cho file Excel bất kỳ.
- Matching chỉ dùng mã + tên chính xác hoặc tên chính xác duy nhất; mã trùng nhưng tên khác bị chặn để kiểm tra.
- Preview giữ Công/Giờ/Vào-Ra/Kí hiệu nguồn. Không ghi DB trong kiểm thử.

Toàn bộ suite sau khi bổ sung các định dạng: **148 test; 147 pass; 0 fail; 1 skip**. Test skip cũ thuộc attendanceFormula vì thiếu fixture. Test ba file thật chỉ chạy khi đặt các biến đường dẫn; máy không có file sẽ bỏ qua các test tương ứng.

```powershell
$env:ATTENDANCE_SAMPLE_PATH = 'D:\download\BẢNG CÔNG THÁNG 8_2026.xlsx'
$env:NEW_ATTENDANCE_FILE = 'D:\download\BẢNG CÔNG THÁNG 8.xlsx'
$env:DETAIL_ATTENDANCE_FILE = 'D:\download\Copy of TỔNG CÔNG THÁNG 8.xlsx'
node --test src/utils/*.test.mjs src/services/*.test.mjs src/components/*.test.mjs src/pages/*.test.mjs
npm run build -- --outDir .codex-build-check
```

Build ở thư mục output riêng thành công (133 modules). Build mặc định trước đó gặp EPERM ở `dist/assets` hiện có; không đổi quyền hay xóa thư mục đó. Còn cảnh báo Vite CJS và bundle lớn. Output kiểm tra tạm được dọn sau khi xác nhận.

Chưa ghi DB thật, sửa `.env`, apply migration, push hoặc deploy. Bản sửa chỉ ở workspace local. Dữ liệu đã ghép sai và lưu từ trước không được tự động sửa bởi thay đổi này.

## Dùng thử

Mở bản local mới, upload file → chọn `BẢNG CÔNG T82026` → kiểm tra 40 người / 1.240 dòng → xác nhận import. Hồ sơ đúng đã tồn tại sẽ tự khớp; hồ sơ thiếu cần được bổ sung hoặc chủ động bỏ qua, không gán công sang một người tên tương tự.
