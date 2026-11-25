# API và lưu trữ

API dùng tiền tố `/api/v1`, JSON và `Authorization: Bearer <access-token>`. Máy chủ lấy người thao tác từ phiên xác thực, kiểm tra lại trạng thái và quyền hiện tại. Cookie HttpOnly chỉ bổ trợ làm mới phiên và tải nội dung trên cùng website; không thay thế JWT tại các route API riêng tư trên API Gateway.

| Nhóm | Route chính |
|---|---|
| Xác thực | POST `/auth/login`, `/register`, `/confirm`, `/forgot`, `/reset`, `/password`, `/refresh`, `/logout`, `/exchange` (cùng tiền tố `/auth`) |
| Danh mục | GET `/books`, `/books/:id`, `/categories`; POST `/books/:id/read-access`; GET `/books/:id/content` |
| Cá nhân | GET/PATCH `/me`; GET/PUT/DELETE `/me/favorites/:id` theo route tương ứng; GET/PUT/DELETE `/me/progress/:bookId`; GET/DELETE `/me/history`; PUT `/me/reader-settings` |
| Mượn trả | GET `/me/loans`, `/management/loans`, `/loans/:id`; POST `/loans`, `/loans/:id/cancel`, `/management/loans/:id/:action` |
| Tác giả | POST `/author-applications`; GET `/me/author-applications`; GET/PATCH `/me/author-profile`; GET/POST `/author/books`; PATCH `/author/books/:id`; POST `/author/books/:id/revisions`, `/author/books/:id/submit` |
| Quản trị | `/management/books`, `/management/categories`, `/management/reviews`, `/management/settings`, `/management/statistics`, `/management/activity-logs` |
| Tệp | POST `/uploads`; PUT vào URL S3 được cấp trong cloud; POST `/uploads/:id/complete`; GET `/files/:id` |
| Chat | GET/POST `/chat/sessions`; POST/GET `/chat/sessions/:id/messages`; DELETE `/chat/sessions/:id` |
| Audio | POST `/audio/jobs`, GET `/audio/jobs/:id`, POST `/audio/speech` |
| Lệnh giao diện | POST `/commands` với `{command,input}`; cùng hàm kiểm tra nghiệp vụ với REST |

Một số route trong bảng có phương thức khác nhau theo thao tác; danh sách chính xác và kiểm tra đầu vào nằm trong `server/app.mjs` và `server/rest.mjs`. Đây là hướng dẫn triển khai hiện tại, không phải OpenAPI đã phát hành.

Gửi `Idempotency-Key` là UUID cho thao tác ghi. Lặp lại cùng key/cùng nội dung trả kết quả đã lưu; khác nội dung trả 409. Dùng phiên bản hiện tại khi chuyển trạng thái phiếu, sửa bản thảo hoặc cấu hình. Các lỗi trả `{error:{code,message,requestId}}`; dùng requestId để tìm log thay vì ghi token/mật khẩu.

`GET /books` nhận từ khóa, thể loại, định dạng, tình trạng sẵn có, sắp xếp và cursor. Cursor gắn với bộ lọc để tránh trộn trang. Snapshot là dữ liệu đã lọc theo quyền dùng cho ứng dụng nhỏ hiện tại, không phải API xuất toàn bộ dữ liệu quản trị cho khách.

## DynamoDB

Một bảng có khóa `PK`, `SK`; partition nghiệp vụ mặc định `LIBRARY`. Mỗi sách, bản sách, tài khoản, hồ sơ, bản thảo, revision, phiếu, mốc đọc theo sách và tin nhắn chat là bản ghi riêng. Nội dung chương được chuyển sang kho tệp, chỉ giữ metadata/tham chiếu trong DynamoDB để tránh giới hạn kích thước item.

Các partition riêng lưu phiên local đã băm, mật khẩu local dùng scrypt/salt, yêu cầu chống lặp, hạn mức, metadata upload, outbox và manifest đồng bộ tri thức. Không lưu mật khẩu Cognito trong bảng. TTL dọn bản ghi tạm; kiểm tra hết hạn thực hiện trong ứng dụng nên không phụ thuộc thời điểm DynamoDB xóa TTL.

Ghi nghiệp vụ dùng `TransactWriteItems`, khóa version của META và bản ghi chống lặp trong cùng giao dịch. Khi có tranh chấp sẽ đọc nhất quán và thử lại có giới hạn; quy tắc tồn kho được tính lại trên dữ liệu mới. Đây là thiết kế đơn giản cho đồ án, còn giới hạn mở rộng đã ghi tại `DOI_CHIEU_HOAN_THIEN.md`.

S3 và DynamoDB không có giao dịch chung. File upload được xác minh rồi chốt sang khóa theo hàm băm trước khi gắn vào tác phẩm; file chưa được gắn không tự cấp quyền đọc. Worker tri thức chỉ chốt manifest khi Bedrock nhận tác vụ đồng bộ và kiểm tra lại trạng thái ingestion để thử lại lỗi. Email có trạng thái outbox; trường hợp không rõ dịch vụ đã nhận thư được đánh dấu riêng để tránh gửi lại mù quáng.
