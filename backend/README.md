# Cloud Library Management System

Website React/Vite đã nối API Node.js và DynamoDB. Dữ liệu sách, mượn trả, xuất bản, tài khoản và dữ liệu đọc lưu ở máy chủ, không còn dùng localStorage làm nguồn dữ liệu nghiệp vụ.

Hiện chạy được tại máy với **DynamoDB Local thật**. Theo phạm vi đã chọn, **triển khai/nghiệm thu AWS để giai đoạn sau**; mã tích hợp và cấu hình hạ tầng đã chuẩn bị. Chat local là tra cứu theo quy tắc có nguồn; email local vào hộp thư thử, nhận dạng ghi âm/MP3 cloud không được giả lập thành dịch vụ đã hoạt động.

## Chạy trong Visual Studio Code

Mở `../CloudLibrary.code-workspace`. Yêu cầu Node.js 22.12+, Java 21+ và công cụ `tar`.

```powershell
npm ci
npm run setup:local
npm run dev
```

Mở **http://127.0.0.1:5173/**. Lệnh dev khởi động DynamoDB Local cổng 8010, API cổng 3001 và website cổng 5173. Có thể dùng **Terminal → Run Task → Cloud Library: Chạy website**. Dữ liệu giữ trong `.local/`; khởi động lại không tự xóa dữ liệu.

Để chạy bằng trình gỡ lỗi của Visual Studio Code, chọn **Run and Debug → Cloud Library: Chạy toàn bộ dự án → F5**. Cấu hình nằm trong `.vscode/launch.json`; không chạy thêm một phiên `npm run dev` khi phiên F5 còn hoạt động. Có thể mở **Browser: Open Integrated Browser** và nhập địa chỉ trên để xem website ngay trong IDE. Dùng nút Stop để dừng phiên gỡ lỗi.

Không bắt buộc tạo `.env` cho local; cấu hình mặc định có sẵn. Nếu cần, sao chép `.env.example`, giữ đúng địa chỉ `127.0.0.1` và origin. Dừng dịch vụ bằng Ctrl+C trong terminal đã chạy lệnh. `npm run preview` chỉ phục vụ bản frontend đã build, không thay thế API/DynamoDB.

## Tài khoản thử nghiệm tại máy

Nguồn cũ đã được nối qua `server/legacy-source.mjs`: đọc tệp ebook trong `cloud-library-db/storage/ebooks`, chuyển nội dung theo phiên bản vào kho của website và kiểm tra bảng `Books` ở DynamoDB Local cổng 8001. Chạy khi khởi động API và mỗi 60 giây; có thể đổi `LEGACY_DB_ROOT` và `LEGACY_DYNAMODB_ENDPOINT`. Admin xem trạng thái qua `GET /api/v1/management/data-source` hoặc chạy lại bằng `POST /api/v1/management/data-source/sync`.

Tại lần kiểm tra này, nguồn có một ebook Sherlock Holmes đã nối thành công; database 8001 không hoạt động, thư mục `data/dynamodb` rỗng và không có container DynamoDB cũ. Vì vậy chưa có bằng chứng các bảng tài khoản, độc giả, phiếu mượn/tồn kho cũ đã được nhập. Kết nối hiện là đồng bộ danh mục/tài liệu một chiều; không ghi vào nguồn cũ, không nhập mật khẩu hoặc tự gán tồn kho chưa đối chiếu. Các PDF riêng tư chưa có hồ sơ xét duyệt tương ứng được giữ nguyên ở nguồn.

Theo lựa chọn chỉ dùng dữ liệu hiện có trong thư mục: ebook được đưa vào danh mục đọc (20 phần); ba đường dẫn PDF riêng tư được kết nối vào vùng kiểm tra của admin tại **Dịch vụ thư viện → Nguồn dữ liệu**. Các PDF có cùng nội dung được lưu một bản theo hàm băm. Đã xác minh admin mở được (200), độc giả bị chặn (403). Nguồn gốc không bị thay đổi.

| Vai trò | Email | Mật khẩu thử nghiệm |
|---|---|---|
| Quản trị | admin@cloudlibrary.demo | AdminDemo123! |
| Thủ thư | librarian@cloudlibrary.demo | LibraryDemo123! |
| Độc giả | reader@cloudlibrary.demo | ReaderDemo123! |
| Tác giả | author@cloudlibrary.demo | AuthorDemo123! |

Đây là dữ liệu phát triển riêng, chỉ tạo trong local. Không có mật khẩu AWS của chủ dự án trong mã. PDF và chương mẫu do dự án tự biên soạn. Bản sao trước khi sửa nằm trong `.local/backups/` trên máy làm việc.

## Chức năng đã tích hợp

- Độc giả: đăng ký/đăng nhập, hồ sơ, khôi phục/đổi mật khẩu; danh mục, tìm kiếm/lọc, yêu thích, PDF/chương, mốc đọc theo phiên bản và lịch sử riêng.
- Tác giả: hồ sơ, bản thảo/chương, upload PDF/bìa, xác nhận quyền, gửi duyệt, yêu cầu sửa/từ chối, revision mới giữ bản xuất bản cũ và lượt xem.
- Thủ thư: duyệt, bàn giao, trả/hủy phiếu; bản sách, tra mã, bảo trì, gia hạn, hàng chờ và ghi nhận thu phạt.
- Quản trị: sách/thể loại/tài khoản, duyệt tác giả/tác phẩm, quy định, báo cáo CSV, nhật ký, sách nổi bật, nguồn tri thức và hộp thư local.
- Trợ lý: hội thoại riêng, nguồn trả lời, dữ liệu sách/tồn kho và phiếu của người hỏi; adapter Bedrock/RAG, Transcribe, Polly/Azure và SES cho AWS.

Máy chủ kiểm tra quyền/chủ sở hữu, phiên bản dữ liệu và yêu cầu lặp. Giao dịch DynamoDB ngăn duyệt vượt số bản. Tồn kho loại sách đang mượn/giữ/bảo trì; worker xử lý hết hạn giữ và thư nhắc. Múi giờ nghiệp vụ là Việt Nam.

## Kiểm tra

Giữ `npm run dev` đang chạy rồi dùng terminal khác:

```powershell
npm run check
npm run test:e2e
npm run build:lambda
npm run infra:prepare
```

`check` gồm lint, build và kiểm thử nghiệp vụ với bảng DynamoDB Local riêng. Kiểm thử giao diện dùng Microsoft Edge trên Windows; CI dùng Chromium. Báo cáo trình duyệt nằm trong `playwright-report/`. GitHub Actions đã có tệp workflow kiểm tra; chưa chạy trên GitHub trong phiên làm việc này.

## Tài liệu và triển khai

- [Đối chiếu yêu cầu, giới hạn và các bước còn cần nghiệm thu](docs/DOI_CHIEU_HOAN_THIEN.md).
- [Rà soát và sửa chức năng ngày 20/11/2026](docs/RA_SOAT_CHUC_NANG_20261120.md).
- [Dịch vụ AWS, cấu hình và hướng dẫn triển khai](docs/AWS_DEPLOYMENT.md).
- [API và mô hình DynamoDB](docs/API_DYNAMODB.md).
- [Kết quả kiểm tra tại máy](docs/KET_QUA_KIEM_TRA.md).
- `infra/deploy.example.json`: cấu hình triển khai mẫu. `npm run aws:deploy` tạo change set; thêm `-- --apply` để áp dụng khi đã có phiên AWS hợp lệ.

Thiết kế hiện dành cho đồ án quy mô nhỏ, giới hạn 5.000 bản ghi nghiệp vụ trong phân vùng. Chưa có kết quả đo tải, khôi phục hay nghiệm thu cloud thực tế. Xem tài liệu đối chiếu trước khi gọi đây là bản sẵn sàng vận hành chính thức.
