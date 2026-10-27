import { useContext, useState } from "react";

import { BorrowContext } from "../ui/BorrowContext";
import { ReadContext } from "../ui/ReadContext";

import { t, useUiSettings } from "../ui/settings";

import FavoriteButton from "../components/books/FavoriteButton";

import { BookCover, BookDetails } from "../components/books/HomeSections";

import "./CatalogPage.css";

function normalizeSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ");
}

export default function CatalogPage({
  books,
  allBooks = books,
  searchTerm,
  onSearchTermChange,
  filters,
  onFiltersChange,
  onReset,
  favoriteIds = [],
  onToggleFavorite,
  favoritesMode = false,
  onBrowse,

  remote = false,
  loading = false,
  errorMessage = "",
  onRetry,
  totalCount = null,
}) {
  const { language } = useUiSettings();

  const onBorrow = useContext(BorrowContext);
  const onRead = useContext(ReadContext);

  const [selectedBookId, setSelectedBookId] = useState(null);

  const selectedBook = books.find((book) => book.id === selectedBookId);

  const copy =
    language === "en"
      ? {
          loading: "Loading the catalog…",
          retry: "Try again",
          loaded: "Loaded",
        }
      : {
          loading: "Đang tải danh mục…",
          retry: "Thử lại",
          loaded: "Đã tải",
        };

  const categories = [
    ...new Set(allBooks.map((book) => book.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "vi"));

  const keyword = normalizeSearch(searchTerm);

  const visibleBooks = remote
    ? books
    : books
        .filter((book) => {
          const searchableText = normalizeSearch(
            `${book.title} ${book.author} ${book.isbn}`,
          );

          const matchesSearch = searchableText.includes(keyword);

          const matchesCategory =
            filters.category === "all" || book.category === filters.category;

          const isAvailable = book.availableCopies > 0;

          const matchesAvailability =
            filters.availability === "all" ||
            (filters.availability === "available" && isAvailable) ||
            (filters.availability === "unavailable" && !isAvailable);

          return matchesSearch && matchesCategory && matchesAvailability;
        })
        .sort((a, b) => {
          if (filters.sort === "title-desc") {
            return b.title.localeCompare(a.title, "vi");
          }

          if (filters.sort === "author") {
            return (
              a.author.localeCompare(b.author, "vi") ||
              a.title.localeCompare(b.title, "vi")
            );
          }

          return a.title.localeCompare(b.title, "vi");
        });

  function changeFilter(name, value) {
    onFiltersChange({
      ...filters,
      [name]: value,
    });
  }

  return (
    <section className="catalog-page" aria-label={t("Danh mục sách")}>
      <div className="catalog-toolbar">
        <label className="catalog-field catalog-search-field">
          <span>{t("Tìm kiếm")}</span>

          <input
            type="search"
            placeholder={t("Tên sách, tác giả hoặc ISBN...")}
            aria-label={t("Tìm kiếm")}
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </label>

        <label className="catalog-field">
          <span>{t("Thể loại")}</span>

          {remote ? (
            <input
              type="search"
              aria-label={t("Thể loại")}
              value={filters.category === "all" ? "" : filters.category}
              placeholder={t("Tất cả thể loại")}
              onChange={(event) =>
                changeFilter("category", event.target.value || "all")
              }
            />
          ) : (
            <select
              aria-label={t("Thể loại")}
              value={filters.category}
              onChange={(event) => changeFilter("category", event.target.value)}
            >
              <option value="all">{t("Tất cả thể loại")}</option>

              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="catalog-field">
          <span>{t("Tình trạng")}</span>

          <select
            aria-label={t("Tình trạng")}
            value={filters.availability}
            onChange={(event) =>
              changeFilter("availability", event.target.value)
            }
          >
            <option value="all">{t("Tất cả sách")}</option>

            <option value="available">{t("Còn sách")}</option>

            <option value="unavailable">{t("Hết sách")}</option>
          </select>
        </label>

        <label className="catalog-field">
          <span>{t("Sắp xếp")}</span>

          <select
            aria-label={t("Sắp xếp")}
            value={filters.sort}
            onChange={(event) => changeFilter("sort", event.target.value)}
          >
            <option value="title-asc">{t("Tên sách: A → Z")}</option>

            <option value="title-desc">{t("Tên sách: Z → A")}</option>

            <option value="author">{t("Tên tác giả: A → Z")}</option>
          </select>
        </label>

        <button type="button" className="catalog-reset" onClick={onReset}>
          {t("Đặt lại")}
        </button>
      </div>

      {!loading && !errorMessage && (
        <p className="catalog-summary" role="status">
          {remote ? copy.loaded : t("Tìm thấy")}{" "}
          <strong>{visibleBooks.length}</strong>
          {!remote
            ? ` / ${books.length}`
            : Number.isInteger(totalCount) && totalCount >= books.length
              ? ` / ${totalCount}`
              : ""}{" "}
          {t("cuốn sách.")}
        </p>
      )}

      {loading ? (
        <div className="catalog-request-state" role="status">
          {copy.loading}
        </div>
      ) : errorMessage ? (
        <div className="catalog-request-state">
          <p role="alert">{errorMessage}</p>

          <button type="button" className="catalog-reset" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
      ) : visibleBooks.length > 0 ? (
        <div className="catalog-grid">
          {visibleBooks.map((book) => (
            <article key={book.id} className="catalog-item">
              <button
                type="button"
                className="catalog-card"
                aria-label={`${
                  language === "en" ? "View details: " : "Xem chi tiết "
                }${book.title}`}
                onClick={() => setSelectedBookId(book.id)}
              >
                <span className="catalog-cover">
                  <BookCover book={book} />
                </span>

                <span className="catalog-category">{book.category}</span>

                <strong className="catalog-title" title={book.title}>
                  {book.title}
                </strong>

                <span className="catalog-author" title={book.author}>
                  {book.author}
                </span>

                <span
                  className={`catalog-availability ${
                    book.availableCopies > 0 ? "is-available" : "is-unavailable"
                  }`}
                >
                  {book.availableCopies > 0
                    ? t("Còn {{0}} bản", {
                        0: book.availableCopies,
                      })
                    : t("Hết sách")}
                </span>
              </button>

              {!remote && onToggleFavorite && (
                <FavoriteButton
                  book={book}
                  isFavorite={favoriteIds.includes(book.id)}
                  onToggleFavorite={onToggleFavorite}
                  className="catalog-card-favorite"
                />
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="catalog-empty">
          <h2>
            {favoritesMode && books.length === 0
              ? t("Bạn chưa lưu sách yêu thích")
              : t("Không tìm thấy sách")}
          </h2>

          <p>
            {favoritesMode && books.length === 0
              ? t("Bấm trái tim ở một cuốn sách để lưu vào đây.")
              : t("Thử đổi từ khóa hoặc đặt lại bộ lọc nhé.")}
          </p>

          <button
            type="button"
            className="catalog-reset"
            onClick={favoritesMode && books.length === 0 ? onBrowse : onReset}
          >
            {favoritesMode && books.length === 0
              ? t("Khám phá sách")
              : t("Hiển thị tất cả sách")}
          </button>
        </div>
      )}

      {selectedBook && (
        <BorrowContext.Provider value={remote ? null : onBorrow}>
          <ReadContext.Provider value={remote ? null : onRead}>
            <BookDetails
              book={selectedBook}
              favoriteIds={favoriteIds}
              onToggleFavorite={remote ? undefined : onToggleFavorite}
              onClose={() => setSelectedBookId(null)}
            />
          </ReadContext.Provider>
        </BorrowContext.Provider>
      )}
    </section>
  );
}
