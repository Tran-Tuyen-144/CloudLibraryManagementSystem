import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import useBookView from "../hooks/useBookView";
import {
  clampReaderNumber,
  normalizeReaderBookmark,
  normalizeReaderSettings,
  pdfTextParagraphs,
  readerChapters,
  readerPdfUrl,
  readerStorageKey,
  readerUnitKey,
} from "../data/readerContent";
import { useUiSettings } from "../ui/settings";
import { readerMessages } from "../ui/readerMessages";
import { ReaderFlow, SwipeReader } from "./ReaderNavigation";
import "./ReaderPage.css";

function useReaderRecord(key, persistent = true) {
  const [record, setRecord] = useState(() => {
    if (!persistent) return {};

    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");

      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  });

  const current = useRef(record);

  const update = useCallback(
    (change) => {
      const next =
        typeof change === "function"
          ? change(current.current)
          : change;

      if (next === current.current) return true;

      current.current = next;
      setRecord(next);

      if (!persistent) return true;

      try {
        localStorage.setItem(key, JSON.stringify(next));
        return true;
      } catch {
        return false;
      }
    },
    [key, persistent],
  );

  return [record, update];
}

function usePdfDocument(url, attempt) {
  const [state, setState] = useState(null);
  const key = `${url}:${attempt}`;

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    let task;

    import("../ui/pdfReader")
      .then(({ openPdf }) => {
        if (cancelled) return null;

        task = openPdf(url);

        return task.promise;
      })
      .then((doc) => {
        if (!cancelled && doc) {
          setState({ key, doc, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            key,
            doc: null,
            error:
              error.name === "PasswordException"
                ? "passwordFailed"
                : "pdfFailed",
          });
        }
      });

    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [url, key]);

  return state?.key === key ? state : { doc: null, error: "" };
}

function PdfCanvas({
  doc,
  page,
  zoom,
  copy,
  onReady,
  inline = false,
}) {
  const readyPage = useEffectEvent(onReady);

  const host = useRef(null);
  const mount = useRef(null);

  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState(null);

  const key = `${doc.fingerprints[0]}:${page}:${zoom}:${width}`;

  useEffect(() => {
    const element = host.current;

    const measure = () =>
      setWidth(Math.max(100, element.clientWidth - 24));

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    const frame = requestAnimationFrame(measure);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!width) return;

    let cancelled = false;
    let task;

    const target = mount.current;

    target.replaceChildren();

    doc
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });

        const scale =
          zoom === "fit"
            ? Math.min(3, width / base.width)
            : zoom;

        const viewport = pdfPage.getViewport({ scale });

        const resolution = Math.min(
          2,
          window.devicePixelRatio || 1,
          8192 / Math.max(viewport.width, viewport.height),
          Math.sqrt(16000000 / (viewport.width * viewport.height)),
        );

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(
          1,
          Math.floor(viewport.width * resolution),
        );

        canvas.height = Math.max(
          1,
          Math.floor(viewport.height * resolution),
        );

        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${copy.page} ${page}`);

        task = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d"),
          viewport,
          transform: [resolution, 0, 0, resolution, 0, 0],
        });

        await task.promise;

        if (cancelled) return;

        target.replaceChildren(canvas);
        setStatus({ key, error: false });
        readyPage(page);
      })
      .catch((error) => {
        if (
          !cancelled &&
          error.name !== "RenderingCancelledException"
        ) {
          setStatus({ key, error: true });
        }
      });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, width, key, copy.page]);

  const ready = status?.key === key;

  return (
    <div
      ref={host}
      className={`online-reader-pdf ${inline ? "is-inline" : ""}`}
      aria-busy={!ready}
    >
      {!ready && (
        <p className="online-reader-state" role="status">
          {copy.rendering}
        </p>
      )}

      {ready && status.error && (
        <p className="online-reader-state" role="alert">
          {copy.pdfFailed}
        </p>
      )}

      <div ref={mount} className="online-reader-canvas" />
    </div>
  );
}

function TextPage({
  paragraphs,
  heading,
  unit,
  ratio,
  settings,
  copy,
  extracted,
  onSave,
  inline = false,
  onReady,
}) {
  const host = useRef(null);

  const initialRatio = useEffectEvent(() => ratio);

  const save = useEffectEvent((key, value, force) =>
    onSave(key, value, force),
  );

  const readyText = useEffectEvent(() => onReady?.());

  const layout =
    `${settings.font}:${settings.fontSize}:` +
    `${settings.lineHeight}:${settings.width}`;

  useEffect(() => {
    if (inline) {
      const frame = requestAnimationFrame(() => readyText());

      return () => cancelAnimationFrame(frame);
    }

    const element = host.current;

    let restoring = true;
    let dirty = false;
    let timer;
    let secondFrame;

    const progress = () => {
      const distance =
        element.scrollHeight - element.clientHeight;

      return distance > 0
        ? element.scrollTop / distance
        : 0;
    };

    const flush = () => {
      if (dirty) {
        save(unit, progress());
        dirty = false;
      }
    };

    const scroll = () => {
      if (restoring) return;

      dirty = true;

      clearTimeout(timer);
      timer = setTimeout(flush, 500);
    };

    const frame = requestAnimationFrame(() => {
      element.scrollTop =
        initialRatio() *
        Math.max(
          0,
          element.scrollHeight - element.clientHeight,
        );

      secondFrame = requestAnimationFrame(() => {
        restoring = false;
        save(unit, progress(), true);
      });
    });

    const visibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    element.addEventListener("scroll", scroll, {
      passive: true,
    });

    window.addEventListener("pagehide", flush);

    document.addEventListener(
      "visibilitychange",
      visibility,
    );

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);

      element.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", flush);

      document.removeEventListener(
        "visibilitychange",
        visibility,
      );

      flush();
    };
  }, [unit, layout, inline]);

  return (
    <div
      ref={host}
      className={`online-reader-text ${inline ? "is-inline" : ""}`}
      data-page-theme={settings.pageTheme}
      tabIndex={0}
      aria-label={heading}
      style={{
        "--reading-size": `${settings.fontSize}px`,
        "--reading-leading": settings.lineHeight,
        "--reading-font": {
          serif: 'Georgia, "Times New Roman", serif',
          sans: '"Segoe UI", Arial, sans-serif',
          mono: "Consolas, monospace",
        }[settings.font],
        "--reading-width":
          settings.width === "wide" ? "900px" : "680px",
      }}
    >
      <article>
        <h3>{heading}</h3>

        {extracted && (
          <p className="online-reader-source">
            {copy.textFromPdf}
          </p>
        )}

        {paragraphs.length ? (
          paragraphs.map((text, index) => (
            <p key={index}>{text}</p>
          ))
        ) : (
          <p>{copy.noText}</p>
        )}
      </article>
    </div>
  );
}

function PdfText({ doc, page, ...props }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;

    doc
      .getPage(page)
      .then((pdfPage) => pdfPage.getTextContent())
      .then((content) => {
        if (!cancelled) {
          setState({
            page,
            paragraphs: pdfTextParagraphs(content.items),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ page, error: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [doc, page]);

  if (state?.page !== page) {
    return (
      <p className="online-reader-state" role="status">
        {props.copy.rendering}
      </p>
    );
  }

  if (state.error) {
    return (
      <p className="online-reader-state" role="alert">
        {props.copy.pdfFailed}
      </p>
    );
  }

  return (
    <TextPage
      {...props}
      paragraphs={state.paragraphs}
      extracted
    />
  );
}

function FlowContent({
  number,
  onReady,
  chapterMode,
  chapters,
  mode,
  doc,
  zoom,
  settings,
  copy,
  total,
}) {
  if (chapterMode) {
    const chapter = chapters[number - 1];

    return (
      <TextPage
        inline
        onReady={onReady}
        paragraphs={chapter.content
          .split(/\n\s*\n/)
          .filter(Boolean)}
        heading={
          chapter.title || `${copy.chapter} ${number}`
        }
        unit={`text:chapter:${chapter.id}`}
        settings={settings}
        copy={copy}
      />
    );
  }

  if (mode === "pdf") {
    return (
      <>
        <p className="online-reader-flow-label">
          {copy.page} {number} / {total}
        </p>

        <PdfCanvas
          inline
          doc={doc}
          page={number}
          zoom={zoom}
          copy={copy}
          onReady={onReady}
        />
      </>
    );
  }

  return (
    <PdfText
      inline
      onReady={onReady}
      doc={doc}
      page={number}
      heading={`${copy.page} ${number}`}
      unit={`text:page:${number}`}
      settings={settings}
      copy={copy}
    />
  );
}

export default function ReaderPage({
  book,
  user,
  onBack,
  preview = false,
}) {
  const { language, theme } = useUiSettings();

  const copy = {
    backToEditor:
      language === "en"
        ? "Back to manuscript"
        : "Quay lại bản thảo",
    previewNotice:
      language === "en"
        ? "Content preview. Views and reading bookmarks are not recorded."
        : "Đang xem trước nội dung. Lượt xem và mốc đọc không được ghi nhận.",
    ...readerMessages[language],
  };

  const settingsId = useId();

  const chapters = useMemo(
    () => readerChapters({ chapters: book.chapters }),
    [book.chapters],
  );

  const pdfUrl = readerPdfUrl(book.pdfUrl);

  useBookView(
    book.id,
    !preview && Boolean(pdfUrl || chapters.length),
  );

  const [stored, write] = useReaderRecord(
    readerStorageKey(user.email, book.id),
    !preview,
  );

  const [storedSettings, writeSettings] = useReaderRecord(
    `cloudlibrary:reader-settings:${encodeURIComponent(
      user.email.toLowerCase(),
    )}:v1`,
  );

  const bookmark = normalizeReaderBookmark(
    stored,
    chapters,
    Boolean(pdfUrl),
  );

  const settings = normalizeReaderSettings(
    storedSettings,
    theme,
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoom, setZoom] = useState("fit");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [jump, setJump] = useState(null);

  const bookmarkPaused = useRef(false);

  const pdf = usePdfDocument(pdfUrl, attempt);

  const chapterMode =
    bookmark.mode === "text" && chapters.length > 0;

  const total = chapterMode
    ? chapters.length
    : pdf.doc?.numPages || 0;

  const page = pdf.doc
    ? Math.min(bookmark.page, pdf.doc.numPages)
    : bookmark.page;

  const chapterIndex = chapters.findIndex(
    (chapter) => chapter.id === bookmark.chapterId,
  );

  const chapter = chapters[chapterIndex];

  const position = chapterMode
    ? chapterIndex + 1
    : page;

  const unit = readerUnitKey(
    { ...bookmark, page },
    chapters.length > 0,
  );

  const unitLabel = chapterMode
    ? copy.chapter
    : copy.page;

  const persist = useCallback(
    (change) => {
      const ok = write(change);

      if (!ok) {
        setNotice("storageFailed");
      }

      return ok;
    },
    [write, setNotice],
  );

  const pageReady = useCallback(
    (number) => {
      if (bookmarkPaused.current) return;

      persist((previous) => {
        const current = normalizeReaderBookmark(
          previous,
          chapters,
          Boolean(pdfUrl),
        );

        if (current.mode !== "pdf") {
          return previous;
        }

        return {
          ...current,
          page: number,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [persist, chapters, pdfUrl],
  );

  const saveProgress = useCallback(
    (expected, ratio, force = false) => {
      if (bookmarkPaused.current) return;

      persist((previous) => {
        const current = normalizeReaderBookmark(
          previous,
          chapters,
          Boolean(pdfUrl),
        );

        if (pdf.doc) {
          current.page = Math.min(
            current.page,
            pdf.doc.numPages,
          );
        }

        if (
          readerUnitKey(
            current,
            chapters.length > 0,
          ) !== expected
        ) {
          return previous;
        }

        const progress = clampReaderNumber(
          ratio,
          0,
          1,
          0,
        );

        if (
          !force &&
          current.updatedAt &&
          Math.abs(current.textScroll - progress) < 0.002
        ) {
          return previous;
        }

        return {
          ...current,
          textScroll: progress,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [persist, chapters, pdfUrl, pdf.doc],
  );

  const saveFlow = useCallback(
    (number, ratio) => {
      if (bookmarkPaused.current) return;

      persist((previous) => {
        const current = normalizeReaderBookmark(
          previous,
          chapters,
          Boolean(pdfUrl),
        );

        if (current.mode !== bookmark.mode) {
          return previous;
        }

        const next = chapterMode
          ? {
              chapterId: chapters[number - 1]?.id,
            }
          : {
              page: number,
            };

        const progress = clampReaderNumber(
          ratio,
          0,
          1,
          0,
        );

        if (
          current.updatedAt &&
          (chapterMode
            ? current.chapterId === next.chapterId
            : current.page === next.page) &&
          Math.abs(current.textScroll - progress) < 0.002
        ) {
          return previous;
        }

        return {
          ...current,
          ...next,
          textScroll: progress,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [
      persist,
      chapters,
      pdfUrl,
      bookmark.mode,
      chapterMode,
    ],
  );

  function navigate(number) {
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > total
    ) {
      setNotice("invalidPage");
      return;
    }

    bookmarkPaused.current = false;

    setNotice("");
    setJump({ number });

    persist((previous) => ({
      ...normalizeReaderBookmark(
        previous,
        chapters,
        Boolean(pdfUrl),
      ),
      ...(chapterMode
        ? {
            chapterId: chapters[number - 1].id,
            textScroll: 0,
          }
        : {
            page: number,
            ...(!chapters.length
              ? { textScroll: 0 }
              : {}),
          }),
      updatedAt: new Date().toISOString(),
    }));
  }

  function changeMode(mode) {
    bookmarkPaused.current = false;
    setNotice("");

    persist((previous) => ({
      ...normalizeReaderBookmark(
        previous,
        chapters,
        Boolean(pdfUrl),
      ),
      mode,
    }));
  }

  function changeSetting(name, value) {
    const ok = writeSettings({
      ...settings,
      [name]: value,
    });

    setNotice(ok ? "" : "storageFailed");
  }

  if (!pdfUrl && !chapters.length) {
    return (
      <section className="online-reader">
        <h2>{book.title}</h2>

        <p>{copy.missing}</p>

        <button
          type="button"
          className="online-reader-button"
          onClick={onBack}
        >
          {preview ? copy.backToEditor : copy.back}
        </button>
      </section>
    );
  }

  const chapterTitle =
    chapter?.title ||
    `${copy.chapter} ${chapterIndex + 1}`;

  return (
    <section
      className="online-reader"
      aria-label={copy.title}
    >
      <header className="online-reader-heading">
        <div className="online-reader-book">
          <h2>{book.title}</h2>
          <p>{book.author}</p>
        </div>

        <div className="online-reader-actions">
          <button
            type="button"
            className="online-reader-button"
            onClick={onBack}
          >
            {preview ? copy.backToEditor : copy.back}
          </button>

          {pdfUrl && (
            <a
              className="online-reader-button"
              href={`${pdfUrl}#page=${page}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.open}
            </a>
          )}
        </div>
      </header>

      <div className="online-reader-toolbar">
        <div
          className="online-reader-modes"
          role="group"
          aria-label={copy.title}
        >
          {pdfUrl && (
            <button
              type="button"
              className={`online-reader-button ${
                bookmark.mode === "pdf"
                  ? "is-primary"
                  : ""
              }`}
              aria-pressed={bookmark.mode === "pdf"}
              onClick={() => changeMode("pdf")}
            >
              {copy.pdfMode}
            </button>
          )}

          <button
            type="button"
            className={`online-reader-button ${
              bookmark.mode === "text"
                ? "is-primary"
                : ""
            }`}
            aria-pressed={bookmark.mode === "text"}
            onClick={() => changeMode("text")}
          >
            {copy.textMode}
          </button>
        </div>

        <label className="online-reader-field online-reader-turning">
          <span>{copy.turning}</span>

          <select
            value={settings.turning}
            onChange={(event) =>
              changeSetting(
                "turning",
                event.target.value,
              )
            }
          >
            {["buttons", "swipe", "scroll"].map(
              (value) => (
                <option key={value} value={value}>
                  {copy[value]}
                </option>
              ),
            )}
          </select>
        </label>

        <button
          type="button"
          className="online-reader-button"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={() =>
            setSettingsOpen((open) => !open)
          }
        >
          {copy.settings}
        </button>
      </div>

      {settingsOpen && (
        <section
          id={settingsId}
          className="online-reader-settings"
          aria-label={copy.settingsTitle}
        >
          <p className="online-reader-hint">
            {copy.textSettingsHint}
          </p>

          <div className="online-reader-settings-grid">
            <label className="online-reader-field">
              <span>{copy.font}</span>

              <select
                value={settings.font}
                onChange={(event) =>
                  changeSetting(
                    "font",
                    event.target.value,
                  )
                }
              >
                {["serif", "sans", "mono"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="online-reader-field">
              <span>
                {copy.fontSize}: {settings.fontSize}px
              </span>

              <input
                type="range"
                min={14}
                max={30}
                step={1}
                value={settings.fontSize}
                onChange={(event) =>
                  changeSetting(
                    "fontSize",
                    Number(event.target.value),
                  )
                }
              />
            </label>

            <label className="online-reader-field">
              <span>{copy.lineHeight}</span>

              <select
                value={settings.lineHeight}
                onChange={(event) =>
                  changeSetting(
                    "lineHeight",
                    Number(event.target.value),
                  )
                }
              >
                {[1.4, 1.6, 1.8, 2, 2.2].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="online-reader-field">
              <span>{copy.pageColor}</span>

              <select
                value={settings.pageTheme}
                onChange={(event) =>
                  changeSetting(
                    "pageTheme",
                    event.target.value,
                  )
                }
              >
                {["light", "sepia", "dark"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="online-reader-field">
              <span>{copy.width}</span>

              <select
                value={settings.width}
                onChange={(event) =>
                  changeSetting(
                    "width",
                    event.target.value,
                  )
                }
              >
                {["comfortable", "wide"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ),
                )}
              </select>
            </label>

            <button
              type="button"
              className="online-reader-button"
              onClick={() => {
                const ok = writeSettings(
                  normalizeReaderSettings({}, theme),
                );

                setNotice(
                  ok ? "" : "storageFailed",
                );
              }}
            >
              {copy.reset}
            </button>
          </div>
        </section>
      )}

      <div className="online-reader-save-row">
        <p
          className="online-reader-hint"
          role="status"
        >
          {preview
            ? copy.previewNotice
            : notice
              ? copy[notice]
              : bookmark.updatedAt
                ? `${copy.autoSaved} · ${unitLabel} ${position}`
                : copy.noBookmark}
        </p>

        {!preview && (
          <button
            type="button"
            className="online-reader-clear"
            disabled={!bookmark.updatedAt}
            onClick={() => {
              bookmarkPaused.current = true;

              const ok = persist((previous) => ({
                ...previous,
                updatedAt: null,
              }));

              if (ok) {
                setNotice("cleared");
              } else {
                bookmarkPaused.current = false;
              }
            }}
          >
            {copy.clear}
          </button>
        )}
      </div>

      {settings.turning !== "buttons" && (
        <p className="online-reader-hint">
          {settings.turning === "scroll"
            ? copy.scrollHint
            : copy.swipeHint}
        </p>
      )}

      {settings.turning === "scroll" &&
      total > 0 &&
      (chapterMode || pdf.doc) ? (
        <ReaderFlow
          key={`${bookmark.mode}:${Boolean(chapterMode)}`}
          total={total}
          position={position}
          ratio={bookmark.textScroll}
          jump={jump}
          layout={
            bookmark.mode === "pdf"
              ? String(zoom)
              : `${settings.font}:${settings.fontSize}:${settings.lineHeight}:${settings.width}`
          }
          onSave={saveFlow}
          copy={copy}
          Unit={FlowContent}
          unitProps={{
            chapterMode,
            chapters,
            mode: bookmark.mode,
            doc: pdf.doc,
            zoom,
            settings,
            copy,
            total,
          }}
        />
      ) : (
        <SwipeReader
          enabled={settings.turning === "swipe"}
          label={copy.title}
          onTurn={(direction) => {
            const next = position + direction;

            if (next >= 1 && next <= total) {
              navigate(next);
            }
          }}
        >
          {chapterMode ? (
            <TextPage
              paragraphs={chapter.content
                .split(/\n\s*\n/)
                .filter(Boolean)}
              heading={chapterTitle}
              unit={unit}
              ratio={bookmark.textScroll}
              settings={settings}
              copy={copy}
              onSave={saveProgress}
            />
          ) : pdf.error ? (
            <div className="online-reader-state">
              <p role="alert">
                {copy[pdf.error]}
              </p>

              <button
                type="button"
                className="online-reader-button"
                onClick={() =>
                  setAttempt((value) => value + 1)
                }
              >
                {copy.retry}
              </button>
            </div>
          ) : !pdf.doc ? (
            <p
              className="online-reader-state"
              role="status"
            >
              {copy.loading}
            </p>
          ) : bookmark.mode === "pdf" ? (
            <PdfCanvas
              doc={pdf.doc}
              page={page}
              zoom={zoom}
              copy={copy}
              onReady={pageReady}
            />
          ) : (
            <PdfText
              key={pdfUrl}
              doc={pdf.doc}
              page={page}
              heading={`${copy.page} ${page}`}
              unit={unit}
              ratio={bookmark.textScroll}
              settings={settings}
              copy={copy}
              onSave={saveProgress}
            />
          )}
        </SwipeReader>
      )}

      <nav
        className="online-reader-navigation"
        aria-label={copy.navigation}
      >
        <button
          type="button"
          className="online-reader-button"
          disabled={!total || position <= 1}
          onClick={() => navigate(position - 1)}
        >
          {copy.previous}
        </button>

        <form
          key={unit}
          className="online-reader-jump"
          onSubmit={(event) => {
            event.preventDefault();

            navigate(
              Number(
                new FormData(
                  event.currentTarget,
                ).get("position"),
              ),
            );
          }}
        >
          <label className="online-reader-field">
            <span>{unitLabel}</span>

            <input
              name="position"
              type="number"
              min={1}
              max={total || 1}
              defaultValue={position}
              required
              disabled={!total}
            />
          </label>

          <span>/ {total || "—"}</span>

          <button
            type="submit"
            className="online-reader-button"
            disabled={!total}
          >
            {copy.jump}
          </button>
        </form>

        <button
          type="button"
          className="online-reader-button"
          disabled={!total || position >= total}
          onClick={() => navigate(position + 1)}
        >
          {copy.next}
        </button>

        {chapterMode && (
          <label className="online-reader-field online-reader-chapters">
            <span>{copy.chapter}</span>

            <select
              value={chapter.id}
              onChange={(event) =>
                navigate(
                  chapters.findIndex(
                    (item) =>
                      item.id === event.target.value,
                  ) + 1,
                )
              }
            >
              {chapters.map((item, index) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.title ||
                    `${copy.chapter} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        {bookmark.mode === "pdf" && (
          <div className="online-reader-zoom">
            <button
              type="button"
              className="online-reader-button"
              aria-label={copy.zoomOut}
              disabled={
                !pdf.doc ||
                (zoom !== "fit" && zoom <= 0.5)
              }
              onClick={() =>
                setZoom((value) =>
                  value === "fit"
                    ? 0.75
                    : Math.max(0.5, value - 0.25),
                )
              }
            >
              −
            </button>

            <span>
              {zoom === "fit"
                ? copy.fitWidth
                : `${Math.round(zoom * 100)}%`}
            </span>

            <button
              type="button"
              className="online-reader-button"
              aria-label={copy.zoomIn}
              disabled={
                !pdf.doc ||
                (zoom !== "fit" && zoom >= 2)
              }
              onClick={() =>
                setZoom((value) =>
                  value === "fit"
                    ? 1.25
                    : Math.min(2, value + 0.25),
                )
              }
            >
              +
            </button>

            <button
              type="button"
              className="online-reader-button"
              disabled={!pdf.doc}
              onClick={() => setZoom("fit")}
            >
              {copy.fitWidth}
            </button>
          </div>
        )}
      </nav>

      {bookmark.mode === "pdf" && (
        <p className="online-reader-hint">
          {copy.pdfNote}
        </p>
      )}
    </section>
  );
}