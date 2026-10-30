import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  FileText,
  Heart,
  MessageSquare,
  PanelLeft,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { BookCover, BookDetails } from "../components/books/HomeSections";
import FavoriteButton from "../components/books/FavoriteButton";
import useStoredState from "../hooks/useStoredState";
import { useUiSettings } from "../ui/settings";
import "./AssistantPage.css";

const words = {
  vi: {
    title: "Trợ lý thư viện",
    history: "Hội thoại",
    newChat: "Cuộc trò chuyện mới",
    emptyHistory: "Chưa có cuộc trò chuyện nào.",
    saved: "Lưu 20 hội thoại gần nhất trên trình duyệt này.",
    welcome: "Hôm nay bạn muốn khám phá điều gì?",
    intro: "Tìm sách hợp gu, kiểm tra sách còn sẵn hoặc tìm bản đọc online.",
    placeholder: "Nhắn tin với trợ lý thư viện…",
    send: "Gửi tin nhắn",
    stop: "Dừng trả lời",
    hint: "Enter để gửi · Shift + Enter để xuống dòng",
    demo: "Demo danh mục",
    live: "Trợ lý AI",
    demoNote: "Đang tra cứu dữ liệu sách mẫu, chưa kết nối mô hình AI.",
    liveNote:
      "Câu trả lời AI có thể có sai sót. Kiểm tra lại thông tin quan trọng.",
    toggleHistory: "Mở hoặc đóng lịch sử",
    closeHistory: "Đóng lịch sử",
    deleteChat: "Xóa hội thoại này",
    you: "Bạn",
    assistant: "Trợ lý",
    thinking: "Đang trả lời…",
    copy: "Sao chép câu trả lời",
    copied: "Đã sao chép.",
    copyFailed: "Chưa sao chép được. Bạn có thể chọn văn bản để sao chép.",
    details: "Xem chi tiết",
    available: "Còn sách",
    unavailable: "Hết sách",
    error: "Chưa nhận được câu trả lời. Bạn thử gửi lại tin nhắn nhé.",
    prompts: [
      "Gợi ý sách giúp xây dựng thói quen",
      "Tìm sách về tình yêu",
      "Có sách nào đang còn sẵn?",
      "Mình muốn đọc sách online",
    ],
    greeting:
      "Chào bạn! Mình có thể tìm sách trong danh mục, kiểm tra tình trạng sách và tìm tài liệu đọc online. Bạn muốn bắt đầu với chủ đề nào?",
    policy:
      "Danh mục hiện chưa có dữ liệu chính thức về hạn mượn, gia hạn hoặc phí phạt. Bạn liên hệ thủ thư để xác nhận nhé. Để gửi yêu cầu mượn, mở chi tiết một cuốn còn sách và chọn “Mượn sách”.",
    suggestions:
      "Mình tìm thấy những cuốn này trong danh mục. Bạn có thể mở chi tiết hoặc lưu vào yêu thích ngay bên dưới.",
    online:
      "Đây là tài liệu đang có bản đọc online. Mở chi tiết rồi chọn “Đọc online” để bắt đầu.",
    availableReply: "Những cuốn dưới đây hiện còn bản để gửi yêu cầu mượn.",
    noBooks:
      "Chưa có sách phù hợp trong danh mục hiện tại. Bạn thử đổi chủ đề hoặc bỏ điều kiện còn sách/đọc online nhé.",
    noOnline:
      "Những cuốn vừa gợi ý chưa có bản đọc online trong dữ liệu hiện tại. Bạn có thể hỏi “Tìm tất cả tài liệu đọc online” để xem các tài liệu khác.",
    limited:
      "Mình có thể hỗ trợ tra cứu sách trong thư viện. Bạn hãy cho mình biết tên sách, tác giả hoặc chủ đề muốn tìm nhé.",
  },

  en: {
    title: "Library assistant",
    history: "Conversations",
    newChat: "New conversation",
    emptyHistory: "No conversations yet.",
    saved: "The latest 20 conversations are saved in this browser.",
    welcome: "What would you like to explore today?",
    intro:
      "Find your next read, check availability or discover online editions.",
    placeholder: "Message the library assistant…",
    send: "Send message",
    stop: "Stop response",
    hint: "Enter to send · Shift + Enter for a new line",
    demo: "Catalog demo",
    live: "AI assistant",
    demoNote: "Searching sample book data. No AI model is connected yet.",
    liveNote: "AI responses may contain mistakes. Check important information.",
    toggleHistory: "Toggle conversation history",
    closeHistory: "Close history",
    deleteChat: "Delete this conversation",
    you: "You",
    assistant: "Assistant",
    thinking: "Responding…",
    copy: "Copy response",
    copied: "Copied.",
    copyFailed: "Could not copy. You can select the text and copy it manually.",
    details: "View details",
    available: "Available",
    unavailable: "Out of stock",
    error: "Could not get a response. Please send your message again.",
    prompts: [
      "Suggest books about building habits",
      "Find books about love",
      "Which books are available?",
      "I want to read online",
    ],
    greeting:
      "Hi! I can search the catalog, check availability and find online editions. What topic would you like to explore?",
    policy:
      "The catalog does not include official loan periods, renewal rules or fines. Please check with a librarian. To submit a borrowing request, open an available book and choose “Borrow book”.",
    suggestions:
      "I found these books in the catalog. Open their details or save them to your favorites below.",
    online:
      "These documents have online editions. Open the details and select “Read online” to start.",
    availableReply:
      "These books currently have copies available for a borrowing request.",
    noBooks:
      "No books match in the current catalog. Try a different topic or remove the availability/online condition.",
    noOnline:
      "The books just suggested do not have online editions in the current data. Ask “Find all online documents” to explore other documents.",
    limited:
      "I can help you search the library catalog. Tell me a book title, author or topic you would like to find.",
  },
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

function isConversation(item) {
  return (
    item &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    Array.isArray(item.messages) &&
    item.messages.every(
      (message) =>
        message &&
        typeof message.id === "string" &&
        typeof message.text === "string" &&
        ["user", "assistant"].includes(message.role),
    )
  );
}

function demoReply(question, history, books, language) {
  const copy = words[language];
  const query = normalize(question);

  const last = [...history]
    .reverse()
    .find((message) => message.role === "assistant" && message.bookIds?.length);

  const previousIds = Array.isArray(last?.bookIds) ? last.bookIds : [];

  const online = /\bonline\b|truc tuyen|\bpdf\b|\bebook\b|digital/.test(query);

  const available = /con (sach|san|ban|khong)|sach con|available|in stock/.test(
    query,
  );

  const other =
    /cuon khac|sach khac|goi y khac|other books|something else|different books/.test(
      query,
    );

  const referBack =
    /cuon (do|nay)|nhung (cuon|sach) (do|nay)|those|these|\bthem\b/.test(
      query,
    ) ||
    (available && previousIds.length > 0 && query.split(/\s+/).length < 12);

  if (/^(xin chao|chao|hello|hi|hey)[!,.\s]*$/.test(query)) {
    return { text: copy.greeting };
  }

  if (
    /quy dinh|noi quy|phi phat|tre han|han muon|gia han|how (do|can) i borrow|cach muon|thu tuc muon|\bfines?\b|renew|loan period|policy/.test(
      query,
    )
  ) {
    return { text: copy.policy };
  }

  const stopWords = new Set(
    "toi minh ban sach cuon nhung nao muon doc ve cho giup hay tim goi y the a an i me my you want would like book books read find suggest recommend about please some any which are is in can these those co con san dang gi cai nay do khac online pdf all tat ca".split(
      " ",
    ),
  );

  const tokens = normalize(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));

  let candidates = books.filter(
    (book) =>
      (!online || Boolean(book.pdfUrl?.trim())) &&
      (!available || book.availableCopies > 0),
  );

  if (referBack && previousIds.length && !other) {
    candidates = candidates.filter((book) => previousIds.includes(book.id));
  }

  if (other) {
    candidates = candidates.filter((book) => !previousIds.includes(book.id));
  }

  const ranked = candidates
    .map((book) => {
      const text = normalize(
        `${book.title} ${book.author} ${book.category} ${
          book.description || ""
        } ${book.category === "Tiểu thuyết" ? "fiction novel" : ""} ${
          book.category === "Thiếu nhi" ? "children kids" : ""
        } ${
          book.category === "Kỹ năng sống" ? "personal development habits" : ""
        }`,
      );

      return {
        book,
        score: tokens.reduce(
          (score, token) => score + (text.includes(token) ? 1 : 0),
          0,
        ),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.book.title.localeCompare(b.book.title, language),
    );

  const matches = ranked.filter(
    (item) => item.score >= Math.max(1, Math.ceil(tokens.length / 2)),
  );

  const general = /goi y|de xuat|tim sach|recommend|suggest|find.*book/.test(
    query,
  );

  const rows = (
    matches.length
      ? matches
      : online || available || other || referBack || (general && !tokens.length)
        ? ranked
        : []
  ).slice(0, 3);

  if (!rows.length) {
    return {
      text:
        online && referBack
          ? copy.noOnline
          : online || available || other || general
            ? copy.noBooks
            : copy.limited,
    };
  }

  return {
    text: online
      ? copy.online
      : available
        ? copy.availableReply
        : copy.suggestions,
    bookIds: rows.map((item) => item.book.id),
  };
}

export default function AssistantPage({
  books = [],
  favoriteIds = [],
  onToggleFavorite,
  user,
  onSendMessage,
}) {
  const { language } = useUiSettings();
  const copy = words[language];

  const storageKey = `cloudlibrary:chat:${encodeURIComponent(
    user?.email?.trim().toLowerCase() || "guest",
  )}:v1`;

  const [savedChats, setSavedChats] = useStoredState(storageKey, []);
  const chats = savedChats.filter(isConversation);

  const [activeId, setActiveId] = useState(() => chats[0]?.id || null);
  const [historyOpen, setHistoryOpen] = useState(
    () => window.matchMedia("(min-width: 1001px)").matches,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages || [];
  const connected = typeof onSendMessage === "function";

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const input = inputRef.current;

    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }
  }, [draft]);

  useEffect(() => {
    const feed = feedRef.current;

    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [activeId, messages.length, sending]);

  function stop() {
    requestRef.current?.abort();
    requestRef.current = null;
    setSending(false);
  }

  function newChat() {
    stop();
    setActiveId(null);
    setDraft("");
    setNotice("");

    if (window.matchMedia("(max-width: 1000px)").matches) {
      setHistoryOpen(false);
    }

    inputRef.current?.focus();
  }

  function selectChat(id) {
    stop();
    setActiveId(id);
    setDraft("");
    setNotice("");

    if (window.matchMedia("(max-width: 1000px)").matches) {
      setHistoryOpen(false);
    }
  }

  function appendMessage(id, title, message) {
    setSavedChats((current) => {
      const valid = current.filter(isConversation);
      const previous = valid.find((chat) => chat.id === id);

      return [
        {
          id,
          title: previous?.title || title,
          messages: [...(previous?.messages || []), message],
        },
        ...valid.filter((chat) => chat.id !== id),
      ].slice(0, 20);
    });
  }

  async function send(text = draft) {
    const value = text.trim();

    if (!value || sending || value.length > 2000) {
      return;
    }

    const id = activeId || crypto.randomUUID();
    const title = value.slice(0, 50);
    const entry = {
      id: crypto.randomUUID(),
      role: "user",
      text: value,
    };

    const controller = new AbortController();
    requestRef.current = controller;

    appendMessage(id, title, entry);
    setActiveId(id);
    setDraft("");
    setSending(true);
    setNotice("");
    setCopiedId(null);

    try {
      const answer = connected
        ? await onSendMessage({
            messages: [...messages, entry].map(({ role, text }) => ({
              role,
              content: text,
            })),
            language,
            signal: controller.signal,
          })
        : demoReply(value, messages, books, language);

      if (controller.signal.aborted) {
        return;
      }

      if (!answer || typeof answer.text !== "string" || !answer.text.trim()) {
        throw new Error("Empty response");
      }

      appendMessage(id, title, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: answer.text,
        bookIds: Array.isArray(answer.bookIds)
          ? answer.bookIds.filter((bookId) =>
              books.some((book) => book.id === bookId),
            )
          : [],
      });
    } catch {
      if (!controller.signal.aborted) {
        appendMessage(id, title, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: copy.error,
          isError: true,
        });
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setSending(false);
      }
    }
  }

  function deleteChat() {
    if (!activeId) {
      return;
    }

    stop();
    setSavedChats((current) => current.filter((chat) => chat?.id !== activeId));
    setActiveId(null);
    setDraft("");
    setNotice("");
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      setNotice(copy.copied);
    } catch {
      setNotice(copy.copyFailed);
    }
  }

  return (
    <section
      className={`assistant-page ${historyOpen ? "has-history" : ""}`}
      aria-label={copy.title}
    >
      {historyOpen && (
        <>
          <button
            type="button"
            className="assistant-history-backdrop"
            aria-label={copy.closeHistory}
            onClick={() => setHistoryOpen(false)}
          />

          <aside className="assistant-history" aria-label={copy.history}>
            <div className="assistant-history-heading">
              <strong>{copy.history}</strong>

              <button
                type="button"
                className="assistant-icon-button"
                aria-label={copy.closeHistory}
                onClick={() => setHistoryOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              className="assistant-new-chat"
              onClick={newChat}
            >
              <Plus size={18} />
              {copy.newChat}
            </button>

            <div className="assistant-thread-list">
              {chats.length === 0 ? (
                <p className="assistant-history-empty">{copy.emptyHistory}</p>
              ) : (
                chats.map((chat) => (
                  <button
                    type="button"
                    className={`assistant-thread ${
                      activeId === chat.id ? "is-active" : ""
                    }`}
                    key={chat.id}
                    aria-current={activeId === chat.id ? "true" : undefined}
                    onClick={() => selectChat(chat.id)}
                    title={chat.title}
                  >
                    <MessageSquare size={16} />
                    <span>{chat.title}</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      <div className="assistant-main">
        <div className="assistant-toolbar">
          <div className="assistant-toolbar-title">
            <button
              type="button"
              className="assistant-icon-button"
              aria-label={copy.toggleHistory}
              onClick={() => setHistoryOpen((current) => !current)}
            >
              <PanelLeft size={19} />
            </button>

            <Sparkles size={19} />
            <strong>{copy.title}</strong>
          </div>

          <div className="assistant-toolbar-actions">
            <button
              type="button"
              className="assistant-icon-button"
              aria-label={copy.newChat}
              title={copy.newChat}
              onClick={newChat}
            >
              <Plus size={20} />
            </button>

            <button
              type="button"
              className="assistant-icon-button"
              aria-label={copy.deleteChat}
              title={copy.deleteChat}
              disabled={!activeChat}
              onClick={deleteChat}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>

        <div
          className="assistant-feed"
          ref={feedRef}
          role="log"
          aria-label={copy.history}
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length === 0 ? (
            <div className="assistant-welcome">
              <div className="assistant-welcome-mark">
                <Sparkles size={30} />
              </div>

              <h2>{copy.welcome}</h2>
              <p>{copy.intro}</p>

              <div className="assistant-prompts">
                {copy.prompts.map((prompt, index) => {
                  const Icon = [BookOpen, Heart, MessageSquare, FileText][
                    index
                  ];

                  return (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => send(prompt)}
                    >
                      <Icon size={20} />
                      <span>{prompt}</span>
                      <Send size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article
                className={`assistant-message is-${message.role} ${
                  message.isError ? "is-error" : ""
                }`}
                key={message.id}
              >
                <span className="assistant-message-avatar" aria-hidden="true">
                  {message.role === "assistant" ? (
                    <Sparkles size={18} />
                  ) : (
                    (user?.fullName?.trim()[0] || "U").toUpperCase()
                  )}
                </span>

                <div className="assistant-message-content">
                  <strong className="assistant-message-name">
                    {message.role === "assistant" ? copy.assistant : copy.you}
                  </strong>

                  <p className="assistant-message-text">{message.text}</p>

                  {message.role === "assistant" && (
                    <>
                      {Array.isArray(message.bookIds) &&
                        message.bookIds.length > 0 && (
                          <div className="assistant-book-list">
                            {message.bookIds.map((bookId) => {
                              const book = books.find(
                                (item) => item.id === bookId,
                              );

                              return book ? (
                                <article
                                  className="assistant-book"
                                  key={book.id}
                                >
                                  <button
                                    type="button"
                                    className="assistant-book-open"
                                    aria-label={`${copy.details}: ${book.title}`}
                                    onClick={() => setSelectedBook(book)}
                                  >
                                    <span className="assistant-book-cover">
                                      <BookCover book={book} />
                                    </span>

                                    <span className="assistant-book-info">
                                      <strong>{book.title}</strong>
                                      <span>{book.author}</span>

                                      <small>
                                        {book.availableCopies > 0
                                          ? copy.available
                                          : copy.unavailable}
                                      </small>

                                      <span className="assistant-book-link">
                                        {copy.details} →
                                      </span>
                                    </span>
                                  </button>

                                  {onToggleFavorite && (
                                    <FavoriteButton
                                      book={book}
                                      isFavorite={favoriteIds.includes(book.id)}
                                      onToggleFavorite={onToggleFavorite}
                                      className="assistant-book-favorite"
                                    />
                                  )}
                                </article>
                              ) : null;
                            })}
                          </div>
                        )}

                      <button
                        type="button"
                        className="assistant-copy"
                        aria-label={copy.copy}
                        onClick={() => copyMessage(message)}
                      >
                        {copiedId === message.id ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}

                        {copiedId === message.id ? copy.copied : copy.copy}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}

          {sending && (
            <div className="assistant-typing" role="status">
              <Sparkles size={17} />
              <span>{copy.thinking}</span>
              <i />
              <i />
              <i />
            </div>
          )}
        </div>

        <form
          className="assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <div className="assistant-input-box">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              maxLength={2000}
            />

            {sending ? (
              <button
                type="button"
                className="assistant-send"
                onClick={stop}
                aria-label={copy.stop}
              >
                <Square size={17} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="assistant-send"
                disabled={!draft.trim()}
                aria-label={copy.send}
              >
                <Send size={19} />
              </button>
            )}
          </div>

          <div className="assistant-composer-meta">
            <small>{copy.hint}</small>
            <small>{draft.length}/2000</small>
          </div>

          <p className="assistant-notice" role="status">
            {notice}
          </p>
        </form>
      </div>

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </section>
  );
}
