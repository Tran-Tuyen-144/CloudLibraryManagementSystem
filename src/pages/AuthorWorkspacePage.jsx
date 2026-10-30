import { useState } from "react";
import AuthorDraftForm from "./AuthorDraftForm";
import ReaderPage from "./ReaderPage";

import { canReadBook } from "../data/readerContent";
import { manuscriptPreviewBook } from "../data/manuscriptContent";
import { getAuthorWorkspace, saveAuthorDraft } from "../data/authorWorkspace";
import { submitAuthorManuscript } from "../data/manuscriptWorkflow";
import { PERMISSIONS as P } from "../data/libraryPermissions";

import { authorErrors, authorErrorMessage } from "../ui/authorMessages";
import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";
import { useUiSettings } from "../ui/settings";

import "./ReaderPages.css";
import "./AuthorWorkspacePage.css";

export default function AuthorWorkspacePage({ onBrowse }) {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [tab, setTab] = useState("overview");
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [submissionFeedback, setSubmissionFeedback] = useState(null);

  const workspace = getAuthorWorkspace(data);

  const successMessages = {
    saved: label("Đã lưu bản thảo.", "Draft saved."),
    submitted: label(
      "Đã gửi bản thảo cho admin xét duyệt.",
      "Manuscript submitted for admin review.",
    ),
  };

  const errors = Object.fromEntries(
    Object.keys(authorErrors).map((code) => [
      code,
      authorErrorMessage(code, language),
    ]),
  );

  if (!workspace.allowed) {
    return <p role="alert">{errors.forbidden}</p>;
  }

  const { profile, user, manuscripts, books } = workspace;

  if (preview) {
    return (
      <ReaderPage
        key={preview.id}
        preview
        book={preview}
        user={user}
        onBack={() => setPreview(null)}
      />
    );
  }

  const statuses = {
    draft: label("Bản nháp", "Draft"),
    pending: label("Chờ duyệt", "Pending"),
    published: label("Đã xuất bản", "Published"),
    rejected: label("Cần chỉnh sửa", "Changes requested"),
  };

  const rows = [...manuscripts].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  function openEditor(draft = {}) {
    setEditor({
      ...draft,
      editorKey: crypto.randomUUID(),
    });

    setMessage("");
    setSubmissionFeedback(null);
    setTab("works");
  }

  function save(values) {
    const result = runLibraryCommand(P.AUTHOR_WORKSPACE, (state) =>
      saveAuthorDraft(state, values),
    );

    if (result.ok) {
      setEditor(null);
      setSubmissionFeedback(null);
    }

    setMessage(result.ok ? "saved" : result.error);
  }

  function submissionText(item) {
    const feedback = submissionFeedback;

    if (!feedback || feedback.id !== item.id) {
      return "";
    }

    if (feedback.ok) {
      return successMessages.submitted;
    }

    if (feedback.code === "incompleteManuscript") {
      const title = String(item.title || "").trim();
      const category = String(item.category || "").trim();
      const description = String(item.description || "").trim();

      const missing = [];

      if (title.length < 2 || title.length > 160) {
        missing.push(
          label(
            "Tên tác phẩm cần từ 2–160 ký tự.",
            "The title must contain 2–160 characters.",
          ),
        );
      }

      if (!category || category.length > 80) {
        missing.push(
          label(
            "Chọn thể loại hợp lệ, tối đa 80 ký tự.",
            "Choose a valid category of up to 80 characters.",
          ),
        );
      }

      if (description.length < 30) {
        missing.push(
          label(
            `Giới thiệu cần ít nhất 30 ký tự (hiện có ${description.length}).`,
            `The description needs at least 30 characters (currently ${description.length}).`,
          ),
        );
      } else if (description.length > 3000) {
        missing.push(
          label(
            "Giới thiệu không được vượt quá 3.000 ký tự.",
            "The description must not exceed 3,000 characters.",
          ),
        );
      }

      return missing.length
        ? missing.join(" ")
        : label(
            "Thêm nội dung chương hoặc liên kết PDF trước khi gửi duyệt.",
            "Add chapter content or a PDF link before submitting.",
          );
    }

    if (feedback.code === "incompleteChapters") {
      const index = (item.chapters || []).findIndex(
        (chapter) => !chapter.title?.trim() || !chapter.content?.trim(),
      );

      if (index >= 0) {
        const chapter = item.chapters[index];

        const fields = [
          !chapter.title?.trim() && label("tên chương", "a title"),
          !chapter.content?.trim() && label("nội dung", "content"),
        ]
          .filter(Boolean)
          .join(label(" và ", " and "));

        return label(
          `Chương ${index + 1} còn thiếu ${fields}. Bấm Chỉnh sửa để bổ sung rồi lưu lại.`,
          `Chapter ${index + 1} is missing ${fields}. Select Edit, complete it, and save.`,
        );
      }
    }

    return (
      errors[feedback.code] ||
      label(
        "Chưa gửi được bản thảo. Hãy thử lại.",
        "Unable to submit the manuscript. Please retry.",
      )
    );
  }

  function send(item) {
    setMessage("");

    if (editor !== null) {
      setSubmissionFeedback({
        id: item.id,
        code: "editorOpen",
        ok: false,
      });
      return;
    }

    const result = runLibraryCommand(P.AUTHOR_WORKSPACE, (state) =>
      submitAuthorManuscript(state, {
        id: item.id,
        expectedRevision: item.revision,
      }),
    );

    setSubmissionFeedback({
      id: item.id,
      code: result.ok ? "submitted" : result.error,
      ok: result.ok,
    });
  }

  return (
    <section className="reader-page author-workspace">
      <header className="author-hero">
        <div>
          <span className="author-verified">
            {label("Tác giả đã được duyệt", "Approved author")}
          </span>

          <h2>
            {label("Xin chào", "Welcome")}, {profile.penName}
          </h2>

          <p
            className="reader-status"
            role={message && !successMessages[message] ? "alert" : "status"}
          >
            {successMessages[message] ||
              errors[message] ||
              (message
                ? label(
                    "Chưa thực hiện được thao tác.",
                    "Unable to complete this action.",
                  )
                : "")}
          </p>
        </div>

        <button
          className="reader-button"
          type="button"
          disabled={editor !== null}
          onClick={() => openEditor()}
        >
          {label("Tạo bản thảo", "Create draft")}
        </button>
      </header>

      <nav
        className="reader-tabs"
        aria-label={label("Khu vực tác giả", "Author workspace")}
      >
        {[
          ["overview", label("Tổng quan", "Overview")],
          ["works", label("Tác phẩm", "Works")],
          ["profile", label("Hồ sơ tác giả", "Author profile")],
        ].map(([id, text]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "is-active" : ""}
            aria-current={tab === id ? "page" : undefined}
            disabled={editor !== null && id !== "works"}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="reader-stats">
            {[
              [
                label("Bản nháp", "Drafts"),
                manuscripts.filter((item) => item.status === "draft").length,
              ],
              [
                label("Chờ duyệt", "Pending review"),
                manuscripts.filter((item) => item.status === "pending").length,
              ],
              [label("Sách đang hiển thị", "Listed books"), books.length],
            ].map(([text, count]) => (
              <div className="reader-stat" key={text}>
                <span>{text}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>

          <div className="reader-panel">
            <h3>{label("Bắt đầu một tác phẩm mới", "Start a new work")}</h3>

            <p className="reader-muted">
              {label(
                "Soạn chương, thêm ảnh bìa hoặc liên kết PDF và xem trước nội dung. Lưu bản nháp để tiếp tục chỉnh sửa trước khi gửi duyệt.",
                "Write chapters, add a cover or PDF, and preview the content. Save your draft to keep editing before submitting for review.",
              )}
            </p>

            <div className="author-actions">
              <button
                className="reader-button reader-button-secondary"
                type="button"
                onClick={onBrowse}
              >
                {label("Khám phá thư viện", "Explore the library")}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "works" && (
        <>
          {editor !== null && (
            <div className="reader-panel">
              <AuthorDraftForm
                key={editor.editorKey}
                draft={editor}
                user={user}
                authorName={profile.penName}
                language={language}
                onSave={save}
                onCancel={() => setEditor(null)}
              />
            </div>
          )}

          <div className="reader-panel">
            <div className="reader-panel-heading">
              <h3>{label("Bản thảo của tôi", "My manuscripts")}</h3>
            </div>

            {!rows.length ? (
              <p className="reader-muted">
                {label(
                  "Chưa có bản thảo. Bấm Tạo bản thảo để bắt đầu.",
                  "No drafts yet. Select Create draft to begin.",
                )}
              </p>
            ) : (
              <ul className="author-work-list">
                {rows.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>

                      <span>
                        {item.category} · {statuses[item.status]}
                        {item.chapters?.length
                          ? ` · ${item.chapters.length} ${label("chương", "chapters")}`
                          : ""}
                      </span>

                      <small>
                        {label("Cập nhật", "Updated")}:{" "}
                        {new Date(item.updatedAt).toLocaleString(
                          language === "en" ? "en-US" : "vi-VN",
                        )}
                      </small>

                      {item.rejectionReason && (
                        <p className="reader-muted">
                          {label("Lý do trả lại", "Reason for return")}:{" "}
                          {item.rejectionReason}
                        </p>
                      )}
                    </div>

                    <div className="author-work-controls">
                      {submissionFeedback?.id === item.id && (
                        <p
                          id={`manuscript-feedback-${item.id}`}
                          className={`author-submit-feedback ${
                            submissionFeedback.ok ? "is-success" : "is-error"
                          }`}
                          role={submissionFeedback.ok ? "status" : "alert"}
                          aria-atomic="true"
                        >
                          {submissionText(item)}
                        </p>
                      )}

                      <div className="author-actions">
                        <button
                          className="reader-button reader-button-secondary"
                          type="button"
                          disabled={
                            editor !== null ||
                            !canReadBook(manuscriptPreviewBook(item))
                          }
                          onClick={() =>
                            setPreview(manuscriptPreviewBook(item))
                          }
                        >
                          {label("Xem trước", "Preview")}
                        </button>

                        {["draft", "rejected"].includes(item.status) && (
                          <button
                            className="reader-button reader-button-secondary"
                            type="button"
                            disabled={editor !== null}
                            onClick={() => openEditor(item)}
                          >
                            {label("Chỉnh sửa", "Edit")}
                          </button>
                        )}

                        {item.status === "draft" && (
                          <button
                            className="reader-button"
                            type="button"
                            aria-describedby={
                              submissionFeedback?.id === item.id
                                ? `manuscript-feedback-${item.id}`
                                : undefined
                            }
                            onClick={() => send(item)}
                          >
                            {label(
                              "Gửi duyệt xuất bản",
                              "Submit for publication",
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="reader-panel">
            <h3>
              {label("Sách của tôi trong thư viện", "My books in the library")}
            </h3>

            {!books.length ? (
              <p className="reader-muted">
                {label(
                  "Chưa có sách được liên kết với tài khoản tác giả này.",
                  "No books are linked to this author account yet.",
                )}
              </p>
            ) : (
              <ul className="author-work-list">
                {books.map((book) => (
                  <li key={book.id}>
                    <div>
                      <strong>{book.title}</strong>
                      <span>{book.category}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === "profile" && (
        <div className="reader-panel">
          <div className="reader-panel-heading">
            <h3>{label("Hồ sơ đã được duyệt", "Approved profile")}</h3>
          </div>

          <dl className="author-profile-data">
            <dt>{label("Bút danh", "Pen name")}</dt>
            <dd>{profile.penName}</dd>

            <dt>{label("Họ tên trong hồ sơ", "Application full name")}</dt>
            <dd>{profile.fullName}</dd>

            <dt>Email</dt>
            <dd>{user.email}</dd>

            <dt>{label("Số điện thoại", "Phone")}</dt>
            <dd>{profile.phone}</dd>

            <dt>{label("Giới thiệu", "Biography")}</dt>
            <dd>{profile.bio}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}