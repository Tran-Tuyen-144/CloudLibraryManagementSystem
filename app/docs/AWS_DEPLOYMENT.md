# Triển khai AWS

Region của dự án là `ap-southeast-1` (Singapore). Mã hạ tầng nằm trong `infra/template.mjs`; `npm run infra:prepare` tạo `infra/template.json`. Lệnh này không tạo tài nguyên AWS.

## Dịch vụ và lý do chọn

| Nhu cầu | Dịch vụ |
|---|---|
| Website React HTTPS | S3 riêng tư, CloudFront và Origin Access Control |
| Danh tính | Cognito User Pool, public client không có secret, JWT và authorization code/PKCE; nhóm reader/author/librarian/admin |
| API nghiệp vụ | HTTP API Gateway và Lambda Node.js 24 ARM64 |
| Dữ liệu dùng chung | DynamoDB theo mức sử dụng, mã hóa, PITR, TTL cho bản ghi tạm |
| Bìa/PDF/chương/âm thanh | S3 riêng tư, URL ký có hạn; upload trực tiếp S3 rồi kiểm tra hoàn tất |
| Trợ lý | Bedrock Converse; Knowledge Bases + Titan Embeddings v2 + S3 Vectors khi bật RAG |
| Nhắc hạn và hàng chờ | EventBridge Scheduler theo múi giờ Việt Nam, Lambda, SES |
| Giọng nói | Transcribe vi-VN/en-US; Polly en-US; Azure Speech vi-VN tùy chọn qua Secrets Manager |
| Vận hành | IAM theo tài nguyên, CloudWatch log và cảnh báo Lambda |

Quyền có hiệu lực được kiểm tra từ tài khoản hiện tại trong DynamoDB, kể cả token cũ còn hạn. Nhóm Cognito được đồng bộ khi đăng nhập/đổi quyền. Không cấp quyền quản trị từ thông tin vai trò do trình duyệt gửi lên.

Kho vector chỉ nhận metadata sách công khai, quy định hiện hành và nguồn admin đã duyệt. Worker đồng bộ mỗi 15 phút, rút nguồn bị thu hồi và thử lại ingestion bị lỗi. Kết quả tìm kiếm còn được kiểm tra lại phiên bản/quyền trước khi đưa vào câu trả lời. Phiếu mượn cá nhân và tồn kho lấy trực tiếp từ DynamoDB, không đưa vào vector store.

## Chuẩn bị phiên truy cập

Cài [AWS CLI chính thức](https://aws.amazon.com/cli/), sau đó đăng nhập bằng cơ chế được tài khoản cấp, ví dụ:

```powershell
aws login --region ap-southeast-1
# Hoặc với profile SSO đã cấu hình:
aws sso login --profile ten-profile
aws sts get-caller-identity --region ap-southeast-1
```

`aws login` cần phiên bản CLI hỗ trợ và quyền đăng nhập dành cho phát triển cục bộ theo [hướng dẫn AWS](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html). Không đặt mật khẩu console hoặc access key vào frontend, repository hay chat.

Sao chép `infra/deploy.example.json` thành `infra/deploy.local.json`, điền profile và các tham số đã xác minh. Có thể để trống `artifactBucket`: script tạo bucket riêng tư theo tài khoản/Region để lưu gói triển khai. Nếu điền bucket có sẵn, script kiểm tra đúng chủ tài khoản trước khi sử dụng. `expectedAccount` trong cấu hình local giúp chặn triển khai nhầm tài khoản.

- `BedrockModelId` và `BedrockModelArn`: cần điền cùng nhau. Mô hình/inference profile cần có quyền gọi tại Region này. Với cross-region inference phải bổ sung đúng quyền tài nguyên mô hình đích; không điền ARN phỏng đoán.
- `EnableKnowledgeBase`: `true` để tạo Knowledge Base và S3 Vectors. Cần quyền embedding Titan v2.
- `SenderEmail`: địa chỉ đã xác minh SES. Để trống thì không gửi thư thật.
- `VietnameseSpeechSecretArn`: ARN secret chứa JSON `{"region":"<azure-region>","key":"<speech-key>"}`; chỉ tạo trong Secrets Manager, không ghi giá trị secret vào tệp triển khai.

## Xem và áp dụng triển khai

```powershell
npm run aws:deploy
# Lệnh trên tải gói lên bucket triển khai và tạo change set chưa thực thi.
npm run aws:deploy -- --apply
```

Script kiểm tra danh tính bằng STS, đóng gói Lambda, tạo/cập nhật stack, lấy địa chỉ CloudFront, cập nhật origin/callback/CORS, build frontend dùng Cognito, tải website lên S3 và gọi Lambda khởi tạo dữ liệu. Không tạo tài khoản mẫu trong chế độ AWS. Có thể chọn tệp cấu hình bằng `--config <path>`.

Thông tin đầu ra công khai lưu ở `.local/aws-outputs.json`. Sau khi xuất bản, đăng ký và xác minh email, đăng nhập một lần. Trong terminal dành riêng cho quản trị triển khai, đặt `APP_MODE=aws`, `AWS_REGION`, `DYNAMODB_TABLE`, `CONTENT_BUCKET`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` từ output; bỏ `DYNAMODB_ENDPOINT`. Sau đó:

```powershell
node scripts/promote-admin.mjs email-da-xac-minh
```

Đăng xuất/đăng nhập lại để thấy giao diện admin. Tài khoản triển khai cần quyền DynamoDB và đồng bộ nhóm Cognito. Dùng phiên terminal riêng để tránh chuyển máy chủ local sang chế độ cloud.

## Nghiệm thu và vận hành

Chạy lại toàn bộ luồng độc giả/tác giả/thủ thư/admin qua URL HTTPS; kiểm tra khách không tải toàn văn, bản thảo người khác trả 403/404, tài khoản khóa bị từ chối. Thử upload PDF gần 20 MB qua S3, URL hết hạn, cập nhật revision, tranh chấp bản cuối, thư nhắc lặp và sự kiện Transcribe gửi lặp. Kiểm tra nguồn/câu trả lời RAG bằng câu hỏi có đáp án đã biết và câu hỏi không có nguồn. Chỉ ghi nhận dịch vụ hoạt động sau khi các bước này đạt trên tài khoản thật.

DynamoDB bật PITR; S3 bật versioning; dữ liệu giữ lại khi xóa stack. Khôi phục thử sang bảng/bucket riêng trước khi chuyển cấu hình ứng dụng; không ghi đè bảng đang dùng. Rollback frontend bằng bản build trước và CloudFront invalidation, rollback Lambda bằng gói phát hành đã lưu. Xóa stack không tự xóa các tài nguyên dữ liệu có chính sách Retain; cần kiểm kê chi phí khi kết thúc lab. Nên đặt AWS Budget theo ngân sách của chủ tài khoản; dự án chưa tự tạo ngân sách do chưa có mức chi phí được chọn.

## Tài liệu tham khảo đã đối chiếu

- [First Cloud Journey](https://cloudjourney.awsfcaj.com/), các lab [Serverless](https://000066.awsfcaj.com/), [SAM và Cognito](https://000136.awsfcaj.com/), [CloudFront/S3](https://000137.awsfcaj.com/).
- [Cognito authorization/PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html), [token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html).
- [S3 Vectors theo Region](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-regions-quotas.html), [CloudFormation S3 Vectors Index](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3vectors-index.html).
- [Quyền Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-permissions.html), [đồng bộ nguồn](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_StartIngestionJob.html).
- [Ngôn ngữ Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html), [ngôn ngữ Polly](https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html).
