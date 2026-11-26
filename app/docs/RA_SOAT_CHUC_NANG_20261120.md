# Rà soát chức năng ngày 20/11/2026

Phạm vi lần này là toàn bộ ứng dụng chính trong `CloudLibraryManagementSystem-main`, đối chiếu PDF tổng thể v4.0, đề cương Word và ba sơ đồ kiến trúc. Theo yêu cầu mới của chủ dự án, triển khai và nghiệm thu AWS được để lại cho giai đoạn sau. Dự án database cũ được giữ làm tham khảo, không bị ghi đè.

## Các lỗi và phần thiếu đã cập nhật trực tiếp

1. **Sách bị ẩn:** thống nhất điều kiện công khai ở danh mục, chi tiết, cấp quyền đọc, toàn văn, lượt xem, tiến độ, mượn/đặt trước và ngữ cảnh AI. Trạng thái `hidden` không còn lọt qua điều kiện chỉ loại `draft`.
2. **Chi tiết ngoài trang đầu:** API chi tiết trả đủ metadata của sách được yêu cầu, không tìm trong riêng trang danh mục đầu tiên.
3. **Dữ liệu công khai:** bỏ email tác giả và khóa lưu trữ nội bộ khỏi danh mục/snapshot công khai; danh mục tác giả liên kết theo mã và danh sách đầu sách.
4. **Hồ sơ nộp lại:** giao diện chọn hồ sơ hiện hành sau một lần bị từ chối, hiển thị đúng trạng thái chờ và khóa chỉnh sửa khi đang xét duyệt. Lịch sử hồ sơ cũ được giữ.
5. **Minh chứng tác giả:** bổ sung tải PDF/ảnh riêng tư thay cho liên kết; máy chủ kiểm tra đúng chủ sở hữu, loại tệp và mục đích tải. Chỉ chủ hồ sơ và admin mở được tệp.
6. **Sửa tác phẩm đã xuất bản:** giữ liên kết đầu sách khi yêu cầu sửa/từ chối; lần duyệt lại cập nhật cùng đầu sách, giữ bản cũ cho tới khi duyệt và đánh dấu revision cũ `superseded`.
7. **Thu hồi quyền tác giả:** admin không thể xuất bản revision đang chờ khi người nộp đã bị thu hồi quyền hoặc bị khóa. Không tự xóa sách đã xuất bản.
8. **Tiến độ đọc:** lưu cả cách chuyển trang; chờ lưu khi bấm rời trình đọc, cập nhật bản ghi trong phiên để mở lại ngay đúng vị trí. Các yêu cầu lưu trong một trình đọc được xếp thứ tự.
9. **Đổi tài khoản:** phản hồi đến chậm từ tài khoản cũ không được thay dữ liệu phiên mới. Bản lưu đọc đang chờ cũng kiểm tra lại phiên trước khi gửi.
10. **Hàng chờ và cấu hình:** bỏ qua người chờ đã khóa; giải phóng giữ chỗ không còn hợp lệ; không chấp nhận thời gian giữ hoặc số ngày gia hạn bằng 0. Giữ mức phạt 0 và số lượt gia hạn 0 khi admin chủ động cấu hình.
11. **Tài khoản quản trị:** chặn tạo tài khoản local không có mật khẩu; đồng bộ gợi ý tối thiểu 10 ký tự; thao tác đặt mật khẩu có thể tiếp tục an toàn khi máy chủ nhận lại cùng yêu cầu.
12. **Trải nghiệm:** bổ sung bản dịch cho dịch vụ thư viện, khôi phục/đổi mật khẩu và hồ sơ tác giả; sửa chú thích lịch sử chat thành lưu theo tài khoản, hiển thị thời gian tin nhắn và mô tả đúng chế độ tra cứu local.
13. **Chạy trong IDE:** thêm `.vscode/launch.json`, khởi chạy cấu hình **Cloud Library: Chạy toàn bộ dự án** bằng trình gỡ lỗi của Visual Studio Code và mở website trong tab trình duyệt tích hợp.
14. **Quầy quét mã:** từ kết quả tra mã bản sách, thủ thư có thể xác nhận bàn giao hoặc nhận trả ngay tại dòng của bản sách, dùng cùng kiểm tra quyền/phiên bản và quy tắc tồn kho của luồng mượn trả.

## Đối chiếu các nhóm nghiệm thu

| Nhóm theo PDF | Kết quả rà soát tại máy |
|---|---|
| TC01: tài khoản, hồ sơ, đổi phiên | Có API và form; kiểm thử đăng ký, reset, khóa tài khoản, quyền và phản hồi phiên cũ. Xác minh Cognito để giai đoạn AWS. |
| TC02: danh mục/tìm kiếm/thể loại | Có chuẩn hóa tiếng Việt, bộ lọc/sắp xếp/cursor; kiểm thử thể loại mới, đổi tên, chống trùng và chuyển tham chiếu. |
| TC03: công khai/nổi bật/phổ biến | Có cờ biên tập, lượt xem theo ngày và điều kiện công khai thống nhất; kiểm thử hidden và lượt xem không lặp. |
| TC04: yêu thích/lịch sử | Có dữ liệu riêng theo tài khoản; kiểm thử không trùng, xóa lịch sử không xóa tiến độ và không đọc được dữ liệu người khác. |
| TC05–07: trình đọc | Có PDF/chương, zoom, cài đặt và các cách chuyển trang; kiểm thử trình duyệt mở PDF thật và đọc tiếp trang 3 ngay sau khi thoát. Các nhánh PDF scan/lỗi trích chữ đã rà mã; chưa thử mọi loại PDF bên ngoài. |
| TC08: hồ sơ tác giả | Có minh chứng URL hoặc file, xét duyệt và cấp quyền cùng dữ liệu ứng dụng; kiểm thử quyền file và hồ sơ nộp lại. |
| TC09: bản thảo/upload | Có kiểm tra nguồn đọc và quyền nội dung, nháp không công khai, gửi duyệt khóa nội dung; kiểm thử tạo/gửi trên giao diện và tệp sai định dạng. |
| TC10: revision | Kiểm thử yêu cầu sửa, thu hồi quyền, duyệt lại cùng đầu sách và giữ lịch sử bản cũ. |
| TC11: mượn/trả | Kiểm thử cả chuỗi chính, nhánh hủy/từ chối, yêu cầu lặp và tranh chấp bản cuối; dùng DynamoDB Local thật. |
| TC12: quản trị | Có sách/thể loại/tài khoản/cấu hình, ẩn thay xóa; kiểm thử số bản tối thiểu, quyền thủ thư, admin cuối và chính sách không hợp lệ. |
| TC13: thống kê/nhật ký | Đã rà nguồn dữ liệu, quyền admin, bộ lọc và xuất CSV. Bộ kiểm thử không thay thế việc kiểm tra thủ công mọi tổ hợp lọc trên từng báo cáo. |
| TC14: trợ lý | Chat theo chủ sở hữu, nguồn/phiên bản, giới hạn đầu vào và lỗi; local tra cứu quy tắc. Sinh câu trả lời Bedrock/RAG cần nghiệm thu khi triển khai AWS. |
| Mở rộng trong Word/sơ đồ | Có hàng chờ, gia hạn, tính/ghi nhận thu phạt, bản sách và outbox nhắc hạn; audio có giao diện và adapter cloud. |

## Những phần cố ý để lại

- Chưa triển khai AWS, chưa gọi thật Cognito/Bedrock/SES/Transcribe/Polly/Azure. Không coi bộ thay thế dịch vụ trong kiểm thử là bằng chứng cloud hoạt động.
- Quét mã hỗ trợ thiết bị nhập như bàn phím và nhập mã bằng tay; camera QR, OCR và thanh toán trực tuyến không thuộc bản bắt buộc theo PDF và chưa được nghiệm thu.
- Chưa nghiệm thu Safari/Firefox, toàn bộ thiết bị cảm ứng, toàn bộ PDF scan/lớn hoặc mọi câu hỏi AI. Không cam kết đã kiểm tra mọi tình huống chỉ dựa vào số kiểm thử tự động.
- Bản đồ án vẫn có giới hạn dữ liệu/quy mô đã ghi trong `DOI_CHIEU_HOAN_THIEN.md`; chưa phải kết quả nghiệm thu hiệu năng sản xuất.

Kết quả thực chạy và số kiểm thử cuối được ghi tại `KET_QUA_KIEM_TRA.md`. Có thể mở workspace, chọn cấu hình chạy trên, rồi nhấn F5 để khởi động lại; dừng bằng nút Stop của trình gỡ lỗi.
