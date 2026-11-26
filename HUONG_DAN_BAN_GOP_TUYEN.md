# Cloud Library — Complete với giao diện Tuyền

Ngày gộp: 25/11/2026. Mã nhận diện: `20261125-tuyen-r3`.

## Hai nguồn được dùng

- Giao diện: `CloudLibraryManagementSystem-tuyen_frontend(1).zip`, thư mục `frontend/src`.
- Backend và cấu hình dự án: `CloudLibrary-Complete(3).zip`.

Bản này dùng trang, bố cục, thanh điều hướng và CSS của giao diện Tuyền. Các mục giao diện đã bỏ không được đưa trở lại thanh điều hướng. Phần backend thử local đi kèm file của Tuyền không thay thế backend Complete.

Code server, các module dùng chung mà server nhập vào, `.env`, `package.json`, `package-lock.json`, cấu hình Vite và hạ tầng giữ nguyên byte so với Complete. Những thay đổi tích hợp nằm trong frontend: đăng nhập/phiên làm việc, gọi API, tải tệp và đọc dữ liệu từ máy chủ.

Các bổ sung trong giao diện mới được nối vào API hiện có: tải lại dữ liệu, khôi phục/đổi mật khẩu, tải PDF bản thảo, gửi/tải minh chứng, tạo bản sửa tác phẩm. Thời hạn mượn và quyền thao tác vẫn theo chính sách backend hiện có. Hộp thư kiểm thử local chỉ hiện khi máy chủ đang ở chế độ local.

## Chạy trên máy của bạn

1. Dừng hai terminal đang chạy bản cũ bằng `Ctrl+C`.
2. Giải nén ZIP vào một thư mục mới. Trong VS Code, mở thư mục `CloudLibrary-Complete` vừa giải nén.
3. Nhấp phải thư mục `app` → **Open in Integrated Terminal**. Cài thư viện:

```powershell
npm ci
```

4. Chạy backend tại terminal đó:

```powershell
npm run api
```

5. Mở terminal thứ hai cũng tại `app`, chạy giao diện:

```powershell
npm run dev:frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

6. Mở `http://127.0.0.1:5173/`. Nhấn `Ctrl+Shift+R` nếu trình duyệt còn giữ bản cũ.
7. Kiểm tra `http://127.0.0.1:5173/frontend-version.json`: giá trị `build` phải là `20261125-tuyen-r3`.

File `.env` được giữ ở chế độ AWS như Complete. Chạy các lệnh trên máy đã có AWS CLI/profile của dự án. Khi phiên AWS hết hạn, dừng backend rồi đăng nhập lại:

```powershell
aws login --profile cloud-library-login --region ap-southeast-1 --remote
aws sts get-caller-identity --profile cloud-library
npm run api
```

Lệnh đăng nhập dùng các profile đã thiết lập trước đó trên máy của Trâm Anh. Máy khác cần được cấu hình profile và cấp quyền AWS tương ứng; không chia sẻ tài khoản root.

## Đã kiểm tra

- ESLint và build production.
- 43 bài kiểm tra backend gốc.
- Gọi HTTP thật tới backend không sửa đổi, trên DynamoDB Local và dữ liệu riêng: yêu thích, tồn kho/bảo trì, mượn–gia hạn–trả, đặt trước/nhận sách, bản thảo/gửi duyệt/xuất bản, bảo vệ nội dung, thông báo đã đọc, PDF, minh chứng và đổi mật khẩu.
- Kết xuất React để kiểm tra giao diện/điều hướng mới, các mục đã bỏ, nút tải lại, khôi phục mật khẩu, tải PDF, khung ảnh bìa và bộ nghe trong trang đọc.
- Đối chiếu byte của 324 tệp gốc ngoài phần UI, gồm 48 tệp server/module dùng chung. Không có khác biệt. Toàn bộ 34 tệp CSS của giao diện Tuyền giữ nguyên.

Các kiểm tra này không đăng nhập tài khoản AWS thật, không thay đổi dữ liệu AWS và không triển khai website. Chưa kiểm tra thao tác đầy đủ bằng trình duyệt trên máy người dùng.

## Giới hạn của backend giữ nguyên

Tùy chọn căn khung ảnh bìa được nhớ trên trình duyệt đang dùng; backend gốc chưa lưu trường này để đồng bộ sang máy khác. Nội dung, tệp, tài khoản và giao dịch vẫn đi qua API của dự án.

Không kèm `node_modules`, `dist` hay dữ liệu kiểm thử `.local`; `npm ci` sẽ cài đúng thư viện theo lockfile gốc. README và tài liệu gốc trong Complete được giữ nguyên; hướng dẫn này mô tả riêng bản gộp hiện tại.
