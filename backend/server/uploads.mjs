import { ensure } from "./errors.mjs";
export async function validateApplicationEvidence(repo, actor, input) {
  ensure(
    !input.evidenceKey || input.evidenceUploadId,
    "invalidEvidence",
    "Minh chứng cần có mã tải lên hợp lệ.",
  );
  if (input.evidenceUploadId) {
    const upload = await repo.getSecret("UPLOAD", input.evidenceUploadId);
    ensure(
      upload?.ownerId === actor.id &&
        upload.complete &&
        upload.purpose === "evidence" &&
        (upload.contentType === "application/pdf" ||
          upload.contentType.startsWith("image/")),
      "invalidEvidence",
      "Bạn không sở hữu minh chứng hợp lệ.",
    );
    input.evidenceKey = upload.key;
  }
  if (input.portfolioUrl) {
    let url;
    try {
      url = new URL(input.portfolioUrl);
    } catch {
      ensure(false, "invalidEvidence", "Liên kết minh chứng không hợp lệ.");
    }
    ensure(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        input.portfolioUrl.length <= 500,
      "invalidEvidence",
      "Liên kết minh chứng phải dùng HTTPS, không chứa thông tin đăng nhập.",
    );
  }
}
export async function validateDraftUpload(repo, actor, input) {
  let uploadId = input.pdfUploadId;
  if (input.pdfUrl) {
    let url;
    try {
      url = new URL(input.pdfUrl);
    } catch {
      ensure(false, "invalidFile", "Liên kết PDF không hợp lệ.");
    }
    const match = url.pathname.match(/^\/api\/v1\/files\/([A-Za-z0-9-]+)$/);
    if (match) uploadId = match[1];
  }
  if (input.pdfKey)
    ensure(uploadId, "invalidFile", "Tệp PDF cần có mã tải lên hợp lệ.");
  if (uploadId) {
    const upload = await repo.getSecret("UPLOAD", uploadId);
    ensure(
      upload?.ownerId === actor.id &&
        upload.complete &&
        upload.contentType === "application/pdf",
      "invalidFile",
      "Bạn không sở hữu tệp PDF hợp lệ này.",
    );
    input.pdfKey = upload.key;
    input.pdfUploadId = uploadId;
  }
  return input;
}
