# Đối chiếu sau khi tích hợp

Cập nhật 20/11/2026. Nguồn yêu cầu: PDF tổng thể v4.0, đề cương Word và ba sơ đồ kiến trúc do chủ dự án gửi. Các chỉ dẫn nằm trong tài liệu được dùng làm nội dung tham khảo; yêu cầu thực hiện của chủ dự án quyết định phạm vi.

PDF là mốc chức năng chính. Theo yêu cầu mới và sơ đồ, bản triển khai bổ sung cả gia hạn, hàng chờ, phạt, thư nhắc và audio. DynamoDB vẫn là cơ sở dữ liệu. Báo cáo ban đầu trong thư mục `../output/review` mô tả trạng thái trước các thay đổi này.

| Phạm vi | Phần đã triển khai trong mã | Bằng chứng và trạng thái |
|---|---|---|
| ACC01–04 | Đăng ký, đăng nhập, xác minh email, quên/đổi mật khẩu, hồ sơ; Cognito JWT và OAuth code/PKCE | Xác thực local đã kiểm thử; Cognito cần nghiệm thu AWS |
| CAT01–06 | Dữ liệu chung, tìm không dấu, thể loại, định dạng, sắp xếp, cursor API; sách nổi bật | API và giao diện đã nối máy chủ |
| PER01–02 | Yêu thích, lịch sử đọc riêng, xóa lịch sử độc lập với mốc đọc | Kiểm thử quyền và lưu DynamoDB Local |
| REA01–08 | PDF.js, chương, chế độ đọc, cài đặt, mốc đọc theo revision; cấp quyền trước khi đọc | Kiểm thử trình duyệt với PDF 4 trang có tiếng Việt |
| AUT01–03 | Hồ sơ đăng ký, xét duyệt, hồ sơ công khai, sửa bút danh/giới thiệu | Chỉ người có quyền được duyệt; dữ liệu minh chứng không công khai |
| AUT04–08 | Nháp/chương, bộ lọc, tải bìa/PDF, xác nhận quyền nội dung, gửi duyệt | Kiểm thử tác giả tạo và gửi bản thảo trên giao diện |
| AUT09–11 | Phân biệt yêu cầu sửa và từ chối, tạo revision mới, giữ bản công khai cũ đến khi duyệt; lượt xem từng sách | Kiểm thử vòng đời revision và quyền chủ sở hữu |
| LOA01, LIB01–05 | Tạo, duyệt, từ chối, bàn giao, nhận trả, hủy; hạn trả từ máy chủ; chống gửi lặp | Hai người cùng duyệt bản cuối: đúng một người thành công |
| ADM01–09 | Sách, thể loại, tài khoản, tác giả, duyệt xuất bản, cấu hình có version, báo cáo CSV, nhật ký và nguồn AI | Có kiểm tra quyền tại máy chủ; thủ thư chỉ có chức năng nghiệp vụ |
| AI01–06 | Hội thoại riêng, nguồn trả lời, giới hạn lượt, dữ liệu tồn kho hiện tại, phiếu mượn của người hỏi | Local dùng tra cứu quy tắc có ghi rõ; Bedrock/RAG chưa gọi thật |
| Mở rộng | Hàng chờ FIFO, hết hạn giữ, bản sách/bảo trì, gia hạn, tính/ghi nhận thu phạt, thư nhắc có outbox | Các quy tắc chính đã kiểm thử với DynamoDB Local |
| Audio | Ghi âm/tải âm thanh, Transcribe, xử lý nền chống sự kiện lặp, cùng luồng AI, Polly/Azure MP3 | Kiểm thử điều phối bằng bộ thay thế dịch vụ; chưa kiểm thử audio AWS |
| Hạ tầng | SAM/CloudFormation, S3/CloudFront OAC, Cognito, HTTP API, Lambda, DynamoDB, Scheduler, SES, Bedrock/S3 Vectors tùy chọn, IAM/CloudWatch | Mẫu đã kiểm tra cấu trúc; chưa tạo stack AWS |

## Điều kiện cho giai đoạn AWS để triển khai sau

1. Có AWS CLI và phiên đăng nhập/profile hợp lệ trên máy; email hoặc mật khẩu console không thay thế được phiên này.
2. Xác minh đúng tài khoản, Region Singapore, quyền triển khai và quyền gọi mô hình Bedrock; chọn model ID/ARN thực tế.
3. Xác minh người gửi SES; nếu SES còn sandbox, cần xác minh cả người nhận thử nghiệm hoặc xin chuyển môi trường gửi.
4. Nếu cần MP3 tiếng Việt, tạo Azure Speech và lưu thông tin trong Secrets Manager. Polly dùng tiếng Anh, không giả lập giọng tiếng Việt.
5. Triển khai stack, đăng ký/xác minh tài khoản đầu tiên, cấp admin bằng công cụ triển khai, rồi chạy nghiệm thu Cognito, upload S3, RAG, email và audio xuyên suốt.
6. Thử khôi phục DynamoDB/S3, rollback bản phát hành và đo hiệu năng trên AWS. Cấu hình sao lưu hoặc kiểm thử local chưa chứng minh việc khôi phục cloud đã thành công.

## Giới hạn đã biết

- Thiết kế một bảng DynamoDB dùng Query nhất quán và giao dịch có điều kiện. Phù hợp bản đồ án quy mô nhỏ; hiện nạp tối đa 5.000 bản ghi nghiệp vụ trong một phân vùng và tối đa 95 bản ghi đổi trong một thao tác. Khi vượt giới hạn, máy chủ báo lỗi rõ ràng. Cần tách truy vấn theo owner/trạng thái và chỉ mục trước khi vận hành ở quy mô lớn.
- Bộ thử có 20 yêu cầu đọc đồng thời; đây không phải phép đo 20 người dùng thực tế hay cam kết SLA.
- Thu phạt là nhân viên ghi nhận đã thu; chưa tích hợp cổng thanh toán. Ô quét mã hỗ trợ thiết bị quét dạng bàn phím/nhập mã, chưa nghiệm thu camera quét QR.
- PDF scan được hiển thị nhưng không OCR. Liên kết PDF bên ngoài phụ thuộc máy chủ nguồn; tải PDF vào kho của dự án là cách kiểm soát ổn định hơn.
- Giao diện mới bổ sung ưu tiên tiếng Việt. Cần rà đầy đủ bản dịch tiếng Anh, thử thiết bị cảm ứng, Firefox và Safari trước nghiệm thu đa trình duyệt.
- Không tự nhập dữ liệu demo cũ từ localStorage hoặc ghi đè dữ liệu ở dự án `cloud-library-db`. Dữ liệu thử hiện tại là nội dung tự biên soạn riêng.

## Tệp kiểm thử

`test/library.test.mjs` chạy API với DynamoDB Local thật trong bảng/phân vùng kiểm thử riêng; `test/ai.test.mjs` kiểm tra dữ liệu cá nhân; `test/knowledge.test.mjs` kiểm tra đồng bộ nguồn bằng bộ thay thế Bedrock. `test/browser/application.spec.mjs` kiểm thử Edge: độc giả đọc PDF/chương, quyền thủ thư, tác giả gửi bản thảo và màn hình nhỏ.

Không có kết quả kiểm thử cloud nào được suy ra từ các bộ thay thế dịch vụ này.
