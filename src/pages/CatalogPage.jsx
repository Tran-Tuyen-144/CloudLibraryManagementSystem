import { useState } from "react";
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
  favoriteIds,
  onToggleFavorite,
  favoritesMode = false,
  onBrowse,
}) {
  const [selectedBook, setSelectedBook] = useState(null);

  const categories = [
    ...new Set(allBooks.map((book) => book.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "vi"));

  const keyword = normalizeSearch(searchTerm);

  const visibleBooks = books
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
    <section className="catalog-page" aria-label="Danh mục sách">
      <div className="catalog-toolbar">
        <label className="catalog-field catalog-search-field">
          <span>Tìm kiếm</span>

          <input
            type="search"
            placeholder="Tên sách, tác giả hoặc ISBN..."
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </label>

        <label className="catalog-field">
          <span>Thể loại</span>

          <select
            value={filters.category}
            onChange={(event) => changeFilter("category", event.target.value)}
          >
            <option value="all">Tất cả thể loại</option>

            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="catalog-field">
          <span>Tình trạng</span>

          <select
            value={filters.availability}
            onChange={(event) =>
              changeFilter("availability", event.target.value)
            }
          >
            <option value="all">Tất cả sách</option>
            <option value="available">Còn sách</option>
            <option value="unavailable">Hết sách</option>
          </select>
        </label>

        <label className="catalog-field">
          <span>Sắp xếp</span>

          <select
            value={filters.sort}
            onChange={(event) => changeFilter("sort", event.target.value)}
          >
            <option value="title-asc">Tên sách: A → Z</option>
            <option value="title-desc">Tên sách: Z → A</option>
            <option value="author">Tên tác giả: A → Z</option>
          </select>
        </label>

        <button type="button" className="catalog-reset" onClick={onReset}>
          Đặt lại
        </button>
      </div>

      <p className="catalog-summary" role="status">
        Tìm thấy <strong>{visibleBooks.length}</strong> / {books.length} cuốn
        sách.
      </p>

      {visibleBooks.length > 0 ? (
        <div className="catalog-grid">
          {visibleBooks.map((book) => (
            <article key={book.id} className="catalog-item">
              <button
                type="button"
                className="catalog-card"
                aria-label={`Xem chi tiết ${book.title}`}
                onClick={() => setSelectedBook(book)}
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
                    ? `Còn ${book.availableCopies} bản`
                    : "Hết sách"}
                </span>
              </button>

              <FavoriteButton
                book={book}
                isFavorite={favoriteIds.includes(book.id)}
                onToggleFavorite={onToggleFavorite}
                className="catalog-card-favorite"
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="catalog-empty">
          <h2>
            {favoritesMode && books.length === 0
              ? "Bạn chưa lưu sách yêu thích"
              : "Không tìm thấy sách"}
          </h2>

          <p>
            {favoritesMode && books.length === 0
              ? "Bấm trái tim ở một cuốn sách để lưu vào đây."
              : "Thử đổi từ khóa hoặc đặt lại bộ lọc nhé."}
          </p>

          <button
            type="button"
            className="catalog-reset"
            onClick={favoritesMode && books.length === 0 ? onBrowse : onReset}
          >
            {favoritesMode && books.length === 0
              ? "Khám phá sách"
              : "Hiển thị tất cả sách"}
          </button>
        </div>
      )}

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
