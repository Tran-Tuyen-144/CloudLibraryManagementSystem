# Cloud Library — bản code đã gộp

Bản này đã ghép các thay đổi vào code chính, dùng để tiếp tục phát triển hoặc bàn giao cho thành viên trong nhóm. Không cần chạy gói vá hay tạo thư mục `biasach`, `nguonsach`, `suamota`.

## Đã tích hợp

- Nguồn đọc chính: 12 ấn bản tiếng Anh từ Standard Ebooks, kèm bìa và toàn văn chữ của 447 phần/chương, gồm các trang phụ của ấn bản.
- Bấm sách → **Đọc trong Cloud Library**; nội dung được phục vụ trong web, không chuyển sang Gutenberg.
- Trang chính có tìm kiếm theo tên/tác giả và phân trang; sách mới cũng nằm trong danh mục chung.
- Phần mô tả ở chi tiết sách đã chuyển HTML thành văn bản, giữ xuống đoạn, không hiện `<p>`, `<a>`, `href`.
- Các luồng đăng nhập, vai trò, yêu thích, tiến độ đọc và chức năng thư viện hiện có được giữ lại.

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

## Chạy ứng dụng đầy đủ trên máy mới

Cần Node.js **22.12+**, Java **21+** và công cụ `tar`. Khi cài lần đầu cần Internet để tải dependency và DynamoDB Local. Không cần tài khoản AWS để chạy local.

1. Giải nén ZIP sang một vị trí mới. Gói có bản sao dữ liệu từ ZIP đã cung cấp; không chép đè database của một bản đang dùng.
2. Mở `CloudLibrary.code-workspace` bằng VS Code.
3. Mở Terminal tại thư mục `app`, chạy:

```powershell
npm ci
npm run setup:local
npm run dev
```

4. Mở **http://127.0.0.1:5173/**.

Nếu terminal đang ở thư mục ngoài cùng có `app` và `cloud-library-db`, chạy `Set-Location .\app` trước. Không chạy `npm ci` tại thư mục ngoài cùng.

Lệnh `npm run dev` khởi động database local cổng **8010**, API cổng **3001** và website cổng **5173**. Chỉ chạy một phiên. Dừng bằng **Ctrl+C**. Lần sau chỉ cần `npm run dev` tại `app`.

Lúc API khởi động, 12 sách Standard Ebooks sẽ được nhập thêm nếu chưa có. Đọc các sách này không cần gọi máy chủ nguồn bên ngoài. Không cần Python để chạy hoặc đọc sách; Python chỉ dùng khi chủ động nhập lại dữ liệu nguồn bằng script tùy chọn.

## Tài khoản thử local

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Độc giả | reader@cloudlibrary.demo | ReaderDemo123! |
| Quản trị | admin@cloudlibrary.demo | AdminDemo123! |
| Thủ thư | librarian@cloudlibrary.demo | LibraryDemo123! |
| Tác giả | author@cloudlibrary.demo | AuthorDemo123! |

Nếu dùng database khác và đã đổi mật khẩu, dùng mật khẩu hiện tại của database đó.

## Tiếp tục làm ở đâu

| Thành phần | Thư mục |
| --- | --- |
| Giao diện React, trang đọc, các trang chức năng | `app/src/` |
| API và nghiệp vụ đang chạy | `app/server/` |
| Bản sách Standard Ebooks và ghi nguồn/giấy phép | `app/server/data/standard-ebooks/` |
| Bìa sách đã tải | `app/public/covers/standard-ebooks/` |
| Kiểm tra tự động | `app/test/` |
| Dữ liệu database và nội dung chạy local | `app/.local/` |
| Phần database cũ, script và file ebook/PDF cần giữ | `cloud-library-db/` |
| Tài liệu yêu cầu gốc | `requirements/` |

`app` là ứng dụng chính. Không cần chạy một website thứ hai trong `cloud-library-db`. Các sách TXT cũ vẫn được nối qua `app/server/legacy-source.mjs` bằng đường dẫn tương đối, nên giữ `app` và `cloud-library-db` cạnh nhau.

Bản sao dữ liệu trong ZIP giữ nguyên từ file được cung cấp trước đó. Dữ liệu hoặc thao tác mới chỉ có trên máy cá nhân sau khi gửi ZIP chưa tự xuất hiện trong gói này. Các sách Standard Ebooks và bản sửa giao diện đã được gộp đầy đủ.

## Kiểm tra và tài liệu

Giữ `npm run dev` chạy, mở terminal khác tại `app`:

```powershell
npm run check
```

Code nguồn đã qua 39 kiểm tra Node, lint/build và mô phỏng luồng đọc với API thật. Bản sửa mô tả đã kiểm tra trên dữ liệu của cả 12 sách. Chưa đối chiếu trực quan bằng trình duyệt thật trong môi trường kiểm tra.

- `app/docs/STANDARD_EBOOKS.md`: nguồn và danh sách sách.
- `app/docs/STANDARD_EBOOKS_VERIFICATION.md`: kết quả và giới hạn kiểm tra.
- `app/README.md`: tài liệu ứng dụng.
- `app/docs/API_DYNAMODB.md`: API và database.
- `app/docs/AWS_DEPLOYMENT.md`: cấu hình để làm tiếp phần AWS; bản này chạy local.

Không kèm `node_modules` hoặc bộ cài Java/DynamoDB Local. Đây là code và dữ liệu đã gộp, không phải ứng dụng Windows được cài sẵn.
