import { useRef, useState } from "react";
import { BookOpen, Library } from "lucide-react";

import CatalogPage from "./ApiLocalCatalog.jsx";
import { BorrowContext } from "../ui/BorrowContext";
import { loginLocal, loadMine, changeFavorite, createLoan, cancelLoan, logoutLocal } from "../api/localIntegration.js";
import useApiCatalog from "../hooks/useApiCatalog";
import UiControls from "../components/layout/UiControls";
import BotanicalDecor from "../components/layout/BotanicalDecor";

import { useUiSettings, t } from "../ui/settings";

import "../App.css";
import "../GalaxyTheme.css";
import "../components/layout/BotanicalTheme.css";
import "../components/layout/Sidebar.css";
import "../components/layout/Header.css";
import "./ApiCatalogPage.css";
import "./ApiLocalPage.css";

const initialFilters = {
  category: "all",
  availability: "all",
  sort: "title-asc",
};

const messages = {
  vi: {
    note: "Dữ liệu thật từ Backend local. Chỉ danh mục, tài khoản, yêu thích và phiếu mượn đã được kết nối tại trang này.",
    error: "Không thể tải danh mục sách. Vui lòng thử lại.",
    moreError:
      "Chưa tải được trang tiếp theo. Các sách đã tải vẫn được giữ lại.",
    more: "Xem thêm sách",
    loading: "Đang tải…",
    retry: "Thử lại",
  },

  en: {
    note: "Local backend data. Only catalog, accounts, favorites and loans are connected here.",
    error: "The catalog could not be loaded. Please try again.",
    moreError:
      "The next page could not be loaded. Previously loaded books are still available.",
    more: "Load more books",
    loading: "Loading…",
    retry: "Try again",
  },
};

export default function ApiLocalPage() {
  const { theme, language } = useUiSettings();
  const copy = messages[language];

  const [searchTerm, setSearchTerm] = useState("");

  const [filters, setFilters] = useState(initialFilters);

  const catalog = useApiCatalog({
    q: searchTerm,
    ...filters,
  });

  const [session, setSession] = useState(null);
  const [mine, setMine] = useState({ favoriteIds: [], loans: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [register, setRegister] = useState(false);
  const locked = useRef(false);
  const vi = language === "vi";
  const tr = (a, b) => vi ? a : b;

  async function action(task) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try { await task(); }
    catch (error) {
      if (error.status === 401 && session) {
        setSession(null);
        setMine({ favoriteIds: [], loans: [] });
      }
      setNotice(error.message || tr("Có lỗi xảy ra.", "Request failed."));
    } finally { locked.current = false; setBusy(false); }
  }

  function authenticate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void action(async () => {
      const next = await loginLocal(values, register);
      try {
        const data = await loadMine(next.accessToken);
        setSession(next);
        setMine(data);
        form.reset();
        setNotice(tr("Đã kết nối tài khoản local.", "Local account connected."));
      } catch (error) {
        await logoutLocal(next.accessToken).catch(() => {});
        throw error;
      }
    });
  }

  function signOut() {
    void action(async () => {
      try { await logoutLocal(session.accessToken); }
      finally { setSession(null); setMine({ favoriteIds: [], loans: [] }); }
    });
  }

  function toggleFavorite(id) {
    if (!session) return;
    void action(async () => {
      await changeFavorite(session.accessToken, id, !mine.favoriteIds.includes(id));
      setMine(await loadMine(session.accessToken));
    });
  }

  function borrow(id) {
    if (!session) return;
    void action(async () => {
      await createLoan(session.accessToken, id);
      setMine(await loadMine(session.accessToken));
      catalog.reload();
      setNotice(tr("Đã gửi yêu cầu mượn.", "Loan request sent."));
    });
  }

  function cancel(row) {
    void action(async () => {
      await cancelLoan(session.accessToken, row);
      setMine(await loadMine(session.accessToken));
      catalog.reload();
    });
  }

  function reset() {
    setSearchTerm("");
    setFilters(initialFilters);
  }

  return (
    <div
      className="app-layout galaxy-theme api-catalog"
      data-theme={theme}
      lang={language}
    >
      <aside className="sidebar">
        <BotanicalDecor placement="sidebar" />

        <button
          type="button"
          className="sidebar-brand"
          onClick={reset}
          aria-label="Cloud Library"
        >
          <span className="sidebar-brand-mark">
            <Library size={24} aria-hidden="true" />
          </span>

          <span className="sidebar-brand-text">
            <strong>Cloud Library</strong>
            <small>{t("Thư viện của bạn")}</small>
          </span>
        </button>

        <nav className="sidebar-nav" aria-label={t("Danh mục sách")}>
          <button
            type="button"
            className="sidebar-button is-active"
            aria-current="page"
            onClick={reset}
            title={t("Danh mục sách")}
          >
            <BookOpen size={21} aria-hidden="true" />

            <span className="sidebar-label">{t("Danh mục sách")}</span>
          </button>
        </nav>
      </aside>

      <main className="main-content botanical-main">
        <header className="header api-catalog-header">
          <h1 className="header-title">{t("Danh mục sách")}</h1>

          <div className="header-actions">
            <UiControls />
          </div>
        </header>

        <p className="api-catalog-note">{copy.note}</p>

        <section className="local-account" aria-busy={busy}>
          <h2>{tr("Tài khoản local", "Local account")}</h2>
          {!session ? (
            <form className="local-account-form" onSubmit={authenticate}>
              {register && <label>{tr("Họ tên", "Full name")}<input name="fullName" required minLength={2} maxLength={100} /></label>}
              <label>Email<input name="email" type="email" required autoComplete="username" /></label>
              <label>{tr("Mật khẩu", "Password")}<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={register ? "new-password" : "current-password"} /></label>
              <button type="submit" className="catalog-reset" disabled={busy} data-testid="local-auth">{register ? tr("Đăng ký", "Register") : tr("Đăng nhập", "Login")}</button>
              <button type="button" className="catalog-reset" disabled={busy} onClick={() => setRegister(!register)} data-testid="local-switch-auth">{register ? tr("Đã có tài khoản", "Already registered") : tr("Tạo tài khoản thử", "Create test account")}</button>
            </form>
          ) : (
            <>
              <p data-testid="local-user">{session.user.fullName} · {session.user.role}</p>
              <div className="local-actions">
                <button className="catalog-reset" disabled={busy} onClick={() => void action(async () => setMine(await loadMine(session.accessToken)))}>{tr("Tải lại dữ liệu", "Refresh account data")}</button>
                <button className="catalog-reset" disabled={busy} onClick={signOut} data-testid="local-logout">{tr("Đăng xuất", "Logout")}</button>
              </div>
              <h3>{tr("Yêu thích", "Favorites")}: <span data-testid="local-favorite-count">{mine.favoriteIds.length}</span></h3>
              <h3>{tr("Phiếu mượn của tôi", "My loans")}</h3>
              <div data-testid="local-loans">
                {mine.loans.length === 0 && <p>{tr("Chưa có phiếu mượn.", "No loan requests.")}</p>}
                {mine.loans.map(row => <div className="local-loan-row" key={row.id}><span>{row.title} · {row.status}</span>{row.status === "pending" && <button className="catalog-reset" disabled={busy} onClick={() => cancel(row)}>{tr("Hủy yêu cầu", "Cancel request")}</button>}</div>)}
              </div>
            </>
          )}
          {notice && <p role="status" data-testid="local-notice">{notice}</p>}
          <p>{tr("Chỉ dùng tài khoản và dữ liệu thử. Phiên đăng nhập trên giao diện này được giữ trong bộ nhớ, tải lại trang sẽ cần đăng nhập lại.", "Use test accounts only. Reloading this page requires signing in again.")}</p>
        </section>
        <BorrowContext.Provider value={session && !busy ? borrow : null}>
        <CatalogPage
          remoteActions={Boolean(session)}
          favoriteIds={mine.favoriteIds}
          onToggleFavorite={session && !busy ? toggleFavorite : undefined}
          books={catalog.items}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={reset}
          remote
          loading={catalog.loading}
          errorMessage={catalog.error ? copy.error : ""}
          onRetry={catalog.reload}
          totalCount={catalog.total}
        />
        </BorrowContext.Provider>

        {catalog.moreError && (
          <p className="api-catalog-more-error" role="alert">
            {copy.moreError}
          </p>
        )}

        {catalog.nextCursor && !catalog.loading && !catalog.error && (
          <div className="api-catalog-pagination">
            <button
              type="button"
              className="catalog-reset"
              disabled={catalog.loadingMore}
              onClick={catalog.loadMore}
            >
              {catalog.loadingMore
                ? copy.loading
                : catalog.moreError
                  ? copy.retry
                  : copy.more}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
