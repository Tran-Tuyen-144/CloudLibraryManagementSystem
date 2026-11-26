# Sách đọc trực tuyến — Standard Ebooks

Trang chính dùng danh sách các bản Standard Ebooks đã được nhập đủ nội dung chữ vào thư viện. Không gọi Gutendex hoặc chuyển người đọc sang Gutenberg.

## Các bản sách kèm theo

| Sách | Tác giả | Số phần/chương |
| --- | --- | ---: |
| Pride and Prejudice | Jane Austen | 63 |
| The Adventures of Sherlock Holmes | Arthur Conan Doyle | 14 |
| Frankenstein | Mary Shelley | 36 |
| Dracula | Bram Stoker | 33 |
| The Picture of Dorian Gray | Oscar Wilde | 24 |
| The Time Machine | H. G. Wells | 16 |
| Sense and Sensibility | Jane Austen | 52 |
| Jane Eyre | Charlotte Brontë | 44 |
| The War of the Worlds | H. G. Wells | 34 |
| Treasure Island | Robert Louis Stevenson | 46 |
| Persuasion | Jane Austen | 26 |
| Emma | Jane Austen | 59 |

Tổng: 12 cuốn tiếng Anh, 447 phần/chương gồm nội dung chính và các trang phụ của ấn bản. Đây là danh sách chọn lọc kèm toàn văn, không phải toàn bộ danh mục Standard Ebooks. Thể hiện ở chế độ đọc chữ; không tái tạo đầy đủ bố cục và ảnh minh họa của EPUB.

## Nguồn và cách nhập

- Nguồn ấn bản: https://standardebooks.org/ebooks/
- Mã nguồn công khai: https://github.com/standardebooks
- Từng sách được lấy qua API archive GitHub `https://api.github.com/repos/standardebooks/<repo>/zipball/master`. Danh sách repo cố định nằm trong script nhập dữ liệu. Không cần tài khoản/token cho các repository công khai; vẫn chịu giới hạn API của GitHub.
- Đọc `src/epub/content.opf` trong archive để lấy đúng thứ tự spine; nhập mọi nội dung chữ trong spine, trừ trang nhan đề và imprint. Giữ colophon, ghi nguồn và giấy phép của từng bản.
- Mỗi chương bắt buộc tải và phân tích thành công; kiểm tra số chương, dung lượng chữ, hash nguồn và định dạng JPEG trước khi đưa vào danh sách.
- Ảnh bìa giữ nguyên byte từ repository Standard Ebooks. Các file LICENSE được giữ kèm từng sách.
- Manifest nguồn và hash: `server/data/standard-ebooks/manifest.json`.
- Khi API khởi động, `syncStandardEditions` lưu metadata vào DynamoDB và đưa nội dung chương qua cơ chế lưu nội dung hiện có. Khi đọc không cần gọi máy chủ sách bên ngoài.
- Đồng bộ lặp lại không tạo bản trùng và giữ lựa chọn lưu trữ, lượt xem, số bản vật lý hiện có. Không tự tạo tồn kho vật lý cho ebook.

## API của Cloud Library

- `GET /api/v1/sources/standard-ebooks?q=Jane%20Austen&page=1`: danh sách các sách đã có toàn văn; 6 cuốn/trang; tìm tên sách và tác giả.
- `GET /api/v1/books`: sách mới cũng xuất hiện trong danh mục chung.
- `POST /api/v1/books/<id>/read-access`: trả các chương qua luồng đọc có đăng nhập đang dùng.
- Tiến độ đọc, lịch sử, dấu trang và yêu thích tiếp tục dùng ID sách và revision của Cloud Library.
- Endpoint Gutendex cũ bị gỡ. TXT cũ và dữ liệu của người dùng được giữ nguyên. Các ảnh cache cũ còn được giữ để bìa sách TXT trước đó không bị gãy.

## Nhập lại từ API nguồn (tùy chọn cho người phát triển)

Không cần chạy bước này để sử dụng 12 sách đã kèm. Nếu có Python 3.10+ và muốn làm mới dữ liệu nguồn:

```powershell
python scripts/import-standard-ebooks.py
```

Dừng API trước khi nhập lại rồi khởi động lại `npm run dev`. Quá trình nhập chỉ sử dụng thư viện chuẩn Python. Nếu một sách lỗi, giữ bộ dữ liệu đang dùng và báo lỗi; không xuất bản sách thiếu chương.

## Kiểm tra

Kết quả kiểm tra cụ thể được ghi trong `docs/STANDARD_EBOOKS_VERIFICATION.md`.
