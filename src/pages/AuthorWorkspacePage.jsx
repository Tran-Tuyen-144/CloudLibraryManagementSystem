import { useState } from "react";

import { getAuthorWorkspace, saveAuthorDraft } from "../data/authorWorkspace";

import { PERMISSIONS as P } from "../data/libraryPermissions";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

import { useUiSettings } from "../ui/settings";

import "./ReaderPages.css";
import "./AuthorWorkspacePage.css";
import { submitAuthorManuscript } from "../data/manuscriptWorkflow";
function DraftForm({ draft, onSave, onCancel, language }) {
  const label = (vi, en) => (language === "en" ? en : vi);

  function submit(event) {
    event.preventDefault();

    const values = Object.fromEntries(new FormData(event.currentTarget));

    onSave({
      ...values,
      id: draft.id,
      expectedRevision: draft.revision,
    });
  }

  return (
    <form className="author-draft-form" onSubmit={submit}>
      <h3>
        {draft.id
          ? label("Sửa bản thảo", "Edit draft")
          : label("Bản thảo mới", "New draft")}
      </h3>

      <label className="reader-field">
        <span>{label("Tên tác phẩm", "Title")}</span>

        <input
          name="title"
          defaultValue={draft.title || ""}
          minLength={2}
          maxLength={160}
          required
        />
      </label>

      <label className="reader-field">
        <span>{label("Thể loại", "Category")}</span>

        <input
          name="category"
          defaultValue={draft.category || ""}
          maxLength={80}
          required
        />
      </label>

      <label className="reader-field">
        <span>{label("Giới thiệu tác phẩm", "Description")}</span>

        <textarea
          name="description"
          rows={5}
          defaultValue={draft.description || ""}
          maxLength={3000}
        />
      </label>

      <label className="reader-field">
        <span>
          {label(
            "Liên kết PDF (có thể bổ sung sau)",
            "PDF link (optional for drafts)",
          )}
        </span>

        <input
          name="pdfUrl"
          type="url"
          placeholder="https://..."
          defaultValue={draft.pdfUrl || ""}
          maxLength={1000}
        />
      </label>

      <div className="author-actions">
        <button
          type="button"
          className="reader-button reader-button-secondary"
          onClick={onCancel}
        >
          {label("Hủy", "Cancel")}
        </button>

        <button type="submit" className="reader-button">
          {label("Lưu bản thảo", "Save draft")}
        </button>
      </div>
    </form>
  );
}

export default function AuthorWorkspacePage({ onBrowse }) {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [tab, setTab] = useState("overview");
  const [editor, setEditor] = useState(null);
  const [message, setMessage] = useState("");

  const workspace = getAuthorWorkspace(data);
  const successMessages = {
    saved: label("Đã lưu bản thảo.", "Draft saved."),

    submitted: label(
      "Đã gửi bản thảo cho admin xét duyệt.",
      "Manuscript submitted for admin review.",
    ),
  };

  const errors = {
    incompleteManuscript: label(
      "Bổ sung mô tả từ 30 ký tự và liên kết PDF trước khi gửi duyệt.",
      "Add a description of at least 30 characters and a PDF link before submitting.",
    ),

    forbidden: label(
      "Bạn chưa có quyền tác giả được duyệt.",
      "Approved author access is required.",
    ),

    staleDraft: label(
      "Bản thảo đã thay đổi hoặc không còn được sửa. Hãy đóng form và mở lại bản thảo.",
      "The draft changed or can no longer be edited. Close the form and reopen the draft.",
    ),

    invalidDraft: label(
      "Nhập tên từ 2–160 ký tự, thể loại tối đa 80 ký tự và mô tả tối đa 3000 ký tự.",
      "Enter a 2–160 character title, a category of up to 80 characters and a description of up to 3000 characters.",
    ),

    invalidUrl: label(
      "Liên kết PDF cần bắt đầu bằng https:// và không chứa thông tin đăng nhập.",
      "The PDF URL must use https:// and contain no sign-in credentials.",
    ),

    loginRequired: label("Vui lòng đăng nhập lại.", "Please sign in again."),
  };

  if (!workspace.allowed) {
    return <p role="alert">{errors.forbidden}</p>;
  }

  const { profile, user, manuscripts, books } = workspace;

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
    setTab("works");
  }

  function save(values) {
    const result = runLibraryCommand(P.AUTHOR_WORKSPACE, (state) =>
      saveAuthorDraft(state, values),
    );

    if (result.ok) {
      setEditor(null);
    }

    setMessage(result.ok ? "saved" : result.error);
  }
  function send(item) {
    const result = runLibraryCommand(P.AUTHOR_WORKSPACE, (state) =>
      submitAuthorManuscript(state, {
        id: item.id,
        expectedRevision: item.revision,
      }),
    );

    setMessage(result.ok ? "submitted" : result.error);
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
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </nav>

      <p
        className="reader-status"
        role={message && message !== "saved" ? "alert" : "status"}
      >
        {message === "saved"
          ? label("Đã lưu bản thảo.", "Draft saved.")
          : errors[message] ||
            (message
              ? label("Chưa lưu được bản thảo.", "Unable to save the draft.")
              : "")}
      </p>

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
                "Lưu ý tưởng, thể loại và nội dung giới thiệu dưới dạng bản thảo. Bản thảo chưa xuất hiện trong danh mục công khai.",
                "Save your ideas, category and description as a draft. Drafts are not shown in the public catalog.",
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
              <DraftForm
                key={editor.editorKey}
                draft={editor}
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

                    <div className="author-actions">
                      {["draft", "rejected"].includes(item.status) && (
                        <button
                          className="reader-button reader-button-secondary"
                          type="button"
                          onClick={() => openEditor(item)}
                        >
                          {label("Chỉnh sửa", "Edit")}
                        </button>
                      )}

                      {item.status === "draft" && (
                        <button
                          className="reader-button"
                          type="button"
                          disabled={editor !== null}
                          title={
                            editor !== null
                              ? label(
                                  "Lưu hoặc hủy form trước khi gửi duyệt.",
                                  "Save or cancel the form before submitting.",
                                )
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
