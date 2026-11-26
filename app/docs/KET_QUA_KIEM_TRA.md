# Kết quả kiểm tra tại máy

Ngày 20/11/2026, Windows, Node.js 22, DynamoDB Local và Microsoft Edge.

| Kiểm tra | Kết quả đã quan sát |
|---|---|
| ESLint | Đạt, không có lỗi |
| Vite production build | Đạt |
| Lambda bundle | Đạt; tạo được gói và bản đồ mã nguồn |
| Mẫu SAM/CloudFormation | Tạo được 39 khai báo tài nguyên; cfn-lint trả mã 0 |
| Kiểm thử nghiệp vụ/API/điều phối | 23 đạt, 0 lỗi, khoảng 29,5 giây khi chạy cùng kiểm thử trình duyệt |
| Kiểm thử giao diện Edge | 4 đạt, 0 lỗi, khoảng 31,9 giây trong lần cuối |
| API đang chạy | Health trả ok, database DynamoDB, mode local |

Bộ nghiệp vụ kiểm tra quyền, toàn văn riêng tư, đăng ký không tự cấp admin, lọc/cursor, hai người cùng duyệt bản cuối, chuyển trạng thái và xử lý lặp, lượt xem theo ngày Việt Nam, tiến độ theo revision, bản thảo/phiên bản, khóa tài khoản, tiền phạt, hàng chờ/hết hạn giữ, gia hạn, outbox không gửi lặp, chat riêng, kiểm tra tệp, khôi phục mật khẩu và vô hiệu phiên cũ. Các kiểm thử thêm kiểm tra quyền tại REST, 20 yêu cầu đọc đồng thời, phục hồi worker audio, đồng bộ/rút nguồn và lỗi ingestion.

Kiểm thử giao diện đã mở PDF thật bằng canvas, chuyển sang chương, kiểm tra quyền điều hướng thủ thư, tạo/gửi bản thảo với xác nhận quyền, và kiểm tra màn hình rộng 390 px không tràn ngang. Hai giả định trong bộ thử đã được sửa: chọn rõ chế độ PDF thay vì bỏ qua mốc đọc được lưu, và tìm đúng bản thảo mới theo tiêu đề duy nhất thay vì chọn bản thảo cũ. Lần chạy cuối đạt cả bốn trường hợp.

Ảnh kiểm chứng nằm ở `output/screenshots/reader-desktop.png` và `output/screenshots/mobile-home.png`; báo cáo trình duyệt nằm trong `playwright-report/`. Đã xem trực quan ảnh trình đọc sau kiểm thử.

Kiểm thử audio/Knowledge Base dùng bộ thay thế dịch vụ ngoài để kiểm tra điều phối, không gọi AWS. Chưa xác nhận Cognito, RAG, SES, Transcribe, Polly/Azure, khôi phục dữ liệu hoặc tải thực tế trên AWS. Chưa chạy workflow trên GitHub. Không dùng các kết quả local để khẳng định nghiệm thu cloud.
