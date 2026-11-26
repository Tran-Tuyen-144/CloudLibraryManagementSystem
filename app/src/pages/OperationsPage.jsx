import { t, getLocale } from "../ui/settings.js";
import { useEffect, useRef, useState } from "react";
import {
  Headphones,
  Mic,
  Square,
  Volume2,
  Search,
  FileText,
} from "lucide-react";
import {
  useLibraryData,
  runLibraryCommand,
  refreshLibrary,
  useConnection,
} from "../ui/libraryStore.js";
import { request, uploadFile } from "../api/runtime.js";
import { flattenRequests, availableBooks } from "../ui/borrowWorkflow.js";
import { currentLibraryUser } from "../data/libraryData.js";
import "./OperationsPage.css";
const statusText = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  borrowed: "Đang mượn",
  returned: "Đã trả",
  waiting: "Đang chờ sách",
  ready: "Sẵn sàng nhận",
  collected: "Đã chuyển sang phiếu mượn",
  cancelled: "Đã hủy",
  expired: "Hết hạn giữ",
  available: "Sẵn sàng",
  reserved: "Chờ bàn giao",
  held: "Giữ cho đặt trước",
  maintenance: "Bảo trì",
  retired: "Ngừng lưu hành",
  transcribing: "Đang nhận dạng",
  answering: "Đang tạo câu trả lời",
  completed: "Hoàn tất",
  failed: "Không thành công",
};
const money = (value) => Number(value || 0).toLocaleString(getLocale()) + " đ";
export default function OperationsPage({ initialTab = "reservations" }) {
  const data = useLibraryData();
  const user = currentLibraryUser(data);
  const { capabilities } = useConnection();
  const staff = ["admin", "librarian"].includes(user?.role);
  const admin = user?.role === "admin";
  const [tab, setTab] = useState(initialTab);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const loans = flattenRequests(data.requestsByEmail);
  const books = availableBooks(data.books, loans);
  const tabs = [
    ["reservations", t("Đặt trước")],
    ["renewals", t("Gia hạn & tiền phạt")],
    ["history", t("Lịch sử đọc")],
    ["audio", t("Nghe & hỏi")],
    ...(staff ? [["copies", t("Bản sách")]] : []),
    ...(admin
      ? [
          ["data-source", "Nguồn dữ liệu"],
          ["knowledge", t("Nguồn AI")],
          ["outbox", t("Hộp thư thử nghiệm")],
        ]
      : []),
  ];
  async function action(command, input) {
    setBusy(true);
    setMessage("");
    try {
      const result = await runLibraryCommand(command, input);
      setMessage(
        result.ok
          ? t("Đã cập nhật.")
          : result.message || t("Chưa cập nhật được."),
      );
      return result;
    } finally {
      setBusy(false);
    }
  }
  const [history, setHistory] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [dataSource, setDataSource] = useState(null);
  useEffect(() => {
    if (tab === "data-source")
      request("/management/data-source")
        .then((r) => setDataSource(r.data))
        .catch((e) => setMessage(e.message));
    if (tab === "history")
      request("/me/history")
        .then((r) => setHistory(r.items))
        .catch((e) => setMessage(e.message));
    if (tab === "outbox")
      request("/management/outbox")
        .then((r) => setOutbox(r.items))
        .catch((e) => setMessage(e.message));
  }, [tab]);
  async function reserve(event) {
    event.preventDefault();
    await action("reservation.create", {
      bookId: new FormData(event.currentTarget).get("bookId"),
    });
  }
  async function saveSource(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    input.approved = input.approved === "on";
    const result = await action("knowledge.save", input);
    if (result.ok) form.reset();
  }
  return (
    <section className="reader-page operations-page">
      <header className="operations-heading">
        <div>
          <h2>
            {tab === "audio"
              ? t("Nghe nội dung và hỏi bằng giọng nói")
              : t("Dịch vụ thư viện")}
          </h2>
          <p>
            {t("Theo dõi yêu cầu và thông tin đã lưu theo tài khoản của bạn.")}
          </p>
        </div>
        <button
          className="reader-button reader-button-secondary"
          onClick={() => refreshLibrary()}
        >
          {" " + t("Làm mới") + " "}
        </button>
      </header>
      <nav className="operations-tabs" aria-label={t("Chức năng thư viện")}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setMessage("");
            }}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      {message && (
        <p className="operations-feedback" role="status">
          {t(message)}
        </p>
      )}
      {tab === "reservations" && (
        <>
          <div className="reader-panel">
            <h3>{t("Đặt sách đang hết bản")}</h3>
            <p>
              {" " +
                t(
                  "Khi có sách, thư viện giữ bản cho người đầu hàng chờ trong",
                )}{" "}
              {data.settings.holdHours || 48}
              {" " + t("giờ.") + " "}
            </p>
            <form className="operations-inline" onSubmit={reserve}>
              <label>
                {" " + t("Chọn tác phẩm") + " "}
                <select name="bookId" required>
                  <option value="">{t("Chọn sách")}</option>
                  {books
                    .filter((b) => b.availableCopies === 0 && !b.archived)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                </select>
              </label>
              <button className="reader-button" disabled={busy}>
                {" " + t("Gửi đặt trước") + " "}
              </button>
            </form>
          </div>
          <div className="reader-panel">
            <h3>{staff ? t("Hàng chờ thư viện") : t("Đặt trước của tôi")}</h3>
            {!data.reservations.length && <p>{t("Chưa có đặt trước.")}</p>}
            <div className="operations-list">
              {data.reservations.map((r) => (
                <article key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <p>
                      {statusText[r.status] || r.status}
                      {r.position ? ` · Vị trí ${r.position}` : ""}
                    </p>
                    {staff && <small>{r.readerEmail}</small>}
                    {r.expiresAt && (
                      <p>
                        {" " + t("Giữ đến") + " "}
                        {new Date(r.expiresAt).toLocaleString(getLocale())}
                      </p>
                    )}
                  </div>
                  <div>
                    {["waiting", "ready"].includes(r.status) && (
                      <button
                        className="reader-button reader-button-secondary"
                        disabled={busy}
                        onClick={() =>
                          action("reservation.cancel", {
                            id: r.id,
                          })
                        }
                      >
                        {" " + t("Hủy đặt trước") + " "}
                      </button>
                    )}
                    {r.status === "ready" && r.readerEmail === user.email && (
                      <button
                        className="reader-button"
                        disabled={busy}
                        onClick={() =>
                          action("loan.create", {
                            bookId: r.bookId,
                            note: t("Nhận sách đặt trước"),
                          })
                        }
                      >
                        {" " + t("Tạo phiếu nhận sách") + " "}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === "renewals" && (
        <div className="reader-panel">
          <h3>
            {staff
              ? t("Xử lý gia hạn và thu phạt")
              : t("Phiếu mượn và gia hạn của tôi")}
          </h3>
          <p>
            {" " + t("Gia hạn tối đa") + " "}
            {data.settings.maxRenewals || 1}
            {" " + t("lần, thêm")} {data.settings.extensionDays || 7}
            {" " + t("ngày; chưa quá hạn và không có người đặt trước.") + " "}
          </p>
          <div className="operations-list">
            {loans
              .filter((l) => ["borrowed", "returned"].includes(l.status))
              .map((l) => (
                <article key={l.id}>
                  <div>
                    <strong>{l.title}</strong>
                    <p>
                      {t(statusText[l.status])}
                      {" " + t("· Hạn") + " "}
                      {l.dueDate}
                      {" " + t("· Đã gia hạn")} {l.renewalCount || 0}
                      {" " + t("lần") + " "}
                    </p>
                    {staff && <small>{l.readerEmail}</small>}
                    {l.renewalStatus && (
                      <p>
                        {" " + t("Gia hạn:")}{" "}
                        {statusText[l.renewalStatus] || l.renewalStatus}
                      </p>
                    )}
                    {l.fineAmount > 0 && (
                      <p>
                        {" " + t("Tiền phạt:") + " "}
                        {money(l.fineAmount)} ·{" "}
                        {l.finePaymentStatus === "paid"
                          ? t("Đã thu")
                          : t("Chưa thu")}
                      </p>
                    )}
                  </div>
                  <div className="operations-actions">
                    {!staff &&
                      l.status === "borrowed" &&
                      l.renewalStatus !== "pending" && (
                        <button
                          className="reader-button"
                          disabled={busy}
                          onClick={() =>
                            action("loan.action", {
                              id: l.id,
                              version: l.version,
                              action: "renew-request",
                            })
                          }
                        >
                          {" " + t("Xin gia hạn") + " "}
                        </button>
                      )}
                    {staff && l.renewalStatus === "pending" && (
                      <>
                        <button
                          className="reader-button"
                          disabled={busy}
                          onClick={() =>
                            action("loan.action", {
                              id: l.id,
                              version: l.version,
                              action: "renew-approve",
                            })
                          }
                        >
                          {" " + t("Duyệt gia hạn") + " "}
                        </button>
                        <button
                          className="reader-button reader-button-secondary"
                          disabled={busy}
                          onClick={() =>
                            action("loan.action", {
                              id: l.id,
                              version: l.version,
                              action: "renew-reject",
                              reason: t(
                                "Không đáp ứng điều kiện gia hạn theo quy định hiện hành.",
                              ),
                            })
                          }
                        >
                          {" " + t("Từ chối gia hạn") + " "}
                        </button>
                      </>
                    )}
                    {staff && l.finePaymentStatus === "unpaid" && (
                      <button
                        className="reader-button"
                        disabled={busy}
                        onClick={() =>
                          action("loan.action", {
                            id: l.id,
                            version: l.version,
                            action: "collect-fine",
                          })
                        }
                      >
                        {" " + t("Xác nhận đã thu") + " "}
                        {money(l.fineAmount)}
                      </button>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </div>
      )}
      {tab === "history" && (
        <div className="reader-panel">
          <h3>{t("Lịch sử mở tác phẩm")}</h3>
          <p>{t("Xóa lịch sử không xóa vị trí đọc hoặc sách yêu thích.")}</p>
          <button
            className="reader-button reader-button-secondary"
            onClick={async () => {
              await request("/me/history", {
                method: "DELETE",
                idempotencyKey: crypto.randomUUID(),
              });
              setHistory([]);
            }}
          >
            {" " + t("Xóa lịch sử đọc") + " "}
          </button>
          <div className="operations-list">
            {history.map((h) => (
              <article key={h.id}>
                <div>
                  <strong>
                    {data.books.find((b) => b.id === h.bookId)?.title ||
                      t("Tác phẩm không còn công khai")}
                  </strong>
                  <p>
                    {new Date(h.openedAt).toLocaleString(getLocale())} ·{" "}
                    {h.mode === "pdf"
                      ? `Trang ${h.page}`
                      : t("Đọc theo chương")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {tab === "copies" && staff && (
        <div className="reader-panel">
          <h3>{t("Tra cứu mã bản sách")}</h3>
          <label className="operations-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Nhập hoặc quét mã bản sách")}
              aria-label={t("Mã bản sách")}
            />
          </label>
          <p>
            {" " +
              t(
                "Máy quét mã vạch hoạt động như bàn phím: đặt con trỏ vào ô trên rồi quét mã.",
              ) +
              " "}
          </p>
          <div className="operations-list">
            {data.bookCopies
              .filter((c) =>
                `${c.code} ${data.books.find((b) => b.id === c.bookId)?.title}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <article key={c.id}>
                  <div>
                    <strong>{c.code}</strong>
                    <p>
                      {data.books.find((b) => b.id === c.bookId)?.title} ·{" "}
                      {t(statusText[c.status])}
                    </p>
                    <small>
                      {loans.find((l) => l.id === c.loanId)?.readerEmail || ""}
                    </small>
                  </div>
                  {admin && ["available", "maintenance"].includes(c.status) && (
                    <button
                      className="reader-button reader-button-secondary"
                      disabled={busy}
                      onClick={() =>
                        action("copy.update", {
                          id: c.id,
                          status:
                            c.status === "available"
                              ? "maintenance"
                              : "available",
                        })
                      }
                    >
                      {c.status === "available"
                        ? t("Đưa vào bảo trì")
                        : t("Đưa vào phục vụ")}
                    </button>
                  )}
                  {["reserved", "borrowed"].includes(c.status) &&
                    loans.find((l) => l.id === c.loanId) && (
                      <button
                        className="reader-button"
                        disabled={busy}
                        onClick={() => {
                          const loan = loans.find((l) => l.id === c.loanId);
                          return action("loan.action", {
                            id: loan.id,
                            version: loan.version,
                            action:
                              c.status === "reserved" ? "handover" : "return",
                          });
                        }}
                      >
                        {c.status === "reserved"
                          ? t("Xác nhận giao sách")
                          : t("Xác nhận nhận trả")}
                      </button>
                    )}
                </article>
              ))}
          </div>
        </div>
      )}
      {tab === "data-source" && admin && (
        <div className="reader-panel">
          <h3>Nguồn cloud-library-db</h3>
          <p>Đồng bộ một chiều danh mục/tài liệu; không ghi đè database cũ.</p>
          <p>Thư mục: {dataSource?.folder || "Đang kiểm tra…"}</p>
          <p>
            Database nguồn:{" "}
            {dataSource?.database === "connected"
              ? "Đã kết nối"
              : "Chưa truy cập được database cũ"}
          </p>
          <p>
            Tệp ebook nguồn: {dataSource?.files ?? 0} · Sách trong bảng nguồn:{" "}
            {dataSource?.sourceBooks ?? 0}
          </p>
          <p>PDF nguồn giữ riêng tư, chỉ admin kiểm tra:</p>
          {(dataSource?.privatePdfs || []).map((file) => (
            <p key={file.source}>
              <a href={file.url} target="_blank" rel="noopener noreferrer">
                {file.source} — Mở PDF riêng tư
              </a>
            </p>
          ))}
          <p>
            Chưa tự nhập tài khoản, phiếu mượn hoặc tồn kho khi chưa đối chiếu
            dữ liệu nguồn.
          </p>
          <button
            className="reader-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await request("/management/data-source/sync", {
                  method: "POST",
                });
                setDataSource(r.data);
                await refreshLibrary();
              } catch (e) {
                setMessage(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Kiểm tra và đồng bộ lại
          </button>
        </div>
      )}
      {tab === "knowledge" && admin && (
        <>
          <div className="reader-panel">
            <h3>{t("Nội quy và tài liệu nguồn cho trợ lý")}</h3>
            <form className="operations-form" onSubmit={saveSource}>
              <label>
                {" " + t("Tiêu đề") + " "}
                <input name="title" required minLength={2} maxLength={160} />
              </label>
              <label>
                {" " + t("Nội dung") + " "}
                <textarea
                  name="content"
                  required
                  minLength={20}
                  maxLength={50000}
                  rows={7}
                />
              </label>
              <label className="operations-check">
                <input type="checkbox" name="approved" />
                {" " + t("Duyệt nội dung này để trợ lý sử dụng") + " "}
              </label>
              <button className="reader-button" disabled={busy}>
                {" " + t("Lưu tài liệu nguồn") + " "}
              </button>
            </form>
          </div>
          <div className="reader-panel">
            {data.knowledgeSources.map((s) => (
              <article className="knowledge-item" key={s.id}>
                <h3>{s.title}</h3>
                <small>
                  {" " + t("Phiên bản") + " "}
                  {s.version} · {s.approved ? t("Đã duyệt") : t("Chưa duyệt")}
                </small>
                <p>{s.content}</p>
                <button
                  className="reader-button reader-button-secondary"
                  disabled={busy}
                  onClick={() =>
                    action("knowledge.save", {
                      ...s,
                      approved: !s.approved,
                    })
                  }
                >
                  {s.approved ? t("Ngừng dùng cho AI") : t("Duyệt dùng cho AI")}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "outbox" && admin && (
        <div className="reader-panel">
          <h3>{t("Thư thử nghiệm trên máy")}</h3>
          <button
            className="reader-button"
            onClick={async () => {
              setBusy(true);
              try {
                const result = await request("/management/reminders/run", {
                  method: "POST",
                });
                const mail = await request("/management/outbox");
                setOutbox(mail.items);
                setMessage(`Đã xử lý ${result.processed} thông báo.`);
              } catch (error) {
                setMessage(error.message);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {" " + t("Kiểm tra hạn trả và gửi nhắc") + " "}
          </button>
          <p>
            {capabilities?.email
              ? t("Dịch vụ gửi email đã được cấu hình.")
              : t(
                  "Email chưa gửi ra ngoài. Thư thử nghiệm được lưu để kiểm tra nội dung và tránh gửi nhầm.",
                )}
          </p>
          {outbox.map((m) => (
            <article className="knowledge-item" key={m.SK}>
              <strong>{m.subject}</strong>
              <p>
                {t("Đến:") + " "}
                {m.email}
              </p>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
      )}
      {tab === "audio" && (
        <AudioWorkspace
          capabilities={capabilities}
          books={data.books}
          setMessage={setMessage}
        />
      )}
    </section>
  );
}
function AudioWorkspace({ capabilities, books, setMessage }) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("vi-VN");
  const [recording, setRecording] = useState(false);
  const [job, setJob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const recorder = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const chunks = useRef([]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      speechSynthesis.cancel();
    },
    [],
  );
  async function submitAudio(file) {
    setBusy(true);
    try {
      const upload = await uploadFile(file, "audio");
      const created = await request("/audio/jobs", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: {
          uploadId: upload.id,
          language,
        },
      });
      setJob(created);
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const result = await request(`/audio/jobs/${created.id}`);
          setJob(result.data);
          if (["completed", "failed"].includes(result.data.status)) {
            clearInterval(timer.current);
            setAudioUrl(result.url || "");
          }
        } catch (e) {
          clearInterval(timer.current);
          setMessage(e.message);
        }
      }, 4000);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      chunks.current = [];
      const value = new MediaRecorder(stream.current);
      recorder.current = value;
      value.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      value.onstop = () => {
        stream.current.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, {
          type: value.mimeType.split(";")[0],
        });
        submitAudio(
          new File([blob], "question.webm", {
            type: blob.type,
          }),
        );
      };
      value.start();
      setRecording(true);
    } catch (e) {
      setMessage(
        e.name === "NotAllowedError"
          ? t("Bạn chưa cho phép dùng micro. Có thể chọn tệp ghi âm.")
          : e.message,
      );
    }
  }
  async function speak() {
    if (!text.trim()) return;
    if (!capabilities?.polly) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      speechSynthesis.speak(utterance);
      return;
    }
    setBusy(true);
    try {
      const result = await request("/audio/speech", {
        method: "POST",
        body: {
          text,
          language,
        },
      });
      setAudioUrl(result.url);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="audio-grid">
      <div className="reader-panel">
        <h3>
          <Headphones size={20} />
          {" " + t("Nghe nội dung") + " "}
        </h3>
        <p>
          {capabilities?.polly
            ? t("Tạo bản đọc MP3 từ nội dung được chọn.")
            : t(
                "Đang dùng giọng đọc có sẵn của trình duyệt; chưa tạo tệp MP3 trên AWS.",
              )}
        </p>
        <label>
          {" " + t("Ngôn ngữ") + " "}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="vi-VN">{t("Tiếng Việt")}</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <label>
          {" " + t("Chọn tác phẩm") + " "}
          <select
            defaultValue=""
            onChange={async (e) => {
              if (!e.target.value) return;
              try {
                const r = await request(
                  `/books/${e.target.value}/read-access`,
                  {
                    method: "POST",
                  },
                );
                setText(
                  r.data.chapters
                    ?.map((c) => `${c.title}\n${c.content}`)
                    .join("\n\n")
                    .slice(0, 6000) || r.data.description,
                );
              } catch (err) {
                setMessage(err.message);
              }
            }}
          >
            <option value="">{t("Chọn nội dung từ thư viện")}</option>
            {books
              .filter((b) => !b.archived)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          {" " + t("Nội dung đọc") + " "}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={6000}
            rows={8}
          />
        </label>
        <div className="operations-actions">
          <button
            className="reader-button"
            disabled={busy || !text.trim()}
            onClick={speak}
          >
            <Volume2 size={17} />
            {" " + t("Nghe nội dung") + " "}
          </button>
          <button
            className="reader-button reader-button-secondary"
            onClick={() => speechSynthesis.cancel()}
          >
            {" " + t("Dừng đọc") + " "}
          </button>
        </div>
        {audioUrl && <audio controls src={audioUrl} />}
      </div>
      <div className="reader-panel">
        <h3>
          <Mic size={20} />
          {" " + t("Hỏi bằng giọng nói") + " "}
        </h3>
        <p>
          {capabilities?.transcribe
            ? t(
                "Ghi câu hỏi, hệ thống chuyển giọng nói thành văn bản rồi trả lời kèm nguồn.",
              )
            : t(
                "Ghi âm và nhận dạng cần Amazon Transcribe. Bạn vẫn có thể dùng trang Trợ lý để hỏi bằng văn bản.",
              )}
        </p>
        <div className="operations-actions">
          <button
            className="reader-button"
            disabled={!capabilities?.transcribe || busy}
            onClick={() => {
              if (recording) {
                recorder.current.stop();
                setRecording(false);
              } else record();
            }}
          >
            {recording ? <Square size={17} /> : <Mic size={17} />}{" "}
            {recording ? t("Dừng và gửi") : t("Ghi câu hỏi")}
          </button>
          <label className="reader-button reader-button-secondary">
            {" " + t("Chọn tệp ghi âm") + " "}
            <input
              type="file"
              accept="audio/*"
              hidden
              disabled={!capabilities?.transcribe || busy}
              onChange={(e) =>
                e.target.files[0] && submitAudio(e.target.files[0])
              }
            />
          </label>
        </div>
        {job && (
          <article>
            <p role="status">{t(statusText[job.status])}</p>
            {job.transcript && (
              <p>
                <strong>{t("Câu hỏi:")}</strong> {job.transcript}
              </p>
            )}
            {job.answer && <p>{job.answer}</p>}
            {job.error && <p role="alert">{job.error}</p>}
            {job.sources?.map((s) => (
              <small key={s.id}>
                <FileText size={14} /> {s.title} · v{s.version}
              </small>
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
