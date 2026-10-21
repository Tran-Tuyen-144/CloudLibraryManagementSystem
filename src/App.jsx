import { useState } from "react";
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import BookCarousel from "./components/books/BookCarousel";
import ReadingHistory from "./components/books/ReadingHistory";
import BotanicalDecor from "./components/layout/BotanicalDecor";
import HomeSections from "./components/books/HomeSections";
import CatalogPage from "./pages/CatalogPage";
import LoansPage from "./pages/LoansPage";
import ManagementPage from "./pages/ManagementPage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";
import AuthPage from "./pages/AuthPage";
import ReaderPage from "./pages/ReaderPage";
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
import "./GalaxyTheme.css";
import "./components/layout/BotanicalTheme.css";

const pageTitles = {
  discover: "Khám phá",
  catalog: "Danh mục sách",
  favorites: "Sách yêu thích",
  loans: "Sách đang mượn",
  ai: "Trợ lý AI",
  profile: "Hồ sơ của tôi",
};

const protectedPages = new Set([
  "favorites",
  "loans",
  "ai",
  "profile",
  "reader",
]);

const initialFilters = {
  category: "all",
  availability: "all",
  sort: "title-asc",
};

export default function App() {
  const { theme, language } = useUiSettings();

  const {
    user,
    signInDemo,
    signOutDemo,
    updateDemoProfile,
  } = useDemoAuth();

  const { favoriteIds, toggleFavorite } = useFavorites();

  const {
    books,
    allBooks,
    requests,
    allRequests,
    createRequest,
    cancelRequest,
    processRequest,
    createDemoRequests,
  } = useBorrowRequests();

  const [activePage, setActivePage] = useState("discover");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState(initialFilters);

  const [pendingPage, setPendingPage] = useState(null);
  const [pendingFavoriteId, setPendingFavoriteId] = useState(null);

  const [borrowBookId, setBorrowBookId] = useState(null);
  const [readingBookId, setReadingBookId] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);

  const favoriteBooks = books.filter((book) =>
    favoriteIds.includes(book.id),
  );

  const readingBook = books.find(
    (book) => book.id === readingBookId,
  );

  const favoritesMode = activePage === "favorites";

  function resetCatalog() {
    setSearchTerm("");
    setFilters(initialFilters);
  }

  function openAuth(page = "profile") {
    setPendingPage(page);
    setActivePage("auth");
  }

  function handleNavigate(page) {
    setRequestTarget(null);
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingFavoriteId(null);

    if (protectedPages.has(page) && !user) {
      openAuth(page);
      return;
    }

    setPendingPage(null);

    if (page === "catalog" || page === "favorites") {
      resetCatalog();
    }

    setActivePage(page);
  }

  function handleBrowseCategory(category = "all") {
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingPage(null);
    setPendingFavoriteId(null);
    setSearchTerm("");

    setFilters({
      ...initialFilters,
      category,
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

  function handleToggleFavorite(bookId) {
    setBorrowBookId(null);
    setReadingBookId(null);

    if (!user) {
      setPendingFavoriteId(bookId);
      openAuth("favorites");
      return;
    }

    toggleFavorite(bookId);
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
    const book = books.find((item) => item.id === bookId);

    if (
      typeof book?.pdfUrl !== "string" ||
      !book.pdfUrl.trim()
    ) {
      return;
    }

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
    const result = await signInDemo(values);

    if (!result.ok) return result;

    const nextUser = result.user;

    if (isManagementUser(nextUser)) {
      setBorrowBookId(null);
      setReadingBookId(null);
      setPendingPage(null);
      setPendingFavoriteId(null);
      setActivePage("discover");

      return result;
    }

    const destination =
      pendingPage ||
      (protectedPages.has(activePage) ? activePage : "profile");

    if (pendingFavoriteId !== null) {
      toggleFavorite(pendingFavoriteId);
    }

    if (destination === "favorites") {
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

  function handleLogout() {
    signOutDemo();
    setBorrowBookId(null);
    setReadingBookId(null);
    setPendingPage(null);
    setPendingFavoriteId(null);
    resetCatalog();
    setActivePage("discover");
  }

  function handleOpenRequest(id) {
    if (!requests.some((request) => request.id === id)) return;

    handleNavigate("loans");

    setRequestTarget({
      id,
      token: crypto.randomUUID(),
    });
  }

  const needsAuth = protectedPages.has(activePage) && !user;

  const currentTitle =
    activePage === "auth" || needsAuth
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
      />
    );
  }

  return (
    <BorrowContext.Provider value={handleBorrowBook}>
      <ReadContext.Provider value={handleReadBook}>
        <div
          className="app-layout galaxy-theme"
          data-theme={theme}
          lang={language}
        >
          <Sidebar
            activePage={
              activePage === "reader" ? "catalog" : activePage
            }
            onNavigate={handleNavigate}
          />

          <main className="main-content botanical-main">
            {activePage === "discover" && <BotanicalDecor />}

            <Header
              title={currentTitle}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              onSearch={handleSearch}
              onProfileClick={() => handleNavigate("profile")}
              user={user}
              onLoginClick={handleLoginClick}
              onLogout={handleLogout}
              onOpenRequest={handleOpenRequest}
            />

            {(activePage === "auth" || needsAuth) && (
              <AuthPage
                onAuthenticate={handleAuthenticated}
                onBack={() => handleNavigate("discover")}
              />
            )}

            {activePage === "discover" && (
              <>
                <BookCarousel
                  books={books}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={handleToggleFavorite}
                  onBrowseCategory={handleBrowseCategory}
                />

                <ReadingHistory
                  key={user?.email || "guest"}
                  user={user}
                  books={books}
                />

                <HomeSections
                  books={books}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={handleToggleFavorite}
                  onBrowseCategory={handleBrowseCategory}
                />
              </>
            )}

            {(activePage === "catalog" ||
              (favoritesMode && user)) && (
              <CatalogPage
                key={activePage}
                books={favoritesMode ? favoriteBooks : books}
                allBooks={books}
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                filters={filters}
                onFiltersChange={setFilters}
                onReset={resetCatalog}
                favoriteIds={favoriteIds}
                onToggleFavorite={handleToggleFavorite}
                favoritesMode={favoritesMode}
                onBrowse={() => handleNavigate("discover")}
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
                onCreateRequest={createRequest}
                onCancelRequest={cancelRequest}
                initialBookId={borrowBookId}
                initialRequestId={requestTarget?.id}
                onBrowse={() => handleBrowseCategory()}
              />
            )}

            {activePage === "reader" && user && readingBook && (
              <ReaderPage
                key={user.email + ":" + readingBook.id}
                book={readingBook}
                user={user}
                onBack={() => handleBrowseCategory()}
              />
            )}

            {activePage === "ai" && user && (
              <AssistantPage
                key={user.email}
                user={user}
                books={books}
                favoriteIds={favoriteIds}
                onToggleFavorite={handleToggleFavorite}
              />
            )}

            {activePage === "profile" && user && (
              <ProfilePage
                key={user.email}
                user={user}
                favoriteCount={favoriteBooks.length}
                onBrowseFavorites={() =>
                  handleNavigate("favorites")
                }
                onUpdateProfile={updateDemoProfile}
              />
            )}
          </main>
        </div>
      </ReadContext.Provider>
    </BorrowContext.Provider>
  );
}