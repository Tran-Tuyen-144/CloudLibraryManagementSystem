# Cloud Library — Sườn database

Bộ mã nguồn chuẩn bị cấu trúc dữ liệu và các thao tác phục vụ
dự án Cloud Library.

Giai đoạn hiện tại tập trung hoàn thiện sườn code, kiểm tra
cấu hình và mô hình dữ liệu. Việc kết nối, tạo bảng và kiểm thử
trên database sẽ thực hiện ở giai đoạn tích hợp.

## 1. Thành phần chính

| Thư mục/file | Vai trò |
|---|---|
| config/ | Cấu hình kết nối và mô tả schema |
| setup/ | Script chuẩn bị bảng, chỉ mục và tài khoản |
| seed/ | Script tạo dữ liệu mẫu cho giai đoạn kiểm thử |
| books/ | Nhập metadata sách từ nguồn bên ngoài |
| authors/, admin/, copies/ | Thao tác với sách tác giả, xét duyệt và bản sách |
| loans/, reservations/ | Mượn, trả, gia hạn và đặt trước |
| favorites/, notifications/ | Sách yêu thích và thông báo |
| reading/ | Mô hình tiến độ đọc và dấu trang |
| api/ | API thử nghiệm đã có trong mã nguồn |
| src/ | Giao diện React, cần phối hợp tích hợp với backend |
| check-*.js | Các script kiểm tra cấu trúc hoặc dữ liệu |

## 2. Thiết kế dữ liệu

Tám bảng cơ sở đã có script chuẩn bị trong mã nguồn:

- Books
- BookCopies
- Readers
- Loans
- Reservations
- Accounts
- Favorites
- Notifications

Hai phần thiết kế bổ sung:

| Phần | Khóa chính | Khóa sắp xếp | Trạng thái |
|---|---|---|---|
| ReadingProgress | readerId | bookId | Có mô tả schema và hàm tạo bản ghi |
| Bookmarks | readerId | bookmarkKey | Có mô tả schema và hàm tạo bản ghi |

bookmarkKey có dạng bookId#bookmarkId.

Số lượng bảng nêu trên mô tả thiết kế trong code,
chưa xác nhận số bảng thực tế trên database.

## 3. Chạy mẫu tiến độ đọc và dấu trang

Chạy tại thư mục gốc dự án:

```powershell
node config/reading-schema.js
node reading/reading-model.js
```

Hai lệnh này hiển thị thiết kế và tạo object mẫu trong bộ nhớ.

Mô hình vị trí đọc hỗ trợ:

- scrollFraction: số từ 0 đến 1.
- pdfPage: số nguyên dương, bắt đầu từ trang 1.

sourceId xác định nguồn nội dung.
contentVersion xác định phiên bản nội dung mà vị trí đọc tham chiếu.

Các hàm hiện kiểm tra định dạng đầu vào; chưa đối chiếu người đọc,
sách, phiên bản nội dung hoặc số trang với dữ liệu thực tế.

## 4. Các phần cần phối hợp tích hợp

- Kết nối database và kiểm thử các thao tác đọc/ghi.
- Hoàn thiện thao tác lưu, lấy, sửa và xóa dữ liệu đọc sách.
- Lấy danh tính người đọc từ phiên đăng nhập đã xác thực.
- Thống nhất đường dẫn API và định dạng phản hồi với frontend.
- Chuyển dữ liệu đang lưu ở trình duyệt sang backend khi phù hợp.
- Bổ sung quy trình tải nội dung TXT cho sách mới nhập;
  script nhập metadata hiện chưa tự tải nội dung sách.

## 5. Tài liệu liên quan

README_DATABASE.md chứa thiết kế tám bảng cơ sở, các chỉ mục
và hướng dẫn DynamoDB Local cho giai đoạn tích hợp.

Các lệnh tạo bảng, seed và thao tác nghiệp vụ trong tài liệu đó
cần được sử dụng theo kế hoạch kiểm thử của nhóm.

.env.example là mẫu biến môi trường để điền khi tích hợp xác thực.