# Hướng dẫn nhập Excel chấm công

1. Mở **Bảng công → Import Excel**, chọn tháng dự phòng cho file ma trận không ghi tháng/năm, rồi tải `.xlsx` hoặc `.xls`.
2. Chọn cách tính:
   - **Ưu tiên Công/Giờ trong Excel** nếu file đã chốt số công, số giờ, tăng ca hoặc trễ/sớm.
   - **Tính lại theo Vào/Ra** nếu file chỉ là nhật ký máy chấm công.
   - Với ma trận ngày, xác nhận ô số là **Công** hay **Giờ**. Giá trị `0.5` có ý nghĩa khác nhau ở hai chế độ.
3. Nếu hệ thống chưa nhận ra file, chọn sheet, hàng tiêu đề và ghép từng cột Excel với cột hệ thống. Cột không dùng chọn **Bỏ qua**. Mapping chỉ được ghi nhớ sau khi import được xác nhận.
4. Ở bước đối soát nhân viên, chọn hồ sơ đã có trong Lumi. Phần trăm hiển thị chỉ là độ giống tên/mã, không phải xác suất cùng người. Tên chưa khớp mặc định không tạo hồ sơ mới.
5. Chỉ quản trị viên mới có lựa chọn tạo hồ sơ. Hãy dùng lựa chọn này khi đã kiểm tra chắc chắn nhân viên chưa tồn tại. Có thể chọn **Bỏ qua** cho người không cần nhập.
6. Sửa mọi lỗi được chỉ rõ theo `Sheet!Ô` rồi phân tích lại. Hệ thống không ghi dữ liệu khi còn ngày sai, công thức lỗi hoặc ký hiệu chưa hiểu.
7. Sau khi xác nhận, hệ thống cập nhật bản ghi cùng nhân viên/ngày/ca, không chèn thêm chỉ vì giờ đã sửa. Nếu ngày đó thuộc nguồn chấm công khác hoặc không đủ thông tin phân biệt nhiều ca, import dừng và báo xung đột.
8. File có nhiều tháng sẽ tổng hợp lại tất cả tháng bị ảnh hưởng. Nếu phần tổng hợp lỗi sau khi log đã lưu, dùng chức năng tổng hợp lại bảng công; không cần import file lần nữa.

File chỉ chứa ảnh, file bị mã hóa, hoặc thiếu cả mã/tên nhân viên hay ngày chấm công cần được bổ sung thông tin trước khi nhập.
