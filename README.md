# Cloud Library - bàn giao dữ liệu và tích hợp AWS

**Cập nhật: 23/11/2026 (giờ Việt Nam).**

Ứng dụng React/Vite và API Node.js hiện chạy trên máy phát triển, đã kết nối **Amazon Cognito, DynamoDB và S3 thật tại Singapore**. Các luồng dưới đây được kiểm thử thủ công bởi Trâm Anh trong phiên tích hợp. Chưa nghiệm thu website HTTPS chạy trên Lambda/API Gateway/CloudFront.

README này dùng ở thư mục gốc `CloudLibrary-Complete/`, bổ sung trạng thái mới cho hướng dẫn local cũ. Đây là **tài liệu bàn giao**, không phải gói code đã áp dụng toàn bộ các việc còn lại. Những thay đổi AWS và dữ liệu mới trên tài khoản không tự nằm trong ZIP mã nguồn cũ.

## 1. Phân công sau bàn giao

| Người phụ trách | Phạm vi |
| --- | --- |
| Trâm Anh - Data | Bổ sung sách, metadata, nội dung chương, PDF/bìa hợp lệ; kiểm tra chất lượng, nguồn và quyền sử dụng dữ liệu. |
| Backend | API/nghiệp vụ, hiệu năng đọc/ghi, xác thực/phân quyền, kiểm thử máy chủ, tích hợp AI. |
| Frontend | Giao diện xác minh email, font đọc, phản hồi khi lưu, xử lý trạng thái/lỗi, tích hợp API và giao diện AI. |
| Dev - triển khai/vận hành | Đưa website/API lên AWS; IAM, biến môi trường, callback/CORS HTTPS, TTL, log, ngân sách, backup, CI/CD và runbook. |

Xem PDF `CloudLibrary_BanGiao_Backend_Frontend_Dev_20261123.pdf` đi kèm để biết đầu việc, file liên quan và tiêu chí hoàn thành. Việc viết code backend/frontend hoặc triển khai không được giao mặc định cho người bổ sung data.

## 2. Những việc đã làm trong phiên tích hợp

### Hạ tầng và kết nối

- Cài/kiểm tra AWS CLI; đăng nhập bằng IAM user phát triển, không tạo access key dài hạn trong phiên này.
- Tạo profile `cloud-library-login` bằng `aws login`; profile `cloud-library` dùng `credential_process` để Node AWS SDK lấy thông tin xác thực từ CLI.
- Kiểm tra STS trả đúng người dùng; `describe-table` trả `CloudLibraryWorkspace`, trạng thái `ACTIVE`.
- Tạo và cấu hình Cognito User Pool, public SPA client, đăng nhập email, xác minh email, nhóm `reader`, `author`, `librarian`, `admin`; dùng gói Lite.
- Nối API với DynamoDB/S3/Cognito qua `app/.env`, `APP_MODE=aws`.
- Sửa trên máy phát triển: chỉ chạy đồng bộ dữ liệu legacy và timer worker định kỳ trong chế độ local (xem mục 7).
- Bổ sung `dynamodb:UpdateItem` cho giới hạn tần suất yêu cầu; sửa lỗi đăng ký gặp `AccessDeniedException`.
- Bổ sung quyền Cognito tạo nhân sự và đặt mật khẩu, giới hạn đúng User Pool.
- Thêm CORS vào bucket nội dung; tải ảnh bìa và PDF từ trình duyệt hoạt động sau thay đổi.
- Tạo budget `CloudLibrary-Total-50USD`, mức 50 USD, các ngưỡng cảnh báo thực tế 10/25/40 USD. Đây là cảnh báo, chưa có hành động tự dừng chi tiêu.

### Dữ liệu và nghiệp vụ đã thử

| Luồng | Kết quả ghi nhận |
| --- | --- |
| Đăng ký, xác minh email, đăng nhập | Người dùng đã vào được hồ sơ sau khi sửa quyền IAM. |
| Yêu thích | Lưu được; đăng xuất rồi đăng nhập lại vẫn còn. |
| Đọc chữ và chuyển chương | Đọc được nội dung Standard Ebooks. |
| Nhớ vị trí đọc | Người dùng xác nhận giữ vị trí sau F5 và đăng xuất/đăng nhập. |
| Đăng ký tác giả bằng liên kết | Gửi hồ sơ, chuyển sang chờ duyệt. |
| Admin đầu tiên | Tạo tài khoản thật, xác minh/đăng nhập, chạy script cấp quyền; vào được khu quản trị. |
| Duyệt tác giả | Admin duyệt; tài khoản có khu tác giả, bút danh `AngelinaMyan`. |
| Bản thảo và xuất bản | Truyện `Myan và những chiếc tất mất tích`, 2 chương, đã lưu/gửi/duyệt và mở đọc được. |
| Cập nhật bìa | Ảnh Myan đã xuất hiện trên thẻ sách trong danh mục sau xử lý CORS. |
| Tạo thủ thư | Admin tạo nhân sự `Myan Lee`; tài khoản đăng nhập vào giao diện thủ thư. |
| Mượn/trả | Người dùng xác nhận yêu cầu mượn, bàn giao, kiểm tra sách đang mượn, nhận trả và hoàn tồn kho hoạt động. |
| Upload và xem trước PDF | PDF thử đã tải và hiển thị trong khung đọc. Lưu bản thảo PDF rồi F5/mở lại chưa được xác nhận riêng sau bước hướng dẫn cuối. |
| Điều kiện đọc | Người dùng xác nhận cần đăng nhập mới đọc sách; không ghi nhận đọc toàn văn không cần đăng nhập là tiêu chí đạt. |

Các kết quả trên là kiểm thử thủ công trong môi trường phát triển nối AWS, không phải báo cáo kiểm thử tự động mới hoặc chứng nhận sẵn sàng production.

## 3. Trong bộ mã nguồn có gì?

Nguồn đối chiếu: `CloudLibrary-Full.zip` và các file đã xem trong phiên làm việc. `app/` là ứng dụng chính; `cloud-library-db/` là phần database/ebook cũ cần bảo tồn khi bàn giao.

| Đường dẫn từ thư mục gốc | Nội dung |
| --- | --- |
| `app/src/` | React: xác thực, danh mục, đọc sách, hồ sơ, tác giả, thủ thư, admin, trợ lý. |
| `app/src/api/runtime.js` | Gọi API, token/làm mới phiên, upload trực tiếp S3 và xác nhận hoàn tất. |
| `app/src/ui/libraryStore.js` | Snapshot, trạng thái phiên, lệnh ghi, chống thao tác lặp ở giao diện. |
| `app/src/hooks/useFavorites.js` | Lấy danh sách và gửi lệnh yêu thích. |
| `app/src/pages/AccountRecovery.jsx` | Form xác minh email, quên/đặt lại mật khẩu; có form đổi mật khẩu dùng lại. |
| `app/src/pages/AuthPage.jsx`, `AuthPage.css` | Đăng nhập/đăng ký và giao diện xác thực dùng chung. |
| `app/src/pages/ReaderPage.jsx`, `ReaderPages.css`, `ReaderPage.css` | Đọc PDF/chương chữ, cài đặt đọc và vị trí đọc. |
| `app/src/data/readerContent.js` | Chuẩn hóa cấu trúc chương, bookmark, cài đặt đọc và trích xuất đoạn PDF. |
| `app/src/pages/AuthorDraftForm.jsx`, `AuthorWorkspacePage.jsx` | Soạn/lưu/gửi bản thảo, tạo bản sửa. |
| `app/src/pages/ManuscriptReviewPage.jsx` | Duyệt tác phẩm. |
| `app/src/pages/ManagementModules.jsx`, `LibrarianPage.jsx`, `LoansPage.jsx` | Nhân sự, quản lý và luồng thư viện. |
| `app/server/app.mjs`, `rest.mjs` | Express API, giới hạn tần suất, route/lệnh và xử lý lỗi. |
| `app/server/library.mjs` | Nghiệp vụ, kiểm tra quyền, chuyển trạng thái, tồn kho. |
| `app/server/repository.mjs` | Đọc/ghi DynamoDB, transaction, version và idempotency. |
| `app/server/storage.mjs`, `uploads.mjs` | S3, URL ký, đóng gói chương, xác minh tệp và chủ sở hữu. |
| `app/server/auth.mjs` | Cognito, JWT, đăng nhập và đồng bộ nhóm quyền. |
| `app/server/seed.mjs`, `standard-ebooks.mjs` | Dữ liệu khởi tạo và nhập bộ 12 sách Standard Ebooks. |
| `app/server/ai.mjs`, `knowledge.mjs` | Adapter trợ lý và tri thức; có code không đồng nghĩa Bedrock/RAG đã hoạt động. |
| `app/server/audio.mjs`, `workers.mjs` | Adapter âm thanh, tác vụ nền/outbox; chưa nghiệm thu dịch vụ cloud tương ứng. Audio không thuộc phần data cần làm tiếp. |
| `app/server/data/standard-ebooks/` | Metadata, nội dung và thông tin nguồn của 12 ấn bản tiếng Anh, tổng 447 phần/chương gồm trang phụ. |
| `app/public/covers/standard-ebooks/` | Bìa bộ sách nguồn đã tải kèm. |
| `app/scripts/` | Chạy local, API sách riêng, build Lambda, import nguồn, deploy, cấp admin. |
| `app/infra/` | Mẫu hạ tầng và cấu hình triển khai; cần Dev rà soát trước khi áp dụng. |
| `app/test/`, `app/.github/workflows/check.yml` | Kiểm thử và workflow mẫu. Cần kiểm tra vị trí workflow tại root repo khi đưa lên GitHub. |
| `app/docs/` | API/DynamoDB, triển khai AWS, nguồn sách và kết quả kiểm tra của các bản trước. |
| `cloud-library-db/` | Công cụ, dữ liệu TXT/PDF/ebook cũ; không phải backend chính đang chạy. |
| `requirements/CloudLibrary_TaiLieuchung.pdf` | Tài liệu yêu cầu/thiết kế cũ; cần cập nhật trạng thái theo README này. |

**Lưu ý:** truyện Myan, tài khoản thật, hồ sơ, yêu thích và giao dịch vừa thử nằm trên AWS. Không coi ZIP cũ hoặc thư mục `.local` là bản backup của dữ liệu AWS mới.

## 4. Tài nguyên hiện có cần tiếp quản

| Thành phần | Giá trị/trạng thái |
| --- | --- |
| Region | `ap-southeast-1` - Singapore |
| DynamoDB | `CloudLibraryWorkspace`, khóa chuỗi `PK` và `SK`, đã kiểm tra `ACTIVE` |
| S3 nội dung | `cloud-library-content-tramanh-2026` |
| Cognito User Pool | `CloudLibrary-Team` / `ap-southeast-1_wLycga4pj` |
| SPA client | `cloud-library-team-web` / `40uqa88ou7al4nvhbo25i7c2p8`, không dùng client secret |
| Cognito domain | `https://ap-southeast-1wlycga4pj.auth.ap-southeast-1.amazoncognito.com` |
| Nhóm quyền | `reader`, `author`, `librarian`, `admin` |
| IAM user phát triển | `CloudLibraryLocalDev` |
| Profile máy phát triển | `cloud-library-login` và `cloud-library` |
| Budget | `CloudLibrary-Total-50USD` |

Vai trò/trạng thái tài khoản trong DynamoDB là nguồn kiểm tra quyền của backend; nhóm Cognito được đồng bộ. Không chỉ sửa nhóm Cognito rồi mặc định quyền nghiệp vụ đã thay đổi đúng.

TTL `expiresAt`, capacity mode thực tế của bảng, PITR/backup và cấu hình vận hành cần Dev kiểm tra/chốt. Không suy từ template rằng chúng đã bật trên tài nguyên đang dùng.

## 5. Chạy bản hiện tại trên Windows

Thư mục trên máy đã kiểm thử: `C:\Myan_Chan\AWS\CloudLibrary-Complete\app`.

### Đăng nhập AWS CLI khi phiên hết hạn

```powershell
aws login --profile cloud-library-login --region ap-southeast-1 --remote
aws sts get-caller-identity --profile cloud-library-login --region ap-southeast-1 --no-cli-pager
```

Đăng nhập bằng danh tính AWS được cấp cho thành viên, không chia sẻ profile/credential của người khác. Hai lệnh cấu hình sau là cách đã dùng trên máy Trâm Anh; chỉ thiết lập một lần khi chuẩn bị profile tương ứng:

```powershell
aws configure set region ap-southeast-1 --profile cloud-library
aws configure set credential_process "aws configure export-credentials --profile cloud-library-login --format process" --profile cloud-library
```

Không đưa access key, mật khẩu, token hoặc mã đăng nhập từ trình duyệt vào README, Git hoặc chat.

### Terminal 1 - backend

```powershell
cd C:\Myan_Chan\AWS\CloudLibrary-Complete\app
npm run api
```

Kết quả mong đợi: `Cloud Library API: http://127.0.0.1:3001` và tên bảng đúng. Lần chạy đã thử báo 12 sách Standard Ebooks có toàn văn.

### Terminal 2 - frontend

```powershell
cd C:\Myan_Chan\AWS\CloudLibrary-Complete\app
npm run dev:frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Mở **http://127.0.0.1:5173/**. Giữ cả hai terminal chạy. Dừng bằng **Ctrl+C** ở từng terminal. Trên máy mới, chạy `npm ci` trong `app` trước khi chạy ứng dụng.

`npm run dev` là luồng khởi động DynamoDB Local cũ; không dùng thay hai lệnh trên cho môi trường AWS hiện tại. `npm run api:books` là trang thử sách riêng ở cổng 3002, không thay backend đầy đủ và không kiểm thử đăng nhập/lưu dữ liệu.

## Email và mật khẩu của thủ thư và admin 
Admin
mun44081@gmail.com   Admin123456@

Thủ thư
munbetisne@gmail.com     Thuthu123456@

### Cấu hình `app/.env` đã dùng

```dotenv
APP_MODE=aws
API_PORT=3001
APP_ORIGIN=http://127.0.0.1:5173
AWS_PROFILE=cloud-library
AWS_REGION=ap-southeast-1
DYNAMODB_TABLE=CloudLibraryWorkspace
CONTENT_BUCKET=cloud-library-content-tramanh-2026
COGNITO_USER_POOL_ID=ap-southeast-1_wLycga4pj
COGNITO_CLIENT_ID=40uqa88ou7al4nvhbo25i7c2p8
COGNITO_DOMAIN=https://ap-southeast-1wlycga4pj.auth.ap-southeast-1.amazoncognito.com
VITE_API_BASE_URL=/api/v1
VITE_AUTH_MODE=cognito
LOCAL_DATA_DIR=.local
```

Không đặt `DYNAMODB_ENDPOINT` trong chế độ AWS. Các ID tài nguyên trên là thông tin cấu hình, không phải thông tin xác thực. Đổi callback/origin/biến môi trường khi Dev triển khai HTTPS.

## 6. Upload và quyền đã bổ sung

### CORS bucket nội dung

Cấu hình đã hướng dẫn và thử thành công với ảnh bìa/PDF:

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Giữ Block Public Access. CORS không thay thế quyền truy cập hay xác minh người dùng. Khi deploy, Dev thêm đúng origin HTTPS; không tự đổi origin thành `*`.

### IAM cho backend chạy tại máy

- Inline `CloudLibraryLocalDevAccess`: DynamoDB DescribeTable/Query/GetItem/PutItem/UpdateItem/DeleteItem trên bảng đích; S3 ListBucket/GetBucketLocation và GetObject/PutObject/DeleteObject trên bucket nội dung; Cognito AdminListGroupsForUser/AdminAddUserToGroup/AdminRemoveUserFromGroup trên pool đích.
- Inline `CloudLibraryStaffProvisioning`: Cognito `AdminCreateUser`, `AdminSetUserPassword` trên đúng pool để nút thêm nhân sự tạo được tài khoản thật.
- Có `SignInLocalDevelopmentAccess` và `IAMUserChangePassword` cho danh tính phát triển.

Các quyền triển khai hạ tầng là phần riêng của Dev. Khi chạy Lambda, dùng execution role phù hợp; không chép `AWS_PROFILE` hay credential cá nhân lên Lambda. Role `CloudLibraryTeamAdmin` đã tạo riêng nhưng trust cho các thành viên ngoài tài khoản chưa được chốt trong phiên này.

## 7. Thay đổi `server/index.mjs` cần giữ khi gộp code

Các chỉnh sửa này được người dùng thực hiện trên máy, không mặc định có trong ZIP nguồn cũ:

```javascript
if (config.mode === "local") {
  await syncLegacySource(repo);
}
```

Timer 60 giây bọc bằng `config.mode === "local" ? setInterval(...) : null`; khi đóng server chỉ gọi `clearInterval` nếu timer khác `null`.

`seedRepository` và `syncStandardEditions` vẫn được gọi lúc khởi động. Backend cần làm chúng idempotent/hiệu quả, không đọc/ghi lại nội dung không đổi mỗi lần khởi động. Do timer local đã bị tắt trong AWS mode, **không coi nhắc hạn/worker cloud là đang chạy tự động**; Dev/Backend phải bố trí tác vụ nền phù hợp nếu triển khai tính năng đó.

## 8. Việc còn lại và người xử lý

| Mã | Người chính | Việc cần làm | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| BE-01 | Backend | Đo và tối ưu đọc snapshot, favorite, tiến độ; tránh tải/ghi lại toàn bộ chương S3 cho thao tác metadata. | Có số đo trước/sau; số request S3/DDB giảm phù hợp; không rò dữ liệu giữa người dùng. |
| FE-01 | Frontend | Phản hồi yêu thích ngay, chặn thao tác trùng, rollback khi lỗi và xử lý đổi phiên. | Tim phản hồi ngay; lỗi trả về khôi phục đúng; F5 vẫn khớp server. |
| FE-02 | Frontend | Chỉnh trang xác minh email/quên mật khẩu đồng bộ login/register. | Desktop/mobile, sáng/tối, thông báo rõ; không đổi hợp đồng API. |
| FE-03 | Frontend | Sửa font Có chân cho tiếng Việt. | Đúng dấu khi nhập/dán và xem lại; lưu lựa chọn font; kiểm tra Unicode trước khi sửa dữ liệu. |
| BE-02 / FE-04 | Backend + Frontend | Quên/đổi mật khẩu, phiên hết hạn, hai tài khoản, quyền tác giả/thủ thư/admin và upload lỗi. | Test cả thành công/thất bại; 401/403/404 hợp lý; UI không mất dữ liệu hoặc báo thành công giả. |
| BE-03 | Backend | Rà soát tạo nhân sự/đồng bộ Cognito và DDB khi một bước thất bại; xử lý retry và bù trừ. | Không để tài khoản nửa tạo/nửa chưa liên kết; không lưu mật khẩu rõ trong log/idempotency. |
| BE-04 | Backend, FE phối hợp | Kết nối Bedrock/tri thức theo phạm vi AI đã chốt. | Câu trả lời có nguồn đúng, từ chối khi thiếu nguồn, không lộ dữ liệu riêng; có kiểm soát chi phí. |
| DEV-01 | Dev | Triển khai HTTPS: frontend S3/CloudFront, API Gateway/Lambda, cấu hình auth/upload. | Luồng chính chạy trên URL chung khi laptop phát triển đã tắt. |
| DEV-02 | Dev | TTL, IAM, log, chi phí, backup/restore, CI/CD và rollback. | Cấu hình thực tế được ghi lại, có bằng chứng kiểm tra và runbook. |
| DOC-01 | Backend / Frontend / Dev | Cập nhật tài liệu theo phần mỗi người làm. | API, UI, deployment và trạng thái test thống nhất; không ghi dịch vụ chưa chạy là đã xong. |

### Ghi nhận hiệu năng và giới hạn hiện tại

Người dùng quan sát tải lại trang và lưu yêu thích khoảng 3 giây. Chưa có số đo benchmark. Code hiện đọc phân vùng nghiệp vụ `LIBRARY`, dựng trạng thái và unpack chương từ S3; khi mutate có thể pack/ghi lại nội dung. Frontend chờ phản hồi lệnh rồi mới nhận snapshot. Đây là các điểm cần đo, không phải kết luận toàn bộ độ trễ chỉ do DynamoDB.

Repository hiện có giới hạn 5.000 bản ghi nghiệp vụ và khóa META dùng chung; cần đánh giá khi mở rộng. Không thêm cache toàn cục chứa snapshot cá nhân mà thiếu khóa theo người dùng/quyền và invalidation.

### Chưa được nghiệm thu riêng trong phiên này

- Upload minh chứng tác giả sau sửa CORS; PDF sau lưu nháp/F5 và sau xuất bản ở tài khoản độc giả khác.
- Quên/đổi mật khẩu, refresh token, Hosted UI/PKCE, khóa tài khoản, API từ chối thao tác vượt quyền, hai người dùng tách dữ liệu.
- Tranh chấp bản sách cuối, thao tác gửi lặp, URL upload hết hạn/file sai loại, hủy phiếu và các tình huống lỗi.
- Bedrock/RAG, email nhắc hạn SES/Scheduler, khôi phục backup và triển khai HTTPS.

## 9. Kiểm tra dành cho đội phát triển

Các script có trong `app/package.json`:

```powershell
npm run lint
npm run build
npm test
npm run test:books-api
npm run test:e2e
npm run build:lambda
npm run infra:prepare
```

Các test có thể cần DynamoDB Local và cấu hình riêng. Backend/Dev đọc cấu hình test trước khi chạy; không trỏ các test phá dữ liệu vào bảng AWS đang dùng. Không ghi rằng toàn bộ lệnh trên đã chạy lại trong phiên tài liệu này. Báo cáo cũ trong `app/docs/` phản ánh phiên bản và môi trường khi báo cáo được tạo.

Trước khi dùng `npm run aws:deploy`, Dev phải xem `scripts/deploy-aws.mjs`, template và change set. Bộ triển khai có thể tạo tài nguyên mới; cần chọn rõ tái sử dụng hay di chuyển tài nguyên hiện có, tránh tự tạo một User Pool/bảng rỗng rồi tưởng dữ liệu bị mất. Lệnh deploy có thể upload artifact và tạo tài nguyên phụ ngay cả khi chưa `--apply`; chỉ chạy trong đợt triển khai đã được chủ tài khoản thống nhất.

## 10. Khi nghỉ và kiểm tra lỗi nhanh

- Dừng cả backend và frontend bằng Ctrl+C. Đóng tab AWS không dừng tài nguyên cloud; S3 và các phần lưu trữ/backup vẫn có thể tính phí.
- Giữ bảng, bucket, user pool để tiếp tục; kiểm tra Billing và Budget. Budget đã tạo không phải trần tự chặn chi tiêu.
- `ECONNREFUSED 127.0.0.1:3001`: kiểm tra terminal backend và lỗi khiến tiến trình dừng.
- `AccessDeniedException`: xem requestId/log và quyền thao tác cụ thể, không cấp AdministratorAccess cho runtime để chữa lỗi chung.
- Upload `Failed to fetch`: kiểm tra origin thực tế, CORS S3, Network và thời hạn URL ký.
- Lỗi dấu tiếng Việt trong font Có chân: tạm chọn Không chân; chưa coi đây là dữ liệu đã được sửa vĩnh viễn.

## 11. Tài liệu tham chiếu

- `app/README.md`: hướng dẫn cũ của ứng dụng, ưu tiên mục chạy AWS trong README này cho trạng thái hiện tại.
- `app/docs/API_DYNAMODB.md`: API và cấu trúc lưu trữ.
- `app/docs/AWS_DEPLOYMENT.md`: thiết kế và quy trình triển khai dự kiến, cần Dev đối chiếu tài nguyên thật.
- `app/docs/STANDARD_EBOOKS.md`: nguồn sách, import và ghi công.
- `app/docs/DOI_CHIEU_HOAN_THIEN.md`: giới hạn và đối chiếu yêu cầu bản trước.
- PDF phân công đi kèm là tài liệu mới; không ghi đè `requirements/CloudLibrary_TaiLieuchung.pdf` trong lần bàn giao này.

Tài liệu không chứa mật khẩu tài khoản thật hoặc AWS access key. Các tài khoản `.demo` trong code chỉ dành cho local, không tự được tạo trên Cognito khi `APP_MODE=aws`.
