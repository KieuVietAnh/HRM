# Kế hoạch sửa import Excel chấm công cho 5.6-sol

Ngày lập: 22/09/2026. Dự án: `D:\hr\HrmSpeeGo`. Mốc mã đã rà: `50ed88d`.

Đây là tài liệu triển khai, chưa phải bản sửa. Không áp dụng sang `HR-Company-23` chỉ vì IDE đang mở `.env` của dự án đó.

## 1. Kết quả cần đạt

Người dùng tải file `.xlsx` hoặc `.xls` có dữ liệu chấm công, hệ thống nhận diện cấu trúc và đưa từng giá trị vào đúng cột đang có của ứng dụng. Hồ sơ đã tồn tại phải được dùng lại; bảng tổng hợp, chi tiết nhân viên và xuất Excel phải đọc cùng kết quả đã lưu.

“Bất kỳ Excel” được triển khai bằng **tự nhận diện + màn hình chọn cột khi chưa rõ + ghi nhớ mẫu đã xác nhận**. Không thể cam kết tự suy ra chính xác nội dung của file không có cấu trúc, chỉ chứa ảnh, bị mã hóa, hay thiếu thông tin nhận dạng nhân viên/ngày. Với các trường hợp đó, hướng dẫn đúng phần cần bổ sung; không báo import thành công bằng cách tự đoán.

Phạm vi gồm danh sách theo ngày, log từng lần chấm, ma trận ngày chứa công/giờ/ký hiệu, ma trận có nhóm Vào/Ra; nhiều sheet, nhiều khối phòng ban và nhiều tháng trong một file. Không yêu cầu người dùng sửa tên hay thứ tự cột trong Excel.

## 2. Những gì đã xác nhận từ mã nguồn

| Vị trí | Hiện trạng | Việc phải sửa |
| --- | --- | --- |
| `src/components/AttendanceImportModal.jsx`: `prepareMatchingPreview` | Chưa tìm ra tên khớp tự động thì mặc định `__create__` | Chưa khớp phải chờ đối soát; không được kết luận người đó chưa có hồ sơ |
| `src/services/firebase.js`: `listEmployeesAsFirebaseMap` | Lấy danh sách users một lần, không phân trang | Dùng chung bộ tải đầy đủ với trang hồ sơ nhân viên |
| `src/pages/Employees.jsx`: `fetchUsersDirectory` | Có phân trang và xử lý thiếu cột; khác đường tải của import | Tách thành dịch vụ chung, sắp xếp ổn định có khóa ID |
| `src/pages/AttendancePreview.jsx`: `handleOpenImport` | Tải lỗi vẫn mở import; dữ liệu null không xóa danh sách cũ | Phân biệt đang tải/đã tải/rỗng/lỗi; lỗi danh mục không được thành thiếu nhân viên |
| `src/utils/attendanceImport.js`: `mapAttendanceColumns` | Một cột có thể bị gán nhiều ý nghĩa: `Ngày công` là cả ngày và công; `Tổng giờ` là cả giờ và tổng giờ | Có quy tắc loại trừ và xác nhận trường hợp mơ hồ |
| Modal: `processMatrixFormat` | Gọi parseTime trước khi xác định kiểu; `0.5` có thể thành `12:00` | Chọn kiểu dữ liệu trước khi parse giá trị |
| Modal: `buildLog` | Tính lại công/giờ/tổng giờ dù file có cột nguồn; cột trễ/sớm nhận diện nhưng không đọc đầy đủ | Tách giá trị nguồn và giá trị tính toán, quy định ưu tiên rõ |
| Modal: parser ma trận | Tự thêm Vào/Ra `08:00–17:00` cho ô chỉ chứa công; ký hiệu nguồn có thể mất | Giữ giờ trống khi file không có punch; giữ nguyên ký hiệu gốc |
| `attendanceImport.js`: ngày/giờ | Giờ Excel `0` bị bỏ; ISO `2026-02-31` được chấp nhận; chưa dùng hệ ngày 1904 | Kiểm tra theo kiểu ô và lịch thực tế |
| `attendanceMatching.js`: `buildAttendanceRecordKey` | Khóa chống trùng gồm tên/mã nguồn, giờ vào/ra; `ROW<n>` phụ thuộc vị trí | Tách định danh bản ghi khỏi các giá trị có thể sửa |
| Modal: `executeImport` | Ghi từng nhóm bằng ID ngẫu nhiên; tạo nhân viên trước, lỗi giữa chừng chưa có cơ chế tiếp tục an toàn | Có phiên import, chống ghi lặp ở DB và kết quả từng bước |
| `AttendancePreview.jsx`: `handleImportComplete` | Chỉ tổng hợp một tháng; chi tiết có thể giữ object/tháng cũ | Đồng bộ tất cả tháng bị tác động và cập nhật chi tiết theo ID |

Không đủ bằng chứng để kết luận 28 người trong ảnh không tồn tại trong DB. Khi triển khai phải đối chiếu file gây lỗi với danh mục đầy đủ từ đúng phiên đăng nhập. Các lỗi mã nguồn ở trên đã xác nhận độc lập với dữ liệu production.

`src/App.jsx` hiện chuyển `/attendance` sang `/bang-cong-preview`. Ưu tiên kiểm thử `AttendancePreview.jsx`, không chỉ sửa trang `Attendance.jsx` cũ.

HrmSpeeGo là bản đơn công ty: `companyContext.js` dùng `speego-original` làm khóa UI; storage legacy bỏ qua tham số companyId. Không dùng khóa này làm `users.company_id`, không tự đổi database hoặc đưa kiến trúc đa công ty vào bản sửa. SQL hiện có trong repo không định nghĩa cột `users.company_id`.

## 3. Nguyên tắc xử lý dữ liệu

1. Đọc Excel, ghép cột và ghép nhân viên là ba bước độc lập. Parser không truy cập DB, không tạo nhân viên, không tính tên gần giống thành danh tính đã xác nhận.
2. `ROW40` chỉ biểu thị vị trí nguồn, không phải mã nhân viên và không dùng để ghi nhớ danh tính qua các file.
3. Phân biệt giá trị trống, số 0, giá trị không hợp lệ và số được tính bổ sung. Không đổi ô lỗi thành 0 hoặc bỏ dòng âm thầm.
4. Lưu nguồn gốc từng giá trị được nhập: sheet, ô/dòng, tên cột, giá trị gốc, giá trị chuẩn hóa. Không cần lưu toàn bộ workbook hoặc các cột dữ liệu cá nhân không sử dụng.
5. Preview và bước lưu dùng cùng mapping và dữ liệu đã chuẩn hóa. Đổi sheet/cột/tháng/quy tắc thì hủy preview cũ và phân tích lại.
6. Tạo nhân viên là lựa chọn rõ ràng của người dùng có quyền. Trạng thái mặc định của nhân viên chưa khớp là `Cần đối soát`.
7. Việc sửa importer không tự thay đổi công đã HR chỉnh tay, hồ sơ nhân sự, hay dữ liệu chấm công online.

## 4. Thiết kế luồng sử dụng

`Tải file → Chọn sheet/vùng dữ liệu → Xác nhận cột → Đối soát nhân viên → Xem kết quả và thay đổi → Lưu → Đồng bộ bảng công`.

- File quen thuộc: tự điền sheet/cột từ mẫu đã lưu, vẫn cho xem và sửa.
- File lạ: hiển thị vài dòng mẫu, chữ cột Excel A/B/C, tên tiêu đề, và danh sách cột hệ thống để chọn. Không biết tên cột vẫn có thể map theo dữ liệu nhìn thấy.
- Có thể chọn nhiều sheet/vùng khi file tách theo chi nhánh/tháng; sheet hướng dẫn/tổng kết được liệt kê nhưng không tự nhập cùng dữ liệu chi tiết.
- Tiêu đề nhiều dòng/ô gộp: hiển thị đường dẫn tiêu đề, ví dụ `Ngày 01 > Vào 1`, thay vì mất nhãn cha.
- Cho chọn hàng bắt đầu/kết thúc, định dạng ngày, tháng/năm cho ma trận thiếu năm và kiểu ô ngày: `Công`, `Số giờ`, `Ký hiệu`, `Vào/Ra`.
- Dòng tổng, tiêu đề lặp và khối phòng ban được loại theo quy tắc có lý do; không dừng toàn sheet ngay dòng “Tổng” đầu tiên.
- Lỗi phải chỉ được ô, ví dụ `Sheet Tháng 8!F12: ngày 31/02/2026 không hợp lệ`.
- Nhãn thống kê tách rõ: dòng nguồn, bản ghi theo ngày/ca, nhân viên đã khớp, cần đối soát, chủ động bỏ qua, lỗi dữ liệu. Không so số dòng Excel với số bản ghi ma trận sau khi trải ngày như hai đại lượng bằng nhau.

## 5. Hợp đồng ánh xạ cột và dữ liệu trung gian

Tạo registry trường dùng chung cho parser, dropdown và validator. Registry ghi kiểu, đơn vị, alias, điều kiện bắt buộc và trường không được gán đồng thời. Dưới đây là đích tương thích storage hiện có; tên đối tượng trung gian có thể rõ hơn.

| Cột nguồn / ý nghĩa | Đích hiện có | Quy tắc |
| --- | --- | --- |
| Mã NV hệ thống | `employeeCode`; sau đối soát là `employeeId` UUID | Phân biệt mã NV với mã máy, giữ số 0 đầu |
| Mã máy | `sourceEmployeeCode` | Dùng namespace nguồn/máy để tra mapping đã xác nhận |
| Họ tên; tên theo máy | `sourceEmployeeName`, `machineName`, `tenTheoMayChamCong` | Giữ tên gốc riêng với tên hồ sơ |
| Bộ phận / chức vụ / ca | `department`, `position`, `shiftName`, `tenCa` | Nhập thông tin chấm công, không cập nhật hồ sơ âm thầm |
| Ngày | `date` | `YYYY-MM-DD`, là ngày làm việc theo múi giờ doanh nghiệp |
| Vào/Ra, Vào 1/Ra 1… | `checkIn`, `checkOut`, `vao`, `ra`, `punchPairs` | Giữ cặp và thứ tự, ca đêm có ngày ra kế tiếp |
| Công / Giờ | `cong`, `hours`, `gio` | Công và giờ là hai đơn vị khác nhau |
| Công+ / Giờ+ | `congPlus`, `gioPlus` | Không gộp vào Công/Giờ khi chưa có quy tắc |
| Ký hiệu / Ký hiệu+ | `kyHieu`, `kyHieuPlus` | Giữ nguyên ký hiệu và bảng nghĩa đã chọn |
| TC1/TC2/TC3 | `tc1`, `tc2`, `tc3` | Ánh xạ độc lập, đơn vị rõ ràng |
| Vào trễ / Ra sớm | `lateMinutes`, `earlyMinutes`, alias legacy | Không nhầm với cột giờ Vào/Ra |
| Tổng giờ | `tongGio` | Không cộng lặp với Giờ hoặc tự bỏ giá trị nguồn |

Tạo dữ liệu trung gian gồm:

- `WorkbookModel`: sheet, ô `{address, rawValue, formattedText, type, numberFormat, formula, cachedResult}`, vùng gộp, hệ ngày, trạng thái ẩn.
- `ImportMapping`: phiên bản, sheet/vùng, hàng tiêu đề, loại bảng, column bindings, kiểu ngày/số, đơn vị, bảng ký hiệu, chế độ sử dụng công nguồn.
- `ParsedAttendanceRow`: định danh nguồn, ngày/ca/các punch, giá trị chấm công chuẩn hóa, `sourceValues`, `provenance`, `issues`; chưa cần UUID nhân viên.
- `ResolvedAttendanceRow`: bổ sung UUID và căn cứ ghép; chỉ dòng đã xác nhận mới có thể ghi attendance chính thức.
- `ImportPreview`: lỗi/cảnh báo, thao tác thêm/cập nhật/không đổi/xung đột, tổng kiểm tra, tất cả `affectedMonths`.
- `ImportResult`: phiên import, số bản ghi đã lưu, các tháng ảnh hưởng, trạng thái đồng bộ tổng hợp. Không chỉ trả một chuỗi tháng như hiện tại.

Registry có thể cho hai alias cùng xuất ra dữ liệu legacy, nhưng một cột Excel không được mang hai ý nghĩa khác nhau mà không có quy tắc tường minh. Cột không có trong hệ thống được chọn `Bỏ qua`, không tự sinh cột DB.

## 6. Các giai đoạn triển khai theo thứ tự

### Giai đoạn 0 — Chốt ca lỗi và chặn tạo trùng

- Đọc lại trạng thái Git, hướng dẫn repo và các file đã sửa; giữ thay đổi của người dùng.
- Tắt mặc định `__create__` trong `prepareMatchingPreview`. Đổi thông báo từ “không có hồ sơ” sang “chưa tìm được hồ sơ phù hợp”.
- Cho tìm hồ sơ theo mã/tên trong toàn bộ danh mục đã tải; tên gần giống chỉ gợi ý. Không giảm ngưỡng để ép đủ 40/40.
- Chỉ mở tạo hồ sơ bằng lựa chọn chủ động, dùng luồng tạo nhân viên có sẵn và đúng quyền; không tự gán thử việc, tài khoản, mật khẩu, công ty hoặc chi nhánh từ tùy chọn ưu tiên ghép.
- Thu thập đúng workbook gây lỗi và đối chiếu vài dòng cụ thể với hồ sơ thật. Nếu chưa có quyền xem production, ghi rõ phần chưa kiểm chứng; dùng fixture giả lập cùng cấu trúc để tiếp tục.
- Nếu đã có hồ sơ/log tạo nhầm từ bản cũ, lập báo cáo đối soát riêng. Không xóa hoặc tự gộp dữ liệu cũ trong sửa importer.

Điều kiện qua: nhân viên chưa khớp không biến thành nhân viên mới chỉ vì bấm Import; phân tích file không ghi DB.

### Giai đoạn 1 — Hợp nhất danh mục nhân viên

- Tách `fetchUsersDirectory` thành `src/services/employeeDirectory.js` dùng chung cho Employees và importer.
- Phân trang ổn định theo ID, xử lý thiếu cột tùy chọn theo schema; thiếu ID/tên/mã cần thiết phải báo lỗi rõ. Không trả danh sách một phần như thành công đầy đủ.
- Kết quả gồm danh sách, số lượng, thời điểm tải và trạng thái hoàn tất. Lỗi quyền/truy vấn phải hiện lỗi, không hiểu là 0 nhân viên.
- Sửa `handleOpenImport`: xóa state cũ, cho đọc/map file khi danh mục lỗi nhưng khóa đối soát/lưu đến khi nạp thành công; có thao tác tải lại.
- Kiểm tra trong cùng phiên đăng nhập trang Nhân viên và import nhìn thấy cùng ID/số lượng, kể cả người ngoài 1.000 dòng đầu và người nghỉ việc cần nhập công lịch sử.

Điều kiện qua: hồ sơ có sẵn tìm được trong importer; danh mục lỗi không tạo gợi ý nhân viên mới.

### Giai đoạn 2 — Parser thuần và ánh xạ linh hoạt

- Tách `processFullAttendanceFormat`, `processPunchLogFormat`, `processMatrixFormat`, `processListFormat`, `buildLog` khỏi JSX; không ghép nhân sự trong parser.
- Đọc WorkbookModel trước khi biến dữ liệu thành mảng, giữ metadata để phân biệt số thập phân với giờ Excel và mã có định dạng `00000`.
- Phân tích từng sheet/vùng, đề xuất kiểu bảng dựa cả tiêu đề và dữ liệu mẫu; cho chọn lại nếu nhiều ứng viên. Mốc quét 60 dòng chỉ là tối ưu tự động, không giới hạn việc chọn hàng tiêu đề.
- Thêm adapter cho bốn định dạng ở mục 1; hỗ trợ ma trận 1–4 ngày, thiếu ngày, qua tháng, nhóm Vào/Ra và phòng ban lặp. Không suy ra giờ cho cả sheet chỉ vì có ba ô >= 2.5.
- `0.5` được đọc theo trường đã map: Công=0.5 công, Giờ=0.5 giờ, giờ Excel=12:00. `0` trong cột giờ Excel là 00:00; ô trống vẫn trống.
- Bổ sung alias thường gặp như Giờ vào/Giờ ra và cột sự kiện Thời gian; mã máy và mã NV hệ thống là hai trường riêng.
- Kiểm tra ngày hợp lệ với mọi định dạng, hệ ngày 1900/1904; xử lý dấu phẩy thập phân/ngăn nghìn theo cấu hình. Không dùng parseFloat để chấp nhận `8abc` thành 8.
- Với công thức, dùng giá trị kết quả có sẵn; thiếu kết quả/lỗi Excel thì chỉ đúng ô cần xử lý. Không hứa tự tính mọi công thức, macro hoặc dữ liệu liên kết ngoài.
- Lưu mẫu mapping theo cấu trúc tiêu đề/nhóm ngày và phiên bản, không chỉ tên file hay vị trí cột. File đổi thứ tự phải map lại theo định danh cột; khi mẫu không phù hợp thì quay về xác nhận.

Điều kiện qua: thêm một mẫu chưa biết không cần sửa code nếu người dùng chỉ được cột, vùng và ý nghĩa giá trị.

### Giai đoạn 3 — Giữ giá trị nguồn và thống nhất cách tính công

- Giữ nguyên `sourceValues` của Công, Giờ, Tổng giờ, Trễ/Sớm, TC và ký hiệu. Giá trị tính lại có trường riêng, kèm chênh lệch.
- Có lựa chọn được lưu theo mẫu: `Theo công/giờ trong file` hoặc `Tính theo giờ vào/ra và cài đặt công ty`. File đã có công/giờ rõ ràng đề xuất dùng giá trị nguồn; file chỉ có punch đề xuất tính toán.
- Người dùng thấy cách tính và chênh lệch trước khi lưu. Thiếu giá trị mới tính bổ sung theo mode; không âm thầm thay giá trị nguồn.
- Bảng nghĩa ký hiệu thuộc mapping mẫu. `X` không được mặc định một công trong parser rồi hiển thị nghỉ trong bảng; `P`, `P1`, `KP` và ký hiệu chưa biết phải giữ gốc, chưa rõ nghĩa thì yêu cầu gán.
- Công-only: giờ vào/ra để trống; nếu suy ra số giờ từ số công thì đánh dấu là số giờ tính bổ sung. Không tạo punch 08:00–17:00.
- Sửa đồng bộ `attendanceCalculations.js`, `attendanceSummary.js`, hiển thị chi tiết và export để tôn trọng mode. Với log cũ chưa có mode, giữ hành vi legacy để không thay hàng loạt lịch sử.
- Công HR chỉnh tay tiếp tục ưu tiên tại tầng tổng hợp hiện có; import không ghi đè `manualWorkdays` hay quyết định phép.

Điều kiện qua: cùng một ngày của một người cho kết quả giải thích được từ Excel tới preview, DB, chi tiết và export.

### Giai đoạn 4 — Ghép nhân viên có căn cứ và ghi nhớ độc lập

- Chuẩn hóa Unicode, dấu/hoa thường/khoảng trắng để tra cứu; giữ tên/mã gốc. Mã là chuỗi; không bỏ số 0 đầu hoặc ký tự mã tùy tiện.
- Ưu tiên liên kết nguồn đã được người dùng xác nhận, rồi mã NV hệ thống phù hợp, rồi họ tên chuẩn hóa duy nhất. Các định danh mạnh mâu thuẫn phải chờ đối soát, không để ưu tiên che mất xung đột.
- Mã máy chỉ trở thành mã NV khi mapping xác định đúng loại hoặc đã có liên kết nguồn. Kiểm tra tên xung đột ngay cả khi mã trùng.
- Tên trùng nhiều hồ sơ: dùng mã hoặc chi nhánh/phòng ban có căn cứ trong file để phân biệt; chi nhánh chọn làm ưu tiên chỉ sắp xếp gợi ý nếu không đủ bằng chứng.
- Tên gần giống như `Lý Thị Trinh → Lê Thị Tuyết` không được tự ghép. Phần trăm hiện tại là độ giống chuỗi, không phải xác suất cùng người; đổi nhãn hoặc bỏ hiển thị gây hiểu nhầm.
- Nếu giữ nút AI đối soát, AI chỉ đề xuất; kết quả phải qua cùng bộ kiểm tra định danh và bước xác nhận khi mơ hồ. Luồng nhập Excel và chọn cột phải hoạt động đầy đủ khi không có dịch vụ AI.
- Lưu mapping người dùng xác nhận riêng, ví dụ collection `attendanceEmployeeMappings` trong `hr_records`, có namespace nguồn, khóa nguồn ổn định, UUID, thời điểm/người xác nhận. Không nhớ từ “log đầu tiên tìm thấy”.
- Không có mã nguồn: chỉ ghi nhớ theo tên trong phạm vi nguồn khi tên duy nhất; hồ sơ trùng tên cần thêm khóa. File sắp xếp lại không làm mất mapping.
- Trước commit kiểm tra lại hồ sơ còn tồn tại/quyền xem và mapping còn hợp lệ. Người dùng có thể chọn bỏ qua rõ ràng các dòng; mặc định chưa đối soát thì chưa commit phiên đó.
- Nếu giữ chức năng tạo hồ sơ trong import, tái kiểm tra trùng ở thời điểm lưu và chỉ thực hiện lựa chọn chủ động qua dịch vụ tạo hồ sơ chuẩn. Không tự cấp tài khoản Auth.

Điều kiện qua: nhân viên có sẵn dùng lại đúng UUID; hai người khác nhau không bị ghép vì tên giống; thay thứ tự dòng không tạo danh tính mới.

### Giai đoạn 5 — Lưu chống trùng và phục hồi lỗi

- Tách `src/services/attendanceImportService.js`: chuẩn bị phiên import, đọc dữ liệu hiện tại của các tháng ảnh hưởng, so sánh thêm/cập nhật/không đổi/xung đột, rồi commit.
- Lưu log vào `hr_records`/`attendanceLogs` hiện có. Metadata import có thể đặt trong JSON và collections chuyên dụng; không thêm cột nghiệp vụ mới chỉ để chứa một cột Excel lạ.
- Chọn và ghi rõ độ chi tiết bản ghi: gom các lần chấm thành bản ghi ngày/ca có `punchPairs`; khóa nghiệp vụ gồm UUID nhân viên + ngày làm việc + định danh ca/đoạn ổn định. Không dùng giờ vào/ra, tên hiển thị, tên file, số dòng làm khóa bất biến.
- Dữ liệu nhiều ca phải giữ riêng. Nếu file không có thông tin để phân biệt với ca đã có thì trả xung đột cho người dùng chọn, không tự chèn hoặc gộp.
- Bản chấm công online hoặc nguồn khác không bị ghi đè tự động. Khi sửa log legacy, dùng ID hiện có đã đối chiếu; dữ liệu trùng lịch sử phải được báo cáo, không dọn âm thầm.
- Có `importJobId`, fingerprint nội dung/mapping và khóa bản ghi ổn định để retry không chèn lại. Fingerprint file chỉ là nhận diện lần nhập, không thay thế khóa nghiệp vụ chống trùng file được sắp xếp/đổi tên.
- Thêm RPC/migration tối thiểu cho commit có kiểm tra quyền và ràng buộc chống trùng ở DB; ưu tiên giao dịch nguyên tử cho phiên vừa phải. Với phiên lớn, chia lô có trạng thái đã commit để tiếp tục, không báo hoàn thành khi thiếu lô.
- Kiểm tra lại version dữ liệu ở commit để phát hiện người khác vừa sửa; không dựa duy nhất vào props của modal. Nhập đồng thời và retry sau mất mạng đều phải không tạo bản ghi kép.
- Nếu môi trường chưa có RPC cần thiết, báo phần triển khai còn thiếu; không thay bằng chèn ID ngẫu nhiên rồi tuyên bố đã chống trùng.
- Không nới RLS hoặc dùng service role trên trình duyệt để tạo hồ sơ. Migration giữ đúng quyền đang có của từng chức năng.

Điều kiện qua: nhập file giống nhau hai lần lần hai thêm 0; sửa giờ cập nhật đúng record; lỗi giữa chừng rồi retry không nhân đôi.

### Giai đoạn 6 — Đồng bộ sau khi commit và nghiệm thu

- `ImportResult.affectedMonths` lấy từ tất cả dòng đã commit; tổng hợp lại mọi tháng liên quan, không chỉ tháng có nhiều dòng nhất.
- Truyền targetMonth trực tiếp cho tải chi tiết; không dựa vào state tháng vừa set chưa render.
- Lưu ID nhân viên đang xem, lấy `detailRow` từ dữ liệu mới thay vì giữ bản sao cũ. Cập nhật danh sách, modal chi tiết và dữ liệu export cùng phiên kết quả.
- Tách trạng thái `Đã lưu chấm công, đang/chưa tổng hợp` khỏi `Hoàn tất`. Lỗi tổng hợp có nút thử tổng hợp lại, không import lại toàn bộ log.
- Số log đã lưu nhưng không có hồ sơ để tổng hợp phải được báo, không lọc bỏ âm thầm rồi báo đồng bộ thành công.
- Khi triển khai, kiểm tra đúng repo, commit, deployment và domain `hrmspeego.vercel.app`; nhãn giao diện mới chỉ chứng minh bundle mới, chưa chứng minh import đúng.
- Xác minh bằng một phiên nhập thực tế được cho phép trên dữ liệu thử: đối chiếu UUID và giá trị công/giờ cụ thể giữa preview, log, tổng hợp, chi tiết, export; tải lại trang vẫn đúng.

## 7. Phân chia file và thứ tự commit đề xuất

| Commit | Công việc | File chính |
| --- | --- | --- |
| 1 | Chưa ghép không tự tạo; chung danh mục đầy đủ | `AttendanceImportModal.jsx`, `Employees.jsx`, `AttendancePreview.jsx`, `services/employeeDirectory.js`, `firebase.js` |
| 2 | WorkbookModel, registry, parser thuần | `utils/attendanceImport.js`, thêm `utils/attendanceImport/` cho workbook/mapping/adapters/validation |
| 3 | Chọn sheet/vùng/cột và lưu mẫu | Modal, thêm component mapping riêng; collection mapping mẫu qua dịch vụ |
| 4 | Ngữ nghĩa Công/Giờ/Ký hiệu và nguồn/tính toán | Parser, `attendanceCalculations.js`, `attendanceSummary.js`, preview/export |
| 5 | Ghép hồ sơ và mapping xác nhận | `attendanceMatching.js`, dịch vụ lưu ánh xạ nguồn |
| 6 | Import job, RPC chống trùng, retry/xung đột | `services/attendanceImportService.js`, `supabase/migrations/`, modal |
| 7 | Tổng hợp đa tháng, refresh chi tiết, nghiệm thu | `AttendancePreview.jsx`, summary/export, tests tích hợp |

Tên module mới là đề xuất; ưu tiên ít module rõ trách nhiệm, không để toàn bộ parser và lưu DB tiếp tục nằm trong JSX. Mỗi commit phải dùng được hoặc được nối lại đầy đủ trước deploy; không triển khai UI mới khi schema cần thiết chưa sẵn sàng.

## 8. Bộ kiểm thử nghiệm thu bắt buộc

| Nhóm | Ca kiểm thử | Kết quả yêu cầu |
| --- | --- | --- |
| Cột | Đảo cột, dấu/không dấu, tiếng Anh, tiêu đề lạ | Tự map hoặc chọn tay; không cần đổi Excel |
| Cột | `Ngày công`, `Tổng giờ`, hai cột cùng tên | Phát hiện mơ hồ, không double-map/double-count |
| Workbook | Ô gộp 2–3 tầng, header sau dòng 60, mã `00019` | Giữ đủ nhãn và số 0 đầu |
| Workbook | Nhiều sheet, tổng xen giữa phòng ban, sheet ẩn | Nhập đúng vùng đã chọn, không mất khối sau tổng |
| Ma trận | 1–4 ngày; tháng 28/29/30/31 ngày; qua tháng | Ngày đúng và không yêu cầu luôn có đủ 31 cột |
| Ma trận | Vào/Ra/ca ở các cột con | Cặp chấm đúng, không cộng số giờ vào số công |
| Giá trị | Cùng 0.5 ở Công, Giờ và ô giờ Excel | Lần lượt 0.5 công, 0.5 giờ, 12:00 |
| Giá trị | Trống, 0, 0,25; 00:00; AM/PM | Không đổi trống thành nghỉ; không mất nửa ngày/nửa đêm |
| Ngày | DD/MM, MM/DD, serial 1900/1904, 31/02 | Đọc theo cấu hình; ngày sai bị chỉ rõ |
| Ký hiệu | X/P/P1/KP và mã tự đặt | Giữ mã gốc, nghĩa theo mẫu; không tạo giờ giả |
| Công thức | Có cached result, thiếu result, #VALUE! | Đọc được hoặc báo đúng ô, không chuyển lỗi thành 0 |
| Giờ | Ca đêm, nhiều ca, một đầu punch thiếu | Giữ ngày/đầu punch và không làm tròn thành công đủ |
| Nguồn | File có đủ Công/Giờ/TC/Trễ/Sớm/Tổng giờ | Tất cả trường được giữ và dùng đúng mode |
| Hồ sơ | Người có sẵn ở dòng danh mục >1.000 | Ghép đúng UUID; import và Nhân viên cùng danh sách |
| Hồ sơ | Tải danh mục lỗi hoặc thiếu quyền | Không tạo mới hàng loạt, không lưu với danh mục lỗi |
| Hồ sơ | Hai người cùng tên; mã trùng tên khác | Chờ đối soát, không chọn đại |
| Hồ sơ | Nguyễn Việt Khánh/Nguyễn Nam Khánh; Lý Thị Trinh/Lê Thị Tuyết | Không ghép hai người chỉ vì độ giống chuỗi |
| Hồ sơ | Tên viết khác đã chọn thủ công, file đổi thứ tự | Ghi nhớ theo nguồn ổn định, không dựa ROW<n> |
| Lưu | Nhập cùng file hai lần, đổi tên file/sắp xếp dòng | Lần sau không tạo công trùng |
| Lưu | Chỉnh giờ và nhập lại; nhiều ca thực sự | Cập nhật record đúng; giữ các ca hợp lệ |
| Lưu | Mất mạng giữa lô, double click, hai phiên đồng thời | Retry an toàn, có kết quả rõ, không tạo hồ sơ/log kép |
| Đồng bộ | File gồm hai tháng, import tháng khác tháng đang xem | Tổng hợp cả hai, chi tiết đúng tháng mới |
| Đồng bộ | HR có công chỉnh tay, mở detail trước import | Override còn; detail phản ánh dữ liệu mới |
| Từ đầu tới cuối | Excel → preview → DB → summary → detail → export | So sánh các giá trị cụ thể và UUID, không chỉ đếm dòng |

Fixture sẵn có: `BANG_CONG_THANG_7_2026_TEST.xlsx`, `BANG_CONG_THANG_8_2026_TEST.xlsx`, `public/templates/attendance-report-template.xlsx`; ngoài repo có `D:\hr\TONG_CONG_THANG_8.xlsx` và `D:\hr\TONG_CONG_THANG_8_2026_KIEM_TRA.xlsx`. Không mặc định chúng là đúng file gây lỗi trong ảnh. Fixture đưa vào Git cần dùng nhân sự giả nhưng giữ nguyên cấu trúc và kiểu ô.

Bổ sung test cho parser thật đã tách khỏi JSX, directory pagination/error, mapping, import service và refresh. Test utils hiện tại và build xanh chưa đủ kiểm chứng luồng mới.

Lệnh kiểm tra nền:

```powershell
node --test src/utils/*.test.mjs
npm run build
git diff --check
```

Chạy thêm các test dịch vụ/tích hợp mới theo đường dẫn thực tế được tạo. Không chạy mọi script trong `scripts/` một cách mù quáng: `test_import_august.mjs` có đăng nhập Supabase và thông tin tài khoản viết trong script, không phải test offline. Kiểm thử DB dùng môi trường thử được cho phép, không dùng khóa/mật khẩu hardcode đó.

## 9. Tiêu chí hoàn tất và bàn giao

- File có cấu trúc được nhận diện hoặc map tay thành công; mapping dùng lại được sau thay đổi thứ tự cột.
- Không còn tự tạo hồ sơ vì chưa ghép; người có sẵn dùng đúng ID. Không đưa tuyên bố “28 hồ sơ thiếu” nếu chưa đối chiếu danh mục đầy đủ.
- Trường nguồn không bị nhầm đơn vị hoặc mất; mọi khác biệt do tính toán có căn cứ hiển thị.
- Không mất dòng không rõ lý do; có thống kê đối soát và báo lỗi ô nguồn.
- Lưu có chống trùng ở DB, retry có kiểm chứng; mọi tháng và màn hình liên quan được cập nhật.
- Hướng dẫn ngắn cho HR về map cột, chọn hồ sơ có sẵn, xử lý lỗi và nhập lại.
- Bàn giao commit, migration cần áp dụng, kết quả test và phần đã/chưa kiểm chứng trên production. Nếu thiếu quyền DB/deploy thì báo đúng phần còn thiếu, không báo hoàn thành toàn hệ thống chỉ vì đã push Git.

## 10. Prompt giao cho 5.6-sol

> Làm việc trong D:\hr\HrmSpeeGo. Đọc PLAN_EXCEL_IMPORT_5_6_SOL.md rồi triển khai theo thứ tự các giai đoạn, bắt đầu bằng bỏ tự tạo nhân viên khi chưa ghép và hợp nhất danh mục nhân viên. Mục tiêu là Excel đa định dạng có tự nhận diện và chọn cột khi chưa rõ, ghép đúng hồ sơ hiện có, giữ đúng công/giờ/ký hiệu, nhập lại không trùng và cập nhật đầy đủ bảng công/chi tiết. Giữ cấu trúc cột nghiệp vụ và kiến trúc đơn công ty hiện tại. Kiểm thử bằng parser thật và luồng lưu/đồng bộ, không chỉ các helper. Không mặc định tên chưa khớp là người mới; không hạ ngưỡng để ép khớp; không thay dữ liệu nguồn bằng giá trị suy đoán. Tái hiện lỗi rồi sửa, ghi lại kết quả từng giai đoạn. Phân biệt rõ phần đã kiểm chứng local, migration đã áp dụng và kết quả thực tế trên deployment. Không sửa/xóa dữ liệu production để thử nghiệm.
