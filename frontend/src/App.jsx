
import { useState } from "react";

import { canReadBook } from "./data/readerContent";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import BookCarousel from "./components/books/BookCarousel";
import ReadingHistory from "./components/books/ReadingHistory";
import BotanicalDecor from "./components/layout/BotanicalDecor";
import HomeSections from "./components/books/HomeSections";

import AuthorRegistrationPage from "./pages/AuthorRegistrationPage";
import CatalogPage from "./pages/CatalogPage";
import LoansPage from "./pages/LoansPage";
import ManagementPage from "./pages/ManagementPage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";
import AuthPage from "./pages/AuthPage";
import ReaderPage from "./pages/ReaderPage";
import LocalReaderPage from "./pages/LocalReaderPage";
import AuthorWorkspacePage from "./pages/AuthorWorkspacePage";
import AuthorDirectoryPage from "./pages/AuthorDirectoryPage";

import useFavorites from "./hooks/useFavorites";
import useDemoAuth from "./hooks/useDemoAuth";
import useBorrowRequests from "./hooks/useBorrowRequests";

import { BorrowContext } from "./ui/BorrowContext";
import { ReadContext } from "./ui/ReadContext";
import { t, useUiSettings } from "./ui/settings";
import { authMessages } from "./ui/authMessages";
import { readerMessages } from "./ui/readerMessages";
import { isManagementUser } from "./data/demoAccounts";

import "./App.css";
import "./pages/ReaderPages.css";
import "./GalaxyTheme.css";
import "./components/layout/BotanicalTheme.css";
import "./LocalUiPolish.css";

const pageTitles = {
  discover: "Khám phá",
  catalog: "Danh mục sách",
  favorites: "Sách yêu thích",
  loans: "Sách đang mượn",
  ai: "Trợ lý AI",
  profile: "Hồ sơ của tôi",
  "author-workspace": "Khu vực tác giả",
  "author-registration": "Đăng ký tác giả",
  authors: "Danh mục tác giả",
};

const protectedPages = new Set([
  "favorites",
  "loans",
  "ai",
  "profile",
  "reader",
  "author-registration",
  "author-workspace",
]);

const initialFilters = {
  category: "all",
  availability: "all",
  sort: "title-asc",
};

import useLocalLibrary from "./hooks/useLocalLibrary.js";
import { localMode } from "./api/uiLocalMode.js";

export default function App() {
  return localMode ? <LocalApp /> : <DemoApp />;
}
function DemoApp() {
  const auth = useDemoAuth();
  const favorites = useFavorites();
  const loans = useBorrowRequests();
  return <AppView data={{...auth,...favorites,...loans}} />;
}
function LocalApp() {
  const data = useLocalLibrary();
  return <AppView data={data} live />;
}
function AppView({data, live = false}) {
  const { theme, language } = useUiSettings();
  const { user, signInDemo, signOutDemo, updateDemoProfile, favoriteIds,
    toggleFavorite, books, allBooks, requests, allRequests, createRequest,
    cancelRequest, processRequest, createDemoRequests, loading, error, notice,
    busy, refreshCatalog, refreshMine, localPanels, featureRequest } = data;
  const [blocked, setBlocked] = useState("");
  const pendingText = language === "en" ? "This module is not connected to the local API yet." : "Chức năng này chưa nối API local; không dùng dữ liệu demo thay thế.";

  const [activePage, setActivePage] =
    useState("discover");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [filters, setFilters] =
    useState(initialFilters);

  const [pendingPage, setPendingPage] =
    useState(null);

  const [
    pendingFavoriteId,
    setPendingFavoriteId,
  ] = useState(null);

  const [borrowBookId, setBorrowBookId] =
    useState(null);

  const [readingBookId, setReadingBookId] =
    useState(null);

  const [requestTarget, setRequestTarget] =
    useState(null);

  const favoriteBooks = books.filter(
    (book) =>
      favoriteIds.includes(book.id),
  );

  const readingBook = books.find(
    (book) => book.id === readingBookId,
  );

  const favoritesMode =
    activePage === "favorites";

  function resetCatalog() {
    setSearchTerm("");
    setFilters(initialFilters);
  }

  function openAuth(page = "profile") {
    setPendingPage(page);
    setActivePage("auth");
  }

  function handleNavigate(page) {
    if (live && !["discover","catalog","favorites","loans","profile","auth","reader","ai","authors","author-registration","author-workspace"].includes(page)) {
      setBlocked(pendingText); return;
    }
    setBlocked("");
    setRequestTarget(null);
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingFavoriteId(null);

    if (
      (protectedPages.has(page) || (live && page === "authors")) &&
      !user
    ) {
      openAuth(page);
      return;
    }

    setPendingPage(null);

    if (
      page === "catalog" ||
      page === "favorites"
    ) {
      resetCatalog();
    }

    setActivePage(page);
  }

  function handleBrowseCategory(
    category = "all",
    sort = "title-asc",
  ) {
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingPage(null);
    setPendingFavoriteId(null);
    setSearchTerm("");

    setFilters({
      ...initialFilters,
      category,
      sort,
    });

    setActivePage("catalog");
  }

  function handleSearch(keyword) {
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingPage(null);
    setPendingFavoriteId(null);
    setSearchTerm(keyword);
    setFilters(initialFilters);
    setActivePage("catalog");
  }

  async function handleToggleFavorite(bookId) {
    setBorrowBookId(null);
    setReadingBookId(null);

    if (!user) {
      setPendingFavoriteId(bookId);
      openAuth("favorites");
      return;
    }

    const result = await toggleFavorite(bookId);
    if (!result.ok) {
      window.alert(language === "en" ? "Could not save favorites. Please try again." : "Không lưu được yêu thích. Vui lòng thử lại.");
    }
  }

  function handleBorrowBook(bookId) {
    setRequestTarget(null);
    setBorrowBookId(bookId);
    setReadingBookId(null);
    setPendingFavoriteId(null);

    if (!user) {
      openAuth("loans");
      return;
    }

    setPendingPage(null);
    setActivePage("loans");
  }

  function handleReadBook(bookId) {
    const book = books.find(
      (item) => item.id === bookId,
    );

    if (!canReadBook(book)) return;

    setReadingBookId(bookId);
    setBorrowBookId(null);
    setPendingFavoriteId(null);

    if (!user) {
      openAuth("reader");
      return;
    }

    setPendingPage(null);
    setActivePage("reader");
  }

  async function handleAuthenticated(values) {
    const result =
      await signInDemo(values);

    if (!result.ok) {
      return result;
    }

    const nextUser = result.user;

    if (isManagementUser(nextUser)) {
      setBorrowBookId(null);
      setReadingBookId(null);
      setPendingPage(null);
      setPendingFavoriteId(null);
      setActivePage("discover");

      return result;
    }

    const destination = live ? (pendingPage || (nextUser.role === "author" ? "author-workspace" : "profile")) :
      nextUser.role === "author" &&
      (
        !pendingPage ||
        [
          "profile",
          "author-registration",
        ].includes(pendingPage)
      )
        ? "author-workspace"
        : pendingPage ||
          (
            protectedPages.has(activePage)
              ? activePage
              : "profile"
          );

    if (pendingFavoriteId !== null) {
      const favoriteResult = await toggleFavorite(pendingFavoriteId, true);
      if (!favoriteResult.ok) {
        window.alert(language === "en" ? "Could not save favorites. Please try again." : "Không lưu được yêu thích. Vui lòng thử lại.");
      }
    }

    if (
      destination === "favorites"
    ) {
      resetCatalog();
    }

    setPendingPage(null);
    setPendingFavoriteId(null);
    setActivePage(destination);

    return result;
  }

  function handleLoginClick() {
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingFavoriteId(null);

    openAuth("profile");
  }

  async function handleLogout() {
    await signOutDemo();

    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingPage(null);
    setPendingFavoriteId(null);
    setRequestTarget(null);

    resetCatalog();
    setActivePage("discover");
  }

  // Bước 6:
  // null = mở trang Sách đang mượn
  // mà không cần chọn phiếu cụ thể.
  function handleOpenRequest(id) {
    if (id === null) {
      handleNavigate("loans");
      return;
    }

    if (
      !requests.some(
        (request) =>
          request.id === id,
      )
    ) {
      return;
    }

    handleNavigate("loans");

    setRequestTarget({
      id,
      token: crypto.randomUUID(),
    });
  }

  const needsAuth =
    protectedPages.has(activePage) && !user;

  const currentTitle =
    activePage === "auth" ||
    needsAuth
      ? authMessages[language].account
      : activePage === "reader"
        ? readerMessages[language].title
        : t(pageTitles[activePage]);

  if (isManagementUser(user)) {
    return (
      <ManagementPage
        key={user.email}
        user={user}
        books={allBooks}
        requests={allRequests}
        onProcess={processRequest}
        onCreateDemo={createDemoRequests}
        onLogout={handleLogout}
        live={live}
        local={localPanels}
        onRefresh={refreshMine}
        notice={notice || error}
        busy={busy}
      />
    );
  }

  if (
    activePage === "auth" ||
    needsAuth
  ) {
    return (
      <div
        className="galaxy-theme access-layout"
        data-theme={theme}
        lang={language}
      >
        <AuthPage
          live={live}
          onAuthenticate={handleAuthenticated}
          onBack={() =>
            handleNavigate("discover")
          }
        />
      </div>
    );
  }

  return (
    <BorrowContext.Provider
      value={handleBorrowBook}
    >
      <ReadContext.Provider
        value={handleReadBook}
      >
        <div
          className="app-layout galaxy-theme"
          data-live={live ? "true" : undefined}
          data-theme={theme}
          lang={language}
        >
          <Sidebar
            activePage={
              activePage === "reader"
                ? "catalog"
                : activePage
            }
            onNavigate={handleNavigate}
            user={user}
          />

          <main className="main-content botanical-main">
            {activePage === "discover" && (
              <BotanicalDecor />
            )}

            <Header
              title={currentTitle}
              searchTerm={searchTerm}
              onSearchTermChange={
                setSearchTerm
              }
              onSearch={handleSearch}
              onProfileClick={() =>
                handleNavigate("profile")
              }
              user={user}
              onLoginClick={handleLoginClick}
              onLogout={handleLogout}
              onOpenRequest={handleOpenRequest}
              local={localPanels}
              live={live}
              onRefresh={live && user ? refreshMine : undefined}
              busy={busy}
            />

            {live && (blocked || notice || error) && <p className="reader-status" role="alert">{blocked || notice || error}</p>}
            {live && error && <button className="reader-button" onClick={refreshCatalog}>{language === "en" ? "Retry catalog" : "Tải lại danh mục"}</button>}
            {live && loading && <p className="reader-muted">{language === "en" ? "Loading catalog…" : "Đang tải danh mục…"}</p>}
            {activePage === "discover" && (
              <>
                <BookCarousel
                  books={books}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={
                    handleToggleFavorite
                  }
                />

                {(!live || user) && <ReadingHistory
                  key={user?.email || "guest"}
                  user={user}
                  books={books}
                  local={live?localPanels:undefined}
                />}

                <HomeSections
                  books={books}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={
                    handleToggleFavorite
                  }
                  onBrowseCategory={
                    handleBrowseCategory
                  }
                />
              </>
            )}

            {activePage === "authors" && (
              <AuthorDirectoryPage
                books={books}
                favoriteIds={favoriteIds}
                onToggleFavorite={
                  handleToggleFavorite
                }
              />
            )}

            {(
              activePage === "catalog" ||
              (
                favoritesMode &&
                user
              )
            ) && (
              <CatalogPage
                key={activePage}
                books={
                  favoritesMode
                    ? favoriteBooks
                    : books
                }
                allBooks={books}
                searchTerm={searchTerm}
                onSearchTermChange={
                  setSearchTerm
                }
                filters={filters}
                onFiltersChange={
                  setFilters
                }
                onReset={resetCatalog}
                favoriteIds={favoriteIds}
                onToggleFavorite={
                  handleToggleFavorite
                }
                favoritesMode={favoritesMode}
                onBrowse={() =>
                  handleNavigate("discover")
                }
              />
            )}

            {activePage === "loans" && user && (
              <LoansPage
                key={
                  user.email +
                  ":" +
                  (borrowBookId ?? "") +
                  ":" +
                  (requestTarget?.token || "")
                }
                books={allBooks}
                requests={requests}
                live={live}
                local={localPanels}
                user={user}
                onCreateRequest={createRequest}
                onCancelRequest={cancelRequest}
                initialBookId={borrowBookId}
                initialRequestId={requestTarget?.id}
                onBrowse={() =>
                  handleBrowseCategory()
                }
              />
            )}

            {activePage === "reader" &&
              user &&
              readingBook && (
                live ? <LocalReaderPage key={user.email+":"+readingBook.id} book={readingBook} user={user} api={featureRequest} onBack={()=>{void refreshMine();handleBrowseCategory();}} /> : <ReaderPage
                  key={
                    user.email +
                    ":" +
                    readingBook.id
                  }
                  book={readingBook}
                  user={user}
                  onBack={() =>
                    handleBrowseCategory()
                  }
                />
              )}

            {activePage === "ai" && user && (
              <AssistantPage
                key={user.email}
                user={user}
                local={live?localPanels:undefined}
                books={books}
                favoriteIds={favoriteIds}
                onToggleFavorite={
                  handleToggleFavorite
                }
              />
            )}

            {activePage ===
              "author-registration" &&
              user && (
                <AuthorRegistrationPage
                  key={user.email}
                  user={user}
                  local={live?localPanels:undefined}
                />
              )}

            {activePage ===
              "author-workspace" &&
              user && (
                <AuthorWorkspacePage
                  key={user.email}
                  local={live?localPanels:undefined}
                  onBrowse={() =>
                    handleNavigate("discover")
                  }
                />
              )}

            {activePage === "profile" &&
              user && (
                <ProfilePage
                  key={user.email}
                  user={user}
                  favoriteCount={
                    favoriteBooks.length
                  }
                  onBrowseFavorites={() =>
                    handleNavigate("favorites")
                  }
                  live={live}
                  local={live?localPanels:undefined}
                  onUpdateProfile={
                    updateDemoProfile
                  }
                />
              )}
          </main>
        </div>
      </ReadContext.Provider>
    </BorrowContext.Provider>
  );
}
