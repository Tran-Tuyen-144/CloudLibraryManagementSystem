# Kiểm tra đổi nguồn sách — 21/11/2026

## Kết quả

- 39/39 bài kiểm tra Node thành công: 32 bài có sẵn và 7 bài cho nguồn mới/luồng đọc.
- ESLint, Vite production build và build Lambda thành công. Toàn văn chỉ nằm phía server, không được nhúng vào bundle JavaScript của trình duyệt.
- Đã tải trực tiếp 12 archive từ repository công khai của Standard Ebooks qua API GitHub, phân tích thứ tự spine từ OPF, kiểm tra đủ 447 phần/chương và 6.895.718 ký tự chữ của những phần này.
- Đối chiếu SHA-256 từng file sách và 12 ảnh bìa. Bìa giữ nguyên byte nguồn. Các chương được chuyển XHTML thành văn bản, giữ thứ tự đoạn và chương. Nguồn/giấy phép của mỗi ấn bản được lưu kèm.
- Kiểm tra trên DynamoDB Local thật và thư mục lưu nội dung: `read-access` trả đúng toàn bộ danh sách chương và nội dung của từng cuốn trong cả 12 cuốn, trong khi mọi lệnh fetch ra Internet trong bài kiểm tra bị chặn. Không phụ thuộc Gutenberg hoặc Gutendex khi đọc.
- Endpoint nguồn mới qua proxy Vite phục vụ đủ 12 sách trên 2 trang; cả 12 bìa trả HTTP 200 và đúng Content-Type JPEG.
- Kiểm tra tìm tác giả trả 4 sách Jane Austen; phân trang không trùng ID, không đưa sách nháp, đã lưu trữ hoặc thiếu nội dung lên kệ.
- Kiểm tra quyền: snapshot/danh mục công khai chỉ trả metadata; đọc nội dung cần đăng nhập. Endpoint nguồn Gutendex cũ trả 404.
- Tiến độ đọc sử dụng đúng ID chương và revision mới; vẫn còn sau khi chạy đồng bộ lại. Đồng bộ lặp không tạo sách trùng, không xóa sách/tài khoản/yêu thích cũ, không tạo tồn kho vật lý giả.
- Mô phỏng DOM với toàn bộ App React và API thật: tạo một tài khoản kiểm tra riêng, đăng nhập, mở Pride and Prejudice từ kệ, thấy đoạn mở đầu, thấy đủ 63 mục chương/phụ lục của ấn bản, chuyển được tới chương 61; quay về và mở được nội dung Sherlock Holmes; tìm tác giả và chuyển trang thành công. Không có yêu cầu HTTP ra nguồn ngoài và không có lỗi JavaScript trong các luồng này. Bộ đọc PDF được thay bằng stub trong phép thử DOM vì các ấn bản mới đọc bằng chữ, không sử dụng PDF.
- Dữ liệu database, nội dung và file của `cloud-library-db` trong ZIP đầy đủ được giữ nguyên byte từ bản người dùng cung cấp. Gói cập nhật chỉ chép code/dữ liệu nguồn mới, rồi nhập thêm các ấn bản khi API chạy.

## Giới hạn

- Chưa đối chiếu trực quan bố cục bằng trình duyệt thật: Chromium trong môi trường này không khởi động được do giới hạn Unix socket. Kiểm tra DOM không chứng minh được bố cục pixel, ảnh render hoặc kích thước responsive. Các bài Playwright mới nằm trong `test/browser/source-books.spec.mjs` để chạy bằng Edge theo cấu hình hiện có trên Windows.
- Script PowerShell được rà soát và kiểm tra danh sách file/hash nhưng chưa thực thi trên Windows trong phiên này. Script sao lưu các file được cập nhật/gỡ và khôi phục khi chép file lỗi.
- 12 sách là bộ tuyển chọn, không phải toàn bộ kho Standard Ebooks. Tất cả là bản tiếng Anh. Đọc toàn văn chữ; không dựng lại toàn bộ hình minh họa và bố cục EPUB.
- Để thêm/làm mới dữ liệu qua script nhập nguồn tùy chọn, cần Python 3.10+ và kết nối GitHub; chịu giới hạn API của GitHub. Điều này không cần thiết để đọc 12 bản đã kèm.

## Tái kiểm tra

Giữ `npm run dev` chạy ở terminal đầu, mở terminal khác tại `app`:

```powershell
npm run check
npm run test:e2e -- test/browser/source-books.spec.mjs
```

## Bổ sung sửa mô tả HTML

- Phần mô tả được chuyển thành văn bản qua DOM template không được gắn vào trang; giải mã entity và giữ xuống đoạn. Áp dụng cho chi tiết sách ở kệ nguồn và danh mục chung.
- Đã kiểm tra mô tả thật của cả 12 sách, cùng ký tự HTML, đoạn văn, văn bản thuần và loại bỏ nội dung script/style trong phép kiểm tra thủ công.
- ESLint và Vite build đạt; chạy lại mô phỏng toàn bộ App với API thật, xác nhận mô tả trong cửa sổ chi tiết không còn thẻ/href và luồng đọc vẫn hoạt động.
- Gói sửa nhỏ chỉ gồm 4 file giao diện, không đổi dữ liệu nguồn, ID/revision sách hoặc database.

## Chế độ thử API độc lập

- Thêm `npm run api:books`: server chỉ đọc 12 sách công khai kèm theo và phục vụ trang thử tại cổng 3002. Không nhập repository, AWS SDK hoặc cấu hình/tệp database.
- 4 bài kiểm tra Node riêng kiểm tra health, tìm kiếm, toàn văn đầu/cuối của cả 12 sách, trang thử và bìa, giới hạn phương thức/đường dẫn.
- Mô phỏng DOM với server thật kiểm tra danh sách 12 sách, mô tả sạch HTML, đọc chương đầu và cuối truyện Pride and Prejudice, đủ tùy chọn chương, tìm tác giả và quay về danh sách.
- Đã kiểm tra chế độ này từ bản giải nén không có node_modules, dữ liệu .local hoặc mã nguồn database cũ. Chưa kiểm tra trực quan bằng trình duyệt thật.
