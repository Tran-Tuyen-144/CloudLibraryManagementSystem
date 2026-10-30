import { useState } from "react";
import { manuscriptPreviewBook } from "../data/manuscriptContent";
import { canReadBook } from "../data/readerContent";
import { authorErrors } from "../ui/authorMessages";
import { BookCover } from "../components/books/HomeSections";
import ReaderPage from "./ReaderPage";
import { currentLibraryUser } from "../data/libraryData";

import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";

import { reviewAuthorManuscript } from "../data/manuscriptWorkflow";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

import { useUiSettings } from "../ui/settings";

import "./ManagementModules.css";
import "./AuthorApplicationsPage.css";

const errors = {
  forbidden: [
    "Bạn không có quyền duyệt bản thảo.",
    "You cannot review manuscripts.",
  ],
  loginRequired: ["Vui lòng đăng nhập lại.", "Please sign in again."],
  invalidDecision: ["Thao tác không hợp lệ.", "Invalid action."],
  staleManuscript: [
    "Bản thảo đã thay đổi hoặc đã được xử lý. Kiểm tra lại danh sách.",
    "The manuscript changed or has already been reviewed. Check the list.",
  ],
  invalidReason: [
    "Lý do từ chối cần từ 5 đến 500 ký tự.",
    "The rejection reason must contain 5 to 500 characters.",
  ],
  authorUnavailable: [
    "Tài khoản tác giả đang bị khóa hoặc không còn quyền đã được duyệt.",
    "The author account is locked or no longer has approved author access.",
  ],
  incompleteManuscript: [
    "Bản thảo cần đủ tên, thể loại, mô tả từ 30 ký tự và liên kết PDF.",
    "The manuscript needs a title, category, a description of at least 30 characters and a PDF link.",
  ],
  invalidUrl: [
    "Liên kết PDF không hợp lệ. Yêu cầu tác giả chỉnh sửa.",
    "The PDF link is invalid. Ask the author to update it.",
  ],
  duplicatePublication: [
    "Bản thảo đã có sách liên kết, không thể xuất bản trùng.",
    "A linked book already exists. Duplicate publication is not allowed.",
  ],
};

Object.assign(errors, {
  incompleteManuscript: authorErrors.incompleteManuscript,
  invalidCover: authorErrors.invalidCover,
  invalidChapters: authorErrors.invalidChapters,
  incompleteChapters: authorErrors.incompleteChapters,
  storageFailed: [
    "Trình duyệt chưa lưu được kết quả duyệt. Bản thảo chưa đổi trạng thái; giải phóng dung lượng và thử lại.",
    "The review could not be saved. The manuscript status is unchanged; free browser storage and retry.",
  ],
});

function safePdf(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export default function ManuscriptReviewPage() {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const [filter, setFilter] = useState("pending");
  const [notice, setNotice] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const label = (vi, en) => (language === "en" ? en : vi);

  const statuses = {
    pending: label("Chờ duyệt", "Pending"),
    published: label("Đã xuất bản", "Published"),
    rejected: label("Đã trả lại", "Returned for changes"),
  };

  const user = currentLibraryUser(data);

  if (!hasPermission(user, P.MANUSCRIPTS_REVIEW)) {
    return <p role="alert">{label(...errors.forbidden)}</p>;
  }
  const preview = (data.authorManuscripts || []).find(
  (item) =>
    item.id === previewId &&
    Object.hasOwn(statuses, item.status),
);

if (preview) {
  return (
    <ReaderPage
      key={`${preview.id}:${preview.revision}`}
      preview
      book={manuscriptPreviewBook(preview)}
      user={user}
      onBack={() => setPreviewId(null)}
    />
  );
}

  // Chỉ hiện những bản thảo đã được gửi xét duyệt.
  const rows = (data.authorManuscripts || [])
    .filter(
      (item) =>
        Object.hasOwn(statuses, item.status) &&
        (filter === "all" || item.status === filter),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function handleReview(event, item) {
    event.preventDefault();

    const decision = event.nativeEvent.submitter?.value;

    const formData = new FormData(event.currentTarget);

    const reason = formData.get("reason");

    const result = runLibraryCommand(P.MANUSCRIPTS_REVIEW, (state) =>
      reviewAuthorManuscript(state, {
        id: item.id,
        expectedRevision: item.revision,
        decision,
        reason,
      }),
    );

    setNotice(result.ok ? { success: decision } : { error: result.error });
  }

  return (
    <section className="manage-module author-review">
      <div className="manage-module-heading">
        <div>
          <h2>
            {label("Duyệt xuất bản tác phẩm", "Review manuscript publication")}
          </h2>

          <p>
  {label(
    "Xem trước các chương hoặc PDF trước khi xuất bản. Sách mới được thêm dưới dạng đọc online, chưa có bản giấy.",
    "Preview the chapters or PDF before publishing. New books are added for online reading with no physical copies.",
  )}
</p>
        </div>
      </div>

      <div className="manage-toolbar">
        <label className="manage-filter">
          <span>{label("Trạng thái", "Status")}</span>

          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setNotice(null);
            }}
          >
            <option value="all">{label("Tất cả", "All")}</option>

            {Object.entries(statuses).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <span className="manage-muted">
          {label("Số bản thảo", "Manuscripts")}: {rows.length}
        </span>
      </div>

      <div className="manage-feedback" role="status">
        {notice?.success === "publish" &&
          label(
            "Đã xuất bản. Sách đã có trong danh mục thư viện.",
            "Published. The book is now in the library catalog.",
          )}

        {notice?.success === "reject" &&
          label(
            "Đã trả bản thảo kèm lý do cho tác giả.",
            "The manuscript was returned to its author with a reason.",
          )}
      </div>

      {notice?.error && (
        <p className="manage-error" role="alert">
          {label(
            ...(errors[notice.error] || [
              "Chưa xử lý được bản thảo.",
              "Unable to review this manuscript.",
            ]),
          )}
        </p>
      )}

      {!rows.length && (
        <p className="manage-empty">
          {label(
            "Không có bản thảo ở trạng thái này.",
            "No manuscripts with this status.",
          )}
        </p>
      )}

      <div className="author-review-list">
        {rows.map((item) => {
          const pdf = safePdf(item.pdfUrl);

          return (
            <details
              className="author-review-card"
              key={`${item.id}:${item.revision}`}
            >
              <summary>
                <strong>{item.title}</strong>

                <span>{item.authorName}</span>

                <span className="manage-badge">{statuses[item.status]}</span>
              </summary>

              <dl>
                <dt>{label("Tài khoản tác giả", "Author account")}</dt>
                <dd>{item.authorEmail}</dd>

                <dt>{label("Thể loại", "Category")}</dt>
                <dd>{item.category}</dd>

                <dt>{label("Giới thiệu", "Description")}</dt>
                <dd>{item.description}</dd>

                <dt>PDF</dt>
<dd>
  {pdf ? (
    <a href={pdf} target="_blank" rel="noopener noreferrer">
      {label("Mở PDF để kiểm tra", "Open PDF for review")}
    </a>
  ) : item.pdfUrl ? (
    label("Liên kết không hợp lệ", "Invalid link")
  ) : (
    label("Không cung cấp PDF", "No PDF provided")
  )}
</dd>

                {item.reviewedBy && (
                  <>
                    <dt>{label("Người xét duyệt", "Reviewer")}</dt>
                    <dd>{item.reviewedBy}</dd>
                  </>
                )}

                {item.rejectionReason && (
                  <>
                    <dt>{label("Lý do trả lại", "Reason for return")}</dt>
                    <dd>{item.rejectionReason}</dd>
                  </>
                )}
                <dt>{label("Ảnh bìa", "Cover")}</dt>
<dd>
  <div className="author-review-cover">
    <BookCover book={manuscriptPreviewBook(item)} />
  </div>
</dd>

<dt>{label("Nội dung chương", "Chapters")}</dt>
<dd>
  {item.chapters?.length || 0} {label("chương", "chapters")}
</dd>
              </dl>
              <div className="manage-dialog-actions">
  <button
    type="button"
    className="loan-button"
    disabled={!canReadBook(manuscriptPreviewBook(item))}
    onClick={() => setPreviewId(item.id)}
  >
    {label("Xem trước nội dung", "Preview content")}
  </button>
</div>

              {item.status === "pending" && (
                <form onSubmit={(event) => handleReview(event, item)}>
                  <label className="manage-field">
                    <span>
                      {label(
                        "Lý do nếu trả lại (5–500 ký tự)",
                        "Reason if returning (5–500 characters)",
                      )}
                    </span>

                    <textarea name="reason" rows={3} maxLength={500} />
                  </label>

                  <div className="manage-dialog-actions">
                    <button
                      type="submit"
                      className="loan-button"
                      name="decision"
                      value="reject"
                    >
                      {label("Trả lại chỉnh sửa", "Return for changes")}
                    </button>

                    <button
                      type="submit"
                      className="loan-button is-primary"
                      name="decision"
                      value="publish"
                    >
                      {label("Duyệt xuất bản", "Approve publication")}
                    </button>
                  </div>
                </form>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
