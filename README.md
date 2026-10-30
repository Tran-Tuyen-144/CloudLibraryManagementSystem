# Cloud Library Management System

Hệ thống quản lý thư viện với bốn vai trò: **Độc giả, Tác giả, Thủ thư và Quản trị viên**. Người dùng tra cứu, đọc online hoặc mượn sách mang về; tác giả soạn và gửi tác phẩm để admin xét duyệt.

## Trạng thái hiện tại

**Frontend v1 đã hoàn thiện các luồng chính với dữ liệu demo lưu trong trình duyệt.** Dự án còn phần xác thực máy chủ, API, dữ liệu dùng chung và triển khai AWS.

- Frontend: React, Vite, JavaScript, CSS, Lucide React và PDF.js.
- Cơ sở dữ liệu đã chọn cho backend: **Amazon DynamoDB**.
- Dịch vụ AI đã chọn: **Amazon Bedrock**.
- Trợ lý hiện tại tra cứu danh mục bằng logic demo; chưa gọi mô hình Bedrock.
- Dữ liệu localStorage chưa đồng bộ giữa các thiết bị hoặc trình duyệt.
- Kiểm tra quyền và nghiệp vụ ở frontend cần được thực hiện lại tại backend.

## Các phần đã có ở frontend

| Nhóm | Chức năng hiện có |
| --- | --- |
| Giao diện | Light/dark, tiếng Việt/Anh, bố cục cho nhiều kích thước màn hình. |
| Tài khoản | Đăng ký, đăng nhập demo, hồ sơ, kiểm tra mật khẩu trong trình duyệt và phân quyền giao diện. |
| Độc giả | Tìm kiếm, lọc thể loại, sắp xếp sách mới/nhiều lượt xem, yêu thích và danh mục tác giả. |
| Đọc online | Đọc PDF hoặc chương; chuyển bằng nút, vuốt hoặc cuộn liên tục; cài đặt đọc và lưu mốc đọc. |
| Tác giả | Đăng ký tác giả, soạn/sắp xếp chương, thêm liên kết ảnh bìa/PDF, xem trước và gửi duyệt. |
| Thể loại | Tác giả thêm trực tiếp và chọn từ gợi ý; admin thêm, sửa, xóa hoặc chuyển thể loại. |
| Mượn–trả | Tạo, duyệt, từ chối, bàn giao, nhận trả, hủy; giới hạn phiếu và kiểm tra số bản. |
| Thông báo | Đã duyệt, nhận sách, trả sách, hủy, từ chối, sắp đến hạn, quá hạn và đánh dấu đã đọc. |
| Quản trị | Quản lý sách/tài khoản, duyệt tác giả/tác phẩm, thống kê, nhật ký và cài đặt thư viện. |
| Khám phá | Tác phẩm mới, lượt xem và gợi ý theo dữ liệu hiện có. |

## Chạy dự án

Yêu cầu: Node.js 22.12 trở lên và npm.

    npm ci
    npm run dev

Kiểm tra và tạo bản build:

    npm run lint
    npm run build
    npm run preview

Lệnh preview dùng để kiểm tra bản build cục bộ. Hiện chưa có lệnh **npm test** và bộ kiểm thử tự động được quản lý trong repository.

## Công việc cần hoàn thiện

### 1. Chốt frontend v1

- [ ] Cập nhật lỗi ô cấp lại mật khẩu trong **src/pages/ManagementModules.jsx**: hiển thị khi sửa tài khoản; đặt newPassword và newPasswordHint trong đúng file này.
- [ ] Rà nhãn, lỗi và bản dịch Việt/Anh ở toàn bộ form/hộp thoại.
- [ ] Chuẩn hóa tên và nội dung CSS: **ReaderPage.css** cho trình đọc online; **ReaderPages.css** cho các trang dùng chung lớp reader-page. Bản được rà soát đang đặt hai nhóm này ngược tên file.
- [ ] Kiểm tra thêm cảm ứng, bàn phím, phóng to chữ, Safari và Firefox.
- [ ] Kiểm tra PDF tiếng Việt, PDF scan, liên kết lỗi và tài liệu lớn. PDF scan chưa có OCR; tùy chỉnh chữ áp dụng cho chế độ văn bản.
- [ ] Rà kích thước bundle; build hiện có cảnh báo chunk lớn, gồm phần PDF.js.
- [ ] Gắn tag FE v1 sau khi cập nhật và kiểm tra lại thay đổi cuối.

### 2. Thống nhất hợp đồng API và mô hình dữ liệu

- [ ] Chốt dữ liệu yêu cầu/phản hồi, mã lỗi, phân trang, tìm kiếm, lọc và sắp xếp.
- [ ] Thống nhất định danh người dùng từ Cognito; backend xác định người thao tác từ token.
- [ ] Thiết kế dữ liệu DynamoDB và truy vấn cho tài khoản, sách, thể loại, tác giả, bản thảo, mượn–trả, yêu thích, mốc đọc, thông báo và nhật ký.
- [ ] Chốt cách xử lý dữ liệu đã thay đổi, yêu cầu gửi lặp và thao tác đồng thời.
- [ ] Quyết định cách tạo dữ liệu thử nghiệm và việc chuyển dữ liệu cục bộ nếu cần.

| Nhóm API cần có | Phạm vi |
| --- | --- |
| Tài khoản/hồ sơ | Thông tin, vai trò, trạng thái và cập nhật hồ sơ. |
| Sách/thể loại | Danh mục, chi tiết, tìm kiếm, quản lý sách, số bản và thể loại. |
| Tác giả/bản thảo | Đăng ký, xét duyệt, bản nháp, chương và xuất bản. |
| Mượn–trả | Tạo phiếu, duyệt/từ chối, bàn giao, nhận trả và hủy. |
| Dữ liệu đọc | Yêu thích, mốc đọc, tùy chọn đọc và lượt xem. |
| Thông báo | Danh sách, số chưa đọc và trạng thái đã đọc. |
| Quản trị | Thống kê, cấu hình và nhật ký thao tác/truy cập. |
| AI | Câu hỏi, câu trả lời và sách được gợi ý. |

### 3. Xác thực và phân quyền bằng Amazon Cognito

- [ ] Thay đăng nhập demo bằng Cognito: đăng ký, xác minh email, đăng nhập và khôi phục mật khẩu.
- [ ] Xử lý token, hết phiên, làm mới phiên và đăng xuất.
- [ ] Ánh xạ bốn vai trò với quyền tại API; cập nhật quyền khi duyệt tác giả hoặc khóa tài khoản.
- [ ] Thay luồng cấp mật khẩu demo bằng cơ chế quản lý tài khoản phù hợp với Cognito.
- [ ] Kiểm tra độc giả không truy cập dữ liệu riêng của người khác; tác giả chỉ sửa bản thảo của mình; thủ thư không có quyền riêng của admin.

### 4. Backend bằng API Gateway, Lambda và DynamoDB

- [ ] Xây dựng API và kiểm tra dữ liệu đầu vào tại máy chủ.
- [ ] Lưu dữ liệu dùng chung thay cho các store demo trong trình duyệt.
- [ ] Kiểm soát số bản và trạng thái phiếu bằng cơ chế ghi có điều kiện/giao dịch phù hợp, tránh duyệt vượt tồn kho.
- [ ] Kiểm tra chủ sở hữu, phiên bản bản thảo và chống xuất bản trùng tại backend.
- [ ] Khi sửa/xóa thể loại, cập nhật tham chiếu và giữ lịch sử cần thiết.
- [ ] Ghi nhật ký từ backend, không dựa vào nhật ký do frontend tự gửi.
- [ ] Xử lý gửi lặp, lỗi mạng và trường hợp thao tác đã lưu nhưng frontend chưa nhận phản hồi.

Quy tắc mượn–trả cần giữ:

| Chuyển trạng thái | Quy tắc số bản |
| --- | --- |
| Tạo phiếu → pending | Chưa giữ bản; tính vào giới hạn phiếu đang hoạt động. |
| pending → approved | Giữ một bản nếu còn sách. |
| approved → borrowed | Bàn giao và lưu hạn trả; không trừ thêm bản lần nữa. |
| borrowed → returned | Giải phóng một bản sách. |
| Hủy phiếu pending/approved | Giải phóng bản nếu trước đó đã được giữ. |
| pending → rejected | Lưu lý do từ chối, không giữ bản. |

### 5. Lưu ảnh bìa và tài liệu bằng Amazon S3

- [ ] Xây dựng luồng tải ảnh/PDF lên S3 và lưu thông tin tệp trong dữ liệu tác phẩm.
- [ ] Kiểm tra loại tệp, dung lượng và quyền tải lên/tải xuống tại backend.
- [ ] Cấu hình truy cập và CORS cho trình đọc; chốt cách cấp URL cho nội dung cần đăng nhập.
- [ ] Quy định nơi lưu nội dung chương, giới hạn dung lượng và phiên bản.
- [ ] Xử lý thay thế tệp, tệp không còn dùng và tải lên dở dang.

Hiện frontend mới nhận liên kết ảnh bìa/PDF; chưa có quy trình upload S3.

### 6. Tích hợp trợ lý AI bằng Amazon Bedrock

- [ ] Xây dựng API AI ở backend và kết nối Bedrock.
- [ ] Truyền ngữ cảnh danh mục, tồn kho và chính sách thư viện phù hợp với câu hỏi.
- [ ] Trả về định danh sách thực tế để frontend mở đúng tác phẩm.
- [ ] Xử lý thời gian chờ, hủy yêu cầu, giới hạn sử dụng và lỗi dịch vụ.
- [ ] Kiểm tra câu trả lời không tự tạo thông tin sách, tồn kho hoặc chính sách không có trong dữ liệu.
- [ ] Cập nhật **.env.example** và rà các gói Gemini/Express theo phương án cuối; cấu hình mẫu hiện tại chưa thể hiện tích hợp Bedrock đã hoạt động.
- [ ] Thống nhất phạm vi lưu/xóa hội thoại và dữ liệu gửi tới mô hình.

### 7. Nối frontend với API

- [ ] Tạo lớp gọi API dùng chung, đính kèm token và chuẩn hóa lỗi.
- [ ] Thay logic demo trong **libraryStore.js**, **useDemoAuth.js**, **useBorrowRequests.js**, yêu thích, mốc đọc, thông báo và trợ lý bằng API.
- [ ] Bổ sung trạng thái đang tải, lỗi, thử lại, dữ liệu rỗng và phân trang.
- [ ] Sau thao tác thành công, cập nhật số bản, phiếu, thông báo, danh mục và thống kê liên quan.
- [ ] Đồng bộ dữ liệu theo tài khoản giữa các thiết bị; chốt cơ chế làm mới thông báo.
- [ ] Chỉ thông báo thao tác thành công sau khi máy chủ xác nhận đã lưu.
- [ ] Loại bỏ tài khoản mẫu và đường xử lý demo khỏi cấu hình dùng thật.

### 8. Kiểm thử, triển khai và bàn giao

- [ ] Đưa kiểm thử tự động cho nghiệp vụ quan trọng vào repository và bổ sung lệnh chạy.
- [ ] Kiểm thử API, phân quyền và các luồng trên môi trường tích hợp.
- [ ] Kiểm tra hai tài khoản cùng mượn bản cuối, xử lý lặp, bản thảo thay đổi ở phiên khác và token hết hạn giữa thao tác.
- [ ] Kiểm tra tải lại trang, lỗi mạng, tệp không truy cập được và dữ liệu nhiều trang.
- [ ] Cấu hình CI chạy lint, build và kiểm thử.
- [ ] Triển khai frontend lên phương án hosting đã chọn; cấu hình HTTPS và địa chỉ API theo môi trường.
- [ ] Triển khai backend, DynamoDB và S3; cấu hình IAM, biến môi trường và CORS.
- [ ] Thiết lập CloudWatch cho log/cảnh báo; cấu hình sao lưu, khôi phục và theo dõi chi phí.
- [ ] Hoàn thiện kiến trúc, ERD/mô hình dữ liệu, tài liệu API, phân quyền, hướng dẫn chạy và kịch bản demo.

## Thứ tự thực hiện đề xuất

1. Chốt frontend v1 và sửa lỗi cuối.
2. Thống nhất API, dữ liệu và quyền của bốn vai trò.
3. Tích hợp Cognito và API tài khoản/danh mục.
4. Hoàn thiện mượn–trả và kiểm soát tồn kho.
5. Hoàn thiện tác giả, xuất bản và lưu tài liệu S3.
6. Đồng bộ yêu thích, mốc đọc, lượt xem, thông báo và thống kê.
7. Tích hợp Bedrock.
8. Kiểm thử toàn hệ thống, triển khai và bàn giao.

## Điều kiện chốt toàn bộ dự án

- [ ] Bốn vai trò hoạt động với tài khoản và quyền thật trên backend.
- [ ] Các thiết bị dùng chung dữ liệu đã lưu trên máy chủ.
- [ ] Mượn–trả và xuất bản không tạo dữ liệu trùng hoặc vượt số bản khi thao tác đồng thời.
- [ ] Độc giả đọc được tác phẩm đã duyệt và tiếp tục từ mốc đọc được đồng bộ.
- [ ] Trợ lý dùng Bedrock qua backend và tra cứu đúng dữ liệu thư viện.
- [ ] Kiểm thử, triển khai, giám sát và tài liệu bàn giao đã hoàn thành.

## Phát triển sau phiên bản đầu

Gia hạn mượn, xử lý phí phạt, gửi thông báo qua email và gợi ý nâng cao cần được chốt yêu cầu riêng; chưa tính là chức năng đã hoàn thành trong frontend v1.
