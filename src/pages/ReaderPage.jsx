import { useState } from "react";
import useStoredState from "../hooks/useStoredState";
import { useUiSettings } from "../ui/settings";
import { readerMessages } from "../ui/readerMessages";
import "./ReaderPage.css";

function getPdfUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value, window.location.href);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    url.hash = "";

    return url.href;
  } catch {
    return "";
  }
}

function validPage(value, pageCount) {
  const page = Number(value);

  return (
    Number.isInteger(page) && page >= 1 && (!pageCount || page <= pageCount)
  );
}

export default function ReaderPage({ book, user, onBack }) {
  const { language } = useUiSettings();
  const copy = readerMessages[language];

  const pdfUrl = getPdfUrl(book.pdfUrl);

  const pageCount =
    Number.isInteger(book.pageCount) && book.pageCount > 0
      ? book.pageCount
      : null;

  const storageKey =
    "cloudlibrary:reading:" +
    encodeURIComponent(user.email.toLowerCase()) +
    ":" +
    encodeURIComponent(book.id) +
    ":v1";

  const [bookmark, setBookmark] = useStoredState(storageKey, {
    page: 1,
    updatedAt: null,
  });

  const savedPage = validPage(bookmark.page, pageCount)
    ? Number(bookmark.page)
    : 1;

  const [pageInput, setPageInput] = useState(String(savedPage));

  const [viewer, setViewer] = useState({
    page: savedPage,
    revision: 0,
  });

  const [message, setMessage] = useState("");

  function openAndSave(event) {
    event.preventDefault();

    if (!validPage(pageInput, pageCount)) {
      setMessage("invalidPage");
      return;
    }

    const page = Number(pageInput);

    setBookmark({
      page,
      updatedAt: new Date().toISOString(),
    });

    setViewer((current) => ({
      page,
      revision: current.revision + 1,
    }));

    setMessage("saved");
  }

  function clearBookmark() {
    setBookmark({
      page: 1,
      updatedAt: null,
    });

    setPageInput("1");

    setViewer((current) => ({
      page: 1,
      revision: current.revision + 1,
    }));

    setMessage("cleared");
  }

  if (!pdfUrl) {
    return (
      <section className="online-reader">
        <h2>{book.title}</h2>

        <p>{copy.missing}</p>

        <button type="button" className="online-reader-button" onClick={onBack}>
          {copy.back}
        </button>
      </section>
    );
  }

  const viewerUrl = pdfUrl + "#page=" + viewer.page;

  return (
    <section className="online-reader" aria-label={copy.title}>
      <div className="online-reader-heading">
        <div className="online-reader-book">
          <h2>{book.title}</h2>

          <p>
            {book.author}
            {pageCount ? " · " + pageCount + " " + copy.pages : ""}
          </p>
        </div>

        <div className="online-reader-actions">
          <button
            className="online-reader-button"
            type="button"
            onClick={onBack}
          >
            {copy.back}
          </button>

          <a
            className="online-reader-button"
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.open}
          </a>
        </div>
      </div>

      <div className="online-reader-tools">
        <form className="online-reader-form" onSubmit={openAndSave}>
          <label className="online-reader-field">
            <span>{copy.page}</span>

            <input
              type="number"
              min={1}
              max={pageCount || undefined}
              step={1}
              value={pageInput}
              onChange={(event) => {
                setPageInput(event.target.value);
                setMessage("");
              }}
              required
            />
          </label>

          <button className="online-reader-button is-primary" type="submit">
            {copy.save}
          </button>

          <button
            className="online-reader-button"
            type="button"
            onClick={clearBookmark}
            disabled={!bookmark.updatedAt}
          >
            {copy.clear}
          </button>
        </form>

        <p className="online-reader-bookmark">
          {bookmark.updatedAt
            ? copy.savedPage + " " + savedPage
            : copy.noBookmark}
        </p>

        <p className="online-reader-hint">{copy.hint}</p>

        <p className="online-reader-status" role="status">
          {message ? copy[message] : ""}
        </p>
      </div>

      <div className="online-reader-frame">
        <iframe
          key={viewer.revision}
          src={viewerUrl}
          title={copy.title + ": " + book.title}
        />
      </div>

      <p className="online-reader-hint">{copy.fallback}</p>
    </section>
  );
}
