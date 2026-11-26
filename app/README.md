# Cloud Library Management System

Website React/Vite đã nối API Node.js và DynamoDB. Dữ liệu sách, mượn trả, xuất bản, tài khoản và dữ liệu đọc lưu ở máy chủ, không còn dùng localStorage làm nguồn dữ liệu nghiệp vụ.

Hiện chạy được tại máy với **DynamoDB Local thật**. Theo phạm vi đã chọn, **triển khai/nghiệm thu AWS để giai đoạn sau**; mã tích hợp và cấu hình hạ tầng đã chuẩn bị. Chat local là tra cứu theo quy tắc có nguồn; email local vào hộp thư thử, nhận dạng ghi âm/MP3 cloud không được giả lập thành dịch vụ đã hoạt động.

## Test API sách trước, chưa dùng database

Tại terminal trong `app`, chạy:

```powershell
npm run api:books
```

Mở **http://127.0.0.1:3002/** để xem bìa, tìm tên/tác giả, chọn sách và chuyển chương. Xem JSON tại **http://127.0.0.1:3002/api/v1/books**.

Chế độ này phục vụ 12 ấn bản Standard Ebooks đã tải kèm, chỉ cần Node.js 22.12+, không cần cài dependency, Java, Docker, DynamoDB Local hoặc cấu hình AWS. Không chạy `npm run setup:local` cho bước này. Không đọc/ghi database, không có đăng nhập và không lưu tiến độ. Đây là trang thử API riêng; giao diện ứng dụng đầy đủ vẫn dùng `npm run dev` và cần database local theo hướng dẫn bên dưới.

API thử chỉ hỗ trợ GET/HEAD:

- `GET /api/v1/health`: báo `mode: books-api-test`, `database: false`.
- `GET /api/v1/books?q=Jane%20Austen`: tìm sách trong 12 bản đã tải.
- `GET /api/v1/books/<id>`: metadata và danh sách chương.
- `GET /api/v1/books/<id>/chapters/<chapterId>`: nội dung chữ của một chương.

Có thể kiểm tra API riêng bằng `npm run test:books-api`, không cần khởi động database hoặc server khác.

Dừng bằng **Ctrl+C**. Cổng 3002 chỉ gắn vào `127.0.0.1`, dùng để phát triển/test tại máy; không dùng thay API xác thực của ứng dụng đầy đủ.

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

## Nguồn sách của bản hiện tại

Nguồn đọc chính là 12 ấn bản Standard Ebooks đã có bìa và toàn văn chữ, nhập qua `server/standard-ebooks.mjs` khi API khởi động. Kệ nguồn có tìm tên/tác giả và phân trang; bấm sách mở trình đọc trong Cloud Library. Không gọi Gutendex để lấy danh mục hoặc chuyển sang Gutenberg để đọc.

Mô tả HTML từ nguồn được đổi thành văn bản có ngắt đoạn qua `src/data/bookDescription.js`, dùng chung cho chi tiết sách ở kệ nguồn và danh mục.

Các tệp ebook/PDF trong `../cloud-library-db` vẫn được giữ. `server/legacy-source.mjs` tiếp tục kết nối dữ liệu cũ; tồn kho vật lý không được tạo tự động từ số lượng ebook. Nguồn Standard Ebooks và cách nhập lại được mô tả trong `docs/STANDARD_EBOOKS.md`.

Bản này đã gộp code trực tiếp. Không cần áp dụng script cập nhật hay tạo thêm thư mục chứa bản vá. Xem `../README.md` để bàn giao và chạy trên máy khác.

## Tài khoản thử nghiệm tại máy

| Vai trò | Email | Mật khẩu thử nghiệm |
|---|---|---|
| Quản trị | admin@cloudlibrary.demo | AdminDemo123! |
| Thủ thư | librarian@cloudlibrary.demo | LibraryDemo123! |
| Độc giả | reader@cloudlibrary.demo | ReaderDemo123! |
| Tác giả | author@cloudlibrary.demo | AuthorDemo123! |

Đây là dữ liệu phát triển riêng, chỉ tạo trong local. Không có mật khẩu AWS của chủ dự án trong mã. PDF và chương mẫu do dự án tự biên soạn. Bản sao dữ liệu local được giữ trong gói theo file đã cung cấp.

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
