# Cloud Library — Hướng dẫn database local

## 1. Môi trường
- test 
- Node.js, npm và Docker.
- Mã nguồn JavaScript dùng CommonJS.
- Database: DynamoDB Local.
- Endpoint: http://127.0.0.1:8001
- Cấu hình kết nối: config/db.js
- Docker Compose: compose.yaml
- Dữ liệu database được lưu tại data/dynamodb theo cấu hình volume.

Phần này bàn giao database local. Triển khai AWS và tích hợp
frontend/Cognito sẽ thực hiện ở giai đoạn sau.

## 2. Chạy lại database đã có

Chạy các lệnh tại thư mục gốc dự án:

```powershell
docker compose up -d
node check-db.js
```

Kiểm tra liên kết và số đếm:

```powershell
node check-all-integrity.js
```

Kiểm tra cấu trúc:

```powershell
node check-schema.js
node setup/add-book-indexes.js preview
```

- check-schema.js kiểm tra khóa của 8 bảng và 9 GSI nền.
- add-book-indexes.js preview kiểm tra thêm 2 GSI của Books.
- Các lệnh kiểm tra trên chỉ đọc dữ liệu/cấu trúc.
- Khi kiểm tra liên kết giữa nhiều bảng, tạm ngừng thao tác ghi.

## 3. Khởi tạo trên máy mới

Chỉ dùng phần này khi thiết lập một database local mới.

Cài thư viện và bật database:

```powershell
npm ci
docker compose up -d
```

Tạo các bảng và tài khoản mẫu:

```powershell
node setup/create-tables.js
node setup/create-loans-table.js
node setup/create-feature-tables.js
node setup/setup-accounts.js run
node setup/setup-admin.js run
```

Tạo bộ dữ liệu mẫu cơ bản:

```powershell
node seed/seed-demo.js
node seed/seed-reservation-demo.js
```

Hai script seed tạo BOOK001, BOOK002, READER001, READER002,
các bản sách và phiếu mượn mẫu liên quan.

Seed có điều kiện chống ghi đè. Nếu mã mẫu đã tồn tại,
giao dịch có thể bị hủy; không xóa dữ liệu để chạy lại seed.

Liên kết tài khoản độc giả mẫu:

```powershell
node setup/link-reader-account.js run ACCOUNT_READER_DEMO001 READER001
node setup/link-reader-account.js run ACCOUNT_READER_DEMO002 READER002
```

Tạo chỉ mục Books:

```powershell
node setup/add-book-indexes.js preview
node setup/add-book-indexes.js run
```

Kiểm tra sau khi khởi tạo:

```powershell
node check-all-integrity.js
node check-schema.js
node setup/add-book-indexes.js preview
```

Bộ seed cơ bản không khôi phục toàn bộ dữ liệu đã phát sinh
trong quá trình thử nghiệm trên máy bàn giao.

## 4. Các bảng

Tất cả khóa PK/SK bên dưới dùng kiểu String (S).

| Bảng | PK | SK | Nội dung |
|---|---|---|---|
| Books | bookId | — | Thông tin đầu sách |
| BookCopies | copyId | — | Từng bản sách giấy |
| Readers | readerId | — | Hồ sơ độc giả |
| Loans | loanId | — | Phiếu mượn và lịch sử trả |
| Reservations | reservationId | — | Yêu cầu đặt trước và bản ghi khóa |
| Accounts | accountId | — | Tài khoản và vai trò |
| Favorites | readerId | bookId | Sách yêu thích của độc giả |
| Notifications | notificationId | — | Thông báo cho độc giả |

## 5. Các chỉ mục GSI

Hiện có 11 GSI, ProjectionType là ALL.

| Bảng | GSI | PK | SK |
|---|---|---|---|
| Books | ByOwner | ownerAccountId | updatedAt |
| Books | ByStatusUpdatedAt | status | updatedAt |
| BookCopies | ByBook | bookId | copyId |
| Loans | ByReader | readerId | createdAt |
| Loans | ByCopy | copyId | createdAt |
| Loans | ByStatusDueDate | status | dueDate |
| Reservations | ByBook | bookId | queueKey |
| Reservations | ByReader | readerId | createdAt |
| Reservations | ByStatusExpiry | status | expiresAt |
| Notifications | ByReader | readerId | createdAt |
| Notifications | ByDeliveryStatus | deliveryStatus | nextAttemptAt |

Hướng truy vấn cho backend:

- Sách của tác giả: Books/ByOwner, ownerAccountId = accountId.
- Sách chờ duyệt: Books/ByStatusUpdatedAt, status = PENDING_REVIEW.
- Bản sách của một đầu sách: BookCopies/ByBook.
- Lịch sử mượn của độc giả: Loans/ByReader.
- Đặt trước của độc giả: Reservations/ByReader.
- Sách yêu thích: Query Favorites theo readerId.
- Thông báo của độc giả: Notifications/ByReader.

Các script authors/list-books.js và admin/list-pending-books.js
hiện sử dụng Scan. Backend cần dùng Query tương ứng để tận dụng
hai chỉ mục Books mới tạo.

GSI có thể chưa phản ánh ngay thay đổi vừa ghi và không hỗ trợ
ConsistentRead: true. Trước thao tác cần trạng thái/quyền mới nhất,
đọc lại bảng chính và kiểm tra điều kiện khi ghi.

Bản ghi thiếu một trường khóa của GSI sẽ không nằm trong GSI đó.
Ví dụ sách Gutenberg không có ownerAccountId sẽ không nằm trong
ByOwner; thông báo không có nextAttemptAt sẽ không nằm trong
ByDeliveryStatus.

## 6. Liên kết tài khoản và độc giả

Liên kết phải khớp hai chiều:

- Accounts.readerId → Readers.readerId
- Readers.accountId → Accounts.accountId

Tài khoản có vai trò READER cần hồ sơ độc giả tương ứng.
Tài khoản AUTHOR hoặc ADMIN không bắt buộc có hồ sơ độc giả.

Tài khoản mẫu:

| accountId | Vai trò | readerId |
|---|---|---|
| ACCOUNT_AUTHOR_DEMO | AUTHOR | — |
| ACCOUNT_ADMIN_DEMO | ADMIN | — |
| ACCOUNT_READER_DEMO001 | READER | READER001 |
| ACCOUNT_READER_DEMO002 | READER | READER002 |

Các tài khoản này có accountKind = LOCAL_DEMO.
Script link-reader-account.js chỉ xử lý tài khoản độc giả mẫu local.

Backend cần có quy trình riêng để liên kết hồ sơ độc giả khi
tích hợp tài khoản Cognito thật.

## 7. Các trường và quy tắc dữ liệu chính

### Books

Thông tin cơ bản:
bookId, title, author/authors, source, status, createdAt, updatedAt.

Số đếm:
totalCopies, availableCopies, heldCopies, waitingReservationCount.

- totalCopies = số bản ghi BookCopies của đầu sách.
- availableCopies = số bản AVAILABLE.
- heldCopies = số bản HELD.
- waitingReservationCount = số yêu cầu RESERVATION có trạng thái WAITING.
- reservationVersion dùng kiểm soát thay đổi hàng đợi.

Sách do tác giả đăng có thêm:
ownerAccountId, editVersion, digitalAccess, submission, review.

Trạng thái sách tác giả:
DRAFT → PENDING_REVIEW → ACTIVE.

Khi yêu cầu chỉnh sửa:
status trở về DRAFT, review.decision = CHANGES_REQUESTED,
review.reason chứa lý do.

Sách công khai cần có status = ACTIVE.
Backend phải kiểm tra quyền sở hữu khi sửa/gửi duyệt sách,
và quyền admin khi xét duyệt.

### BookCopies

Trạng thái:

- AVAILABLE: bản sách có sẵn.
- BORROWED: đang được mượn.
- HELD: đang giữ cho một yêu cầu đặt trước.

Liên kết hiện hành:

- BORROWED cần currentLoanId hợp lệ.
- HELD cần currentReservationId và holdExpiresAt hợp lệ.
- AVAILABLE phải không còn các trường liên kết trên.
- Dùng REMOVE để xóa liên kết đã kết thúc; không gán null.

### Readers và Loans

Readers.activeLoanCount phải bằng số Loans của độc giả
có trạng thái BORROWED hoặc OVERDUE.

Loans lưu:
readerId, bookId, copyId, status, borrowedAt, dueDate,
returnedAt, renewalCount, rulesSnapshot và thông tin tiền phạt.

Trạng thái phiếu:
BORROWED, OVERDUE, RETURNED.

Giữ phiếu RETURNED làm lịch sử.

Quy tắc mẫu hiện tại:

- Tối đa 3 phiếu đang mượn.
- Thời hạn mượn 14 ngày.
- Gia hạn tối đa 1 lần, thêm 7 ngày.
- Phạt quá hạn 5.000 VND/ngày.

Mỗi phiếu giữ rulesSnapshot để tính theo quy tắc lúc mượn.
finePaymentStatus hiện dùng:
NOT_ASSESSED, UNPAID, NOT_REQUIRED.

Các trường nhân viên như confirmedBy đang có mã mẫu
LIBRARIAN_DEMO. Khi tích hợp thật, backend cần gán danh tính
nhân viên đã xác thực.

### Reservations

Bảng chứa hai loại bản ghi:

1. entityType = RESERVATION: yêu cầu đặt trước.
2. entityType = RESERVATION_LOCK: khóa chống đặt trùng đang hoạt động.

Trạng thái yêu cầu:
WAITING, READY, FULFILLED, CANCELLED, EXPIRED.

Khóa đang hoạt động có dạng:
reservationId = ACTIVE#readerId#bookId

activeReservationId trỏ đến yêu cầu WAITING hoặc READY tương ứng.

queueKey có dạng:
createdAt#reservationId

Thời hạn giữ sách mẫu là 48 giờ.
Khi hoàn tất/hủy/hết hạn, cập nhật trạng thái, khóa, bản sách
và số đếm trong cùng quy trình giao dịch.

expiresAt là chuỗi thời gian ISO. Quy trình hết hạn phải cập nhật
các liên kết và số đếm liên quan, không chỉ xóa yêu cầu hết hạn.

### Favorites

Khóa ghép readerId + bookId chống tạo trùng cùng một sách
trong danh sách yêu thích của một độc giả.

Mỗi bản ghi có createdAt và tham chiếu đến Readers/Books.

### Notifications

Các trường chính:
notificationId, readerId, type, message, channel,
deliveryStatus, createdAt, updatedAt, readAt.

Có thể tham chiếu thêm bookId, copyId, loanId, reservationId.

Thông báo hiện tại dùng:
channel = IN_APP, deliveryStatus = STORED.

readAt thiếu hoặc null nghĩa là chưa đọc.
Thông báo được giữ làm lịch sử; trạng thái hiện tại của phiếu
hoặc yêu cầu đặt trước có thể đã thay đổi sau lúc thông báo được tạo.

## 8. Ghi dữ liệu và thời gian

Các thao tác mượn, trả, giữ sách và nhận sách phải cập nhật
những bản ghi liên quan bằng TransactWrite cùng điều kiện phù hợp.

Không sửa riêng số đếm để bỏ qua lỗi kiểm tra.
Cần xác định bản ghi hoặc liên kết gây sai lệch trước khi sửa.

Quy ước:

- createdAt, updatedAt, borrowedAt, expiresAt: thời gian ISO UTC.
- dueDate: YYYY-MM-DD, tính theo ngày Việt Nam UTC+7.
- Số lượng và tiền VND: số nguyên không âm.
- Giữ kiểm tra phiên bản/updatedAt để tránh ghi đè thay đổi đồng thời.

## 9. Nội dung sách điện tử

DynamoDB lưu metadata và tham chiếu file.

- TXT: storage/ebooks.
- PDF tác giả: storage/private-pdfs.
- digitalAccess lưu mode, format, fileKey, sha256 và thông tin liên quan.
- mode hiện có NONE, FREE, PAID.
- Nội dung PDF cần khớp phiên bản và hash đã gửi/duyệt.
- File PDF riêng phải được phục vụ qua bước kiểm tra quyền.
- PAID hiện là metadata; phần mua sách/cấp quyền đọc chưa hoàn thiện.

Khi bàn giao nội dung thử nghiệm, cần bàn giao cả dữ liệu database
và những file sách được dữ liệu đó tham chiếu.

## 10. Giới hạn của bộ kiểm tra hiện tại

check-all-integrity.js kiểm tra các liên kết và số đếm được
triển khai trong script, gồm tài khoản, mượn/trả, đặt trước,
sách yêu thích, thông báo và tài khoản liên quan đến sách tác giả.

Kết quả thành công không thay thế kiểm thử toàn bộ nghiệp vụ,
kiểm tra quyền truy cập hoặc kiểm tra nội dung file PDF/TXT.

Mã nguồn và seed không tự mang theo dữ liệu DynamoDB Local hiện có.
Để chuyển nguyên bộ dữ liệu thử nghiệm, cần bàn giao bản xuất
dữ liệu hoặc bản sao database local phù hợp, kèm các file sách.