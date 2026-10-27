import { useState } from "react";

import { currentLibraryUser } from "../data/libraryData";

import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";

import { reviewAuthorApplication } from "../data/authorActions";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

import { useUiSettings } from "../ui/settings";

import "./ManagementModules.css";
import "./AuthorApplicationsPage.css";

const errors = {
  forbidden: [
    "Bạn không có quyền duyệt hồ sơ.",
    "You cannot review applications.",
  ],
  loginRequired: ["Vui lòng đăng nhập lại.", "Please sign in again."],
  invalidDecision: ["Thao tác không hợp lệ.", "Invalid action."],
  staleApplication: [
    "Hồ sơ đã thay đổi hoặc đã được xử lý. Kiểm tra lại danh sách.",
    "The application changed or has already been reviewed. Check the list.",
  ],
  accountChanged: [
    "Tài khoản không còn là độc giả. Kiểm tra lại tài khoản.",
    "The account is no longer a reader. Check the account.",
  ],
  accountLocked: [
    "Mở khóa tài khoản trước khi duyệt.",
    "Unlock the account before approving.",
  ],
  invalidReason: [
    "Lý do từ chối cần từ 5 đến 500 ký tự.",
    "The rejection reason must contain 5 to 500 characters.",
  ],
};

function proofUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default function AuthorApplicationsPage() {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [filter, setFilter] = useState("pending");
  const [notice, setNotice] = useState(null);

  const statusLabels = {
    pending: label("Chờ duyệt", "Pending"),
    approved: label("Đã duyệt", "Approved"),
    rejected: label("Bị từ chối", "Rejected"),
  };

  if (!hasPermission(currentLibraryUser(data), P.AUTHORS_REVIEW)) {
    return <p role="alert">{label(...errors.forbidden)}</p>;
  }

  const applications = data.authorApplications || [];

  const rows = applications
    .filter((item) => filter === "all" || item.status === filter)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  function handleReview(event, application) {
    event.preventDefault();

    const decision = event.nativeEvent.submitter?.value;

    const reason = new FormData(event.currentTarget).get("reason");

    const result = runLibraryCommand(P.AUTHORS_REVIEW, (state) =>
      reviewAuthorApplication(state, {
        id: application.id,
        expectedSubmittedAt: application.submittedAt,
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
            {label("Duyệt đăng ký tác giả", "Review author applications")}
          </h2>

          <p>
            {label(
              "Xem hồ sơ và minh chứng trước khi cấp quyền tác giả.",
              "Review the application and supporting link before granting author access.",
            )}
          </p>
        </div>
      </div>

      <div className="manage-toolbar">
        <label className="manage-filter">
          {label("Trạng thái", "Status")}

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">{label("Tất cả", "All")}</option>

            {Object.entries(statusLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <span className="manage-muted">
          {label("Số hồ sơ", "Applications")}: {rows.length}
        </span>
      </div>

      <div role="status" className="manage-feedback">
        {notice?.success === "approve" &&
          label(
            "Đã duyệt hồ sơ và cấp quyền tác giả.",
            "Application approved and author access granted.",
          )}

        {notice?.success === "reject" &&
          label(
            "Đã từ chối hồ sơ kèm lý do.",
            "Application rejected with a reason.",
          )}
      </div>

      {notice?.error && (
        <p role="alert" className="manage-error">
          {label(
            ...(errors[notice.error] || [
              "Chưa xử lý được hồ sơ.",
              "Unable to review this application.",
            ]),
          )}
        </p>
      )}

      {!rows.length && (
        <p className="manage-empty">
          {label(
            "Không có hồ sơ ở trạng thái này.",
            "No applications with this status.",
          )}
        </p>
      )}

      <div className="author-review-list">
        {rows.map((application) => {
          const link = proofUrl(application.portfolioUrl);

          return (
            <details
              className="author-review-card"
              key={`${application.id}:${application.submittedAt}:${application.status}`}
            >
              <summary>
                <strong>{application.penName}</strong>

                <span>{application.readerEmail}</span>

                <span className="manage-badge">
                  {statusLabels[application.status]}
                </span>
              </summary>

              <dl>
                <dt>{label("Họ và tên", "Full name")}</dt>
                <dd>{application.fullName}</dd>

                <dt>{label("Số điện thoại", "Phone")}</dt>
                <dd>{application.phone}</dd>

                <dt>{label("Giới thiệu", "Biography")}</dt>
                <dd>{application.bio}</dd>

                <dt>{label("Minh chứng", "Supporting link")}</dt>
                <dd>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      {label("Mở liên kết minh chứng", "Open supporting link")}
                    </a>
                  ) : (
                    label("Liên kết không hợp lệ", "Invalid link")
                  )}
                </dd>

                <dt>{label("Ngày gửi", "Submitted")}</dt>
                <dd>
                  {new Date(application.submittedAt).toLocaleString(
                    language === "en" ? "en-US" : "vi-VN",
                  )}
                </dd>

                {application.reviewedBy && (
                  <>
                    <dt>{label("Người xét duyệt", "Reviewer")}</dt>
                    <dd>{application.reviewedBy}</dd>
                  </>
                )}

                {application.status === "rejected" && (
                  <>
                    <dt>{label("Lý do từ chối", "Rejection reason")}</dt>
                    <dd>{application.rejectionReason}</dd>
                  </>
                )}
              </dl>

              {application.status === "pending" && (
                <form onSubmit={(event) => handleReview(event, application)}>
                  <label className="manage-field">
                    <span>
                      {label(
                        "Lý do nếu từ chối (5–500 ký tự)",
                        "Reason if rejecting (5–500 characters)",
                      )}
                    </span>

                    <textarea name="reason" rows={3} maxLength={500} />
                  </label>

                  <div className="manage-dialog-actions">
                    <button
                      className="loan-button"
                      type="submit"
                      name="decision"
                      value="reject"
                    >
                      {label("Từ chối", "Reject")}
                    </button>

                    <button
                      className="loan-button is-primary"
                      type="submit"
                      name="decision"
                      value="approve"
                    >
                      {label("Duyệt và cấp quyền", "Approve and grant access")}
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
