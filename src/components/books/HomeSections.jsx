import { useContext, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import FavoriteButton from "./FavoriteButton";
import TopicBar from "./TopicBar";
import { BorrowContext } from "../../ui/BorrowContext";
import { ReadContext } from "../../ui/ReadContext";
import { borrowMessages } from "../../ui/borrowMessages";
import { t, useUiSettings } from "../../ui/settings";
import "./HomeSections.css";
import "../../pages/BorrowFlow.css";

const homeMessages = {
  vi: {
    featured: "Sách nổi bật",
    week: "Tuần này",
    popular: "Sách phổ biến",
    details: "Xem chi tiết",
    viewAll: "Xem tất cả",
    books: "cuốn sách",
    recommended: "Có thể bạn sẽ thích",
    recommendationHint: "Ưu tiên thể loại bạn đã lưu và sách còn sẵn",
    topics: "Khám phá theo chủ đề",
    topicHint: "Chọn một chủ đề để xem những cuốn sách phù hợp.",
    allTopics: "Tất cả chủ đề",
    noDescription: "Chưa có mô tả cho cuốn sách này.",
    read: "Đọc online",
    unavailable: "Chưa có bản đọc online",
  },

  en: {
    featured: "Featured book",
    week: "This week",
    popular: "Popular books",
    details: "View details",
    viewAll: "View all",
    books: "books",
    recommended: "You might also like",
    recommendationHint: "Based on your favorite categories and available books",
    topics: "Explore by topic",
    topicHint: "Choose a topic to find books you enjoy.",
    allTopics: "All topics",
    noDescription: "No description is available for this book.",
    read: "Read online",
    unavailable: "No online edition",
  },
};

export function BookCover({ book }) {
  const { language } = useUiSettings();
  const [failedCover, setFailedCover] = useState(null);

  if (!book.cover || failedCover === book.cover) {
    return (
      <span className="home-cover-fallback">
        <strong>{book.title}</strong>
        <small>{book.author}</small>
      </span>
    );
  }

  return (
    <img
      className="home-cover-image"
      src={book.cover}
      alt={(language === "en" ? "Book cover: " : "Bìa sách: ") + book.title}
      draggable={false}
      onError={() => setFailedCover(book.cover)}
    />
  );
}

export function BookDetails({
  book,
  onClose,
  favoriteIds = [],
  onToggleFavorite,
}) {
  const dialogRef = useRef(null);

  const onBorrow = useContext(BorrowContext);
  const onRead = useContext(ReadContext);

  const { language } = useUiSettings();

  const copy = borrowMessages[language];
  const readCopy = homeMessages[language];

  const isFavorite = favoriteIds.includes(book.id);

  const canRead =
    typeof book.pdfUrl === "string" && Boolean(book.pdfUrl.trim());

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleBorrow() {
    onClose();
    onBorrow(book.id);
  }

  function handleRead() {
    onClose();
    onRead(book.id);
  }

  return (
    <dialog
      ref={dialogRef}
      className="book-modal"
      aria-labelledby="book-modal-title"
      onClose={onClose}
    >
      <button
        type="button"
        className="book-modal-close"
        aria-label={copy.close}
        onClick={() => dialogRef.current.close()}
      >
        <X size={22} aria-hidden="true" />
      </button>

      <div className="book-modal-content">
        <div className="book-modal-cover">
          <BookCover book={book} />
        </div>

        <div>
          <p className="home-eyebrow">{copy.details}</p>

          <h2 id="book-modal-title">{book.title}</h2>

          <p className="home-author">{book.author}</p>

          <p className="home-category">{t(book.category || "Khác")}</p>

          <p className="book-modal-isbn">
            <strong>ISBN:</strong> {book.isbn || "—"}
          </p>

          <p className="home-description">
            {book.description || copy.noDescription}
          </p>

          <p className="borrow-availability">
            {copy.copies}: <strong>{book.availableCopies || 0}</strong>
          </p>

          {onToggleFavorite && (
            <div className="book-modal-actions">
              <FavoriteButton
                book={book}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
              />

              <span>{isFavorite ? copy.savedFavorite : copy.saveFavorite}</span>
            </div>
          )}

          <div className="borrow-detail-actions">
            {onBorrow && (
              <button
                type="button"
                className="borrow-button"
                disabled={!(book.availableCopies > 0)}
                onClick={handleBorrow}
              >
                {book.availableCopies > 0 ? copy.borrow : copy.outOfStock}
              </button>
            )}

            {onRead && (
              <button
                type="button"
                className="borrow-button"
                disabled={!canRead}
                onClick={handleRead}
              >
                {canRead ? readCopy.read : readCopy.unavailable}
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function BookTile({ book, favoriteIds = [], onToggleFavorite, onOpenBook }) {
  const { language } = useUiSettings();
  const copy = homeMessages[language];

  return (
    <article className="book-tile">
      <button
        type="button"
        className="book-tile-button"
        aria-label={copy.details + ": " + book.title}
        onClick={() => onOpenBook(book)}
      >
        <span className="book-tile-cover">
          <BookCover book={book} />
        </span>

        <strong className="book-tile-title" title={book.title}>
          {book.title}
        </strong>

        <span className="book-tile-author" title={book.author}>
          {book.author}
        </span>
      </button>

      {onToggleFavorite && (
        <FavoriteButton
          book={book}
          isFavorite={favoriteIds.includes(book.id)}
          onToggleFavorite={onToggleFavorite}
          className="tile-favorite"
        />
      )}
    </article>
  );
}

function BookShelf({ title, subtitle, books = [], onViewAll, ...tileProps }) {
  const { language } = useUiSettings();
  const copy = homeMessages[language];
  const shelfRef = useRef(null);

  function scrollShelf(direction) {
    const shelf = shelfRef.current;
    if (shelf)
      shelf.scrollBy({
        left: direction * shelf.clientWidth * 0.8,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }

  if (books.length === 0) {
    return null;
  }

  return (
    <section className="home-panel shelf-panel">
      <div className="home-panel-header">
        <div>
          <h2>{title}</h2>

          {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>

        <div className="shelf-controls">
          {onViewAll && (
            <button
              type="button"
              className="section-view-all"
              onClick={onViewAll}
            >
              {copy.viewAll}
            </button>
          )}
          <button
            type="button"
            aria-label={t("Sách trước")}
            onClick={() => scrollShelf(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("Sách tiếp theo")}
            onClick={() => scrollShelf(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="book-shelf" ref={shelfRef}>
        {books.map((book) => (
          <BookTile key={book.id} book={book} {...tileProps} />
        ))}
      </div>
    </section>
  );
}

export default function HomeSections({
  books = [],
  favoriteIds = [],
  onToggleFavorite,
  onBrowseCategory,
}) {
  const { language } = useUiSettings();
  const copy = homeMessages[language];

  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  if (books.length === 0) {
    return null;
  }

  const categories = [...new Set(books.map((book) => book.category || "Khác"))];

  const topicBooks =
    selectedCategory === "all"
      ? books
      : books.filter((book) => (book.category || "Khác") === selectedCategory);

  const favoriteCategories = new Set(
    books
      .filter((book) => favoriteIds.includes(book.id))
      .map((book) => book.category),
  );

  const unsavedBooks = books.filter((book) => !favoriteIds.includes(book.id));

  function recommendationScore(book) {
    return (
      (favoriteCategories.has(book.category) ? 2 : 0) +
      (book.availableCopies > 0 ? 1 : 0)
    );
  }

  const recommendedBooks = [...(unsavedBooks.length > 0 ? unsavedBooks : books)]
    .sort((a, b) => recommendationScore(b) - recommendationScore(a))
    .slice(0, 6);

  function openBook(book) {
    setSelectedBook(book);
  }

  const tileProps = {
    favoriteIds,
    onToggleFavorite,
    onOpenBook: openBook,
  };

  return (
    <div className="discovery-page">
      <BookShelf title={copy.featured} books={books} {...tileProps} />

      <BookShelf
        title={copy.recommended}
        subtitle={copy.recommendationHint}
        books={recommendedBooks}
        onViewAll={onBrowseCategory ? () => onBrowseCategory("all") : undefined}
        {...tileProps}
      />

      <div className="topic-sections">
        <div className="home-section-heading">
          <h2>{copy.topics}</h2>
          <p>{copy.topicHint}</p>
        </div>

        <TopicBar
          categories={categories}
          activeCategory={selectedCategory}
          onChange={setSelectedCategory}
        />

        <BookShelf
          title={
            selectedCategory === "all" ? copy.allTopics : t(selectedCategory)
          }
          subtitle={topicBooks.length + " " + copy.books}
          books={topicBooks}
          onViewAll={
            onBrowseCategory
              ? () => onBrowseCategory(selectedCategory)
              : undefined
          }
          {...tileProps}
        />
      </div>

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </div>
  );
}
