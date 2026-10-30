import { useId, useRef, useState } from "react";
import CategoryInput from "../components/books/CategoryInput";
import { BookCover } from "../components/books/HomeSections";
import {
  CHAPTER_LIMITS,
  manuscriptContent,
  manuscriptPreviewBook,
  moveManuscriptChapter,
  safeCoverUrl,
} from "../data/manuscriptContent";
import { canReadBook } from "../data/readerContent";
import { authorErrorMessage } from "../ui/authorMessages";
import ReaderPage from "./ReaderPage";

export default function AuthorDraftForm({
  draft,
  user,
  authorName,
  onSave,
  onCancel,
  language,
}) {
  const label = (vi, en) => (language === "en" ? en : vi);
  const form = useRef(null);
  const id = useId();

  const [cover, setCover] = useState(draft.cover || "");

  const [chapters, setChapters] = useState(() =>
    (Array.isArray(draft.chapters) ? draft.chapters : []).map((row, index) => {
      const chapter = row && typeof row === "object" ? row : {};

      return {
        id:
          typeof chapter.id === "string" && chapter.id
            ? chapter.id
            : `chapter-${index + 1}`,
        title: typeof chapter.title === "string" ? chapter.title : "",
        content: typeof chapter.content === "string" ? chapter.content : "",
      };
    }),
  );

  const [deleted, setDeleted] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const total = chapters.reduce(
    (sum, chapter) => sum + chapter.content.length,
    0,
  );

  function values() {
    return {
      ...Object.fromEntries(new FormData(form.current)),
      cover,
      chapters,
      id: draft.id,
      expectedRevision: draft.revision,
    };
  }

  function submit(event) {
    event.preventDefault();

    const input = values();
    const result = manuscriptContent(input);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
    onSave(input);
  }

  function showPreview() {
    if (!form.current.reportValidity()) return;

    const input = values();
    const result = manuscriptContent(input);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const book = manuscriptPreviewBook({
      ...input,
      ...result,
      authorName,
      editorKey: draft.editorKey,
    });

    if (!canReadBook(book)) {
      setError("noPreviewContent");
      return;
    }

    setError("");
    setPreview(book);
  }

  function changeChapter(chapterId, name, value) {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, [name]: value } : chapter,
      ),
    );

    setError("");
  }

  function removeChapter(chapterId) {
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);

    setDeleted({ chapter: chapters[index], index });

    setChapters((current) =>
      current.filter((chapter) => chapter.id !== chapterId),
    );
  }

  function undoDelete() {
    if (!deleted || chapters.length >= CHAPTER_LIMITS.count) return;

    setChapters((current) => {
      const next = [...current];

      next.splice(Math.min(deleted.index, next.length), 0, deleted.chapter);

      return next;
    });

    setDeleted(null);
  }

  return (
    <>
      <form
        ref={form}
        className="author-draft-form"
        hidden={Boolean(preview)}
        onSubmit={submit}
      >
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

        <CategoryInput defaultValue={draft.category || ""} />

        <label className="reader-field">
          <span>{label("Giới thiệu tác phẩm", "Description")}</span>
          <textarea
            name="description"
            rows={4}
            defaultValue={draft.description || ""}
            maxLength={3000}
          />
        </label>

        <div className="author-cover-editor">
          <div className="author-cover-preview">
            <BookCover
              book={{
                title: draft.title || label("Ảnh bìa", "Cover"),
                author: authorName,
                cover: safeCoverUrl(cover),
              }}
            />
          </div>

          <div>
            <label className="reader-field">
              <span>{label("Liên kết ảnh bìa", "Cover image URL")}</span>
              <input
                name="cover"
                type="url"
                value={cover}
                maxLength={2000}
                placeholder="https://..."
                onChange={(event) => {
                  setCover(event.target.value);
                  setError("");
                }}
              />
            </label>

            <p className="reader-muted">
              {label(
                "Ảnh bìa có thể bổ sung sau. Nếu ảnh không tải được, thư viện sẽ hiển thị bìa chữ.",
                "A cover is optional. If the image cannot load, the library displays a text cover.",
              )}
            </p>

            {cover && (
              <button
                type="button"
                className="reader-link"
                onClick={() => setCover("")}
              >
                {label("Bỏ ảnh bìa", "Remove cover")}
              </button>
            )}
          </div>
        </div>

        <label className="reader-field">
          <span>
            {label(
              "Liên kết PDF (không bắt buộc khi đã có chương)",
              "PDF link (optional when chapters are provided)",
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

        <section
          className="author-chapter-editor"
          aria-labelledby={`${id}-chapters`}
        >
          <div className="reader-panel-heading">
            <div>
              <h3 id={`${id}-chapters`}>
                {label("Nội dung theo chương", "Chapter content")}
              </h3>

              <p className="reader-muted">
                {chapters.length} / {CHAPTER_LIMITS.count}{" "}
                {label("chương", "chapters")} ·{" "}
                {total.toLocaleString(language === "en" ? "en-US" : "vi-VN")} /{" "}
                {CHAPTER_LIMITS.total.toLocaleString()}{" "}
                {label("ký tự", "characters")}
              </p>
            </div>

            <button
              type="button"
              className="reader-button reader-button-secondary"
              disabled={chapters.length >= CHAPTER_LIMITS.count}
              onClick={() =>
                setChapters((current) => [
                  ...current,
                  { id: crypto.randomUUID(), title: "", content: "" },
                ])
              }
            >
              {label("Thêm chương", "Add chapter")}
            </button>
          </div>

          {!chapters.length && (
            <p className="reader-muted">
              {label(
                "Bấm Thêm chương để soạn nội dung đọc chữ, hoặc cung cấp PDF để đọc bản gốc.",
                "Add chapters for Text mode, or provide a PDF to read the original document.",
              )}
            </p>
          )}

          <div className="author-chapter-list">
            {chapters.map((chapter, index) => (
              <fieldset className="author-chapter-card" key={chapter.id}>
                <legend>
                  {label("Chương", "Chapter")} {index + 1}
                </legend>

                <div className="author-chapter-actions">
                  <button
                    type="button"
                    className="reader-button reader-button-secondary"
                    disabled={index === 0}
                    aria-label={label(
                      `Đưa chương ${index + 1} lên`,
                      `Move chapter ${index + 1} up`,
                    )}
                    onClick={() =>
                      setChapters((current) =>
                        moveManuscriptChapter(current, chapter.id, -1),
                      )
                    }
                  >
                    ↑ {label("Lên", "Up")}
                  </button>

                  <button
                    type="button"
                    className="reader-button reader-button-secondary"
                    disabled={index === chapters.length - 1}
                    aria-label={label(
                      `Đưa chương ${index + 1} xuống`,
                      `Move chapter ${index + 1} down`,
                    )}
                    onClick={() =>
                      setChapters((current) =>
                        moveManuscriptChapter(current, chapter.id, 1),
                      )
                    }
                  >
                    ↓ {label("Xuống", "Down")}
                  </button>

                  <button
                    type="button"
                    className="reader-button reader-button-secondary"
                    aria-label={label(
                      `Xóa chương ${index + 1}`,
                      `Delete chapter ${index + 1}`,
                    )}
                    onClick={() => removeChapter(chapter.id)}
                  >
                    {label("Xóa chương", "Delete chapter")}
                  </button>
                </div>

                <label className="reader-field">
                  <span>{label("Tên chương", "Chapter title")}</span>
                  <input
                    value={chapter.title}
                    maxLength={CHAPTER_LIMITS.title}
                    onChange={(event) =>
                      changeChapter(chapter.id, "title", event.target.value)
                    }
                  />
                </label>

                <label className="reader-field">
                  <span>{label("Nội dung chương", "Chapter text")}</span>
                  <textarea
                    rows={10}
                    value={chapter.content}
                    maxLength={CHAPTER_LIMITS.content}
                    onChange={(event) =>
                      changeChapter(chapter.id, "content", event.target.value)
                    }
                  />
                </label>

                <small className="reader-muted">
                  {chapter.content.length.toLocaleString()} /{" "}
                  {CHAPTER_LIMITS.content.toLocaleString()}{" "}
                  {label("ký tự", "characters")}
                </small>
              </fieldset>
            ))}
          </div>

          {deleted && (
            <div className="author-undo" role="status">
              <span>
                {label("Đã xóa một chương.", "A chapter was deleted.")}
              </span>

              <button
                type="button"
                className="reader-link"
                disabled={chapters.length >= CHAPTER_LIMITS.count}
                onClick={undoDelete}
              >
                {label("Hoàn tác", "Undo")}
              </button>
            </div>
          )}
        </section>

        <p className="reader-muted">
          {label(
            "Có thể lưu chương chưa viết xong dưới dạng bản nháp. Trước khi gửi duyệt, các chương cần đủ tên và nội dung.",
            "You can save unfinished chapters as drafts. Complete every chapter title and text before submitting for review.",
          )}
        </p>

        {error && (
          <p className="reader-status" role="alert">
            {authorErrorMessage(error, language)}
          </p>
        )}

        <div className="author-actions">
          <button
            type="button"
            className="reader-button reader-button-secondary"
            onClick={onCancel}
          >
            {label("Hủy", "Cancel")}
          </button>

          <button
            type="button"
            className="reader-button reader-button-secondary"
            onClick={showPreview}
          >
            {label("Xem trước nội dung", "Preview content")}
          </button>

          <button type="submit" className="reader-button">
            {label("Lưu bản thảo", "Save draft")}
          </button>
        </div>
      </form>

      {preview && (
        <ReaderPage
          key={preview.id}
          book={preview}
          user={user}
          preview
          onBack={() => setPreview(null)}
        />
      )}
    </>
  );
}