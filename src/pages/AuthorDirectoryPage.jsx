import { useState } from "react";

import { getPublicAuthors, normalizeAuthorSearch } from "../data/publicAuthors";

import { useLibraryData } from "../ui/libraryStore";

import { t, useUiSettings } from "../ui/settings";

import CatalogPage from "./CatalogPage";

import "./ReaderPages.css";
import "./AuthorDirectoryPage.css";

const initialFilters = {
  category: "all",
  availability: "all",
  sort: "title-asc",
};

function AuthorBooks({ author, favoriteIds, onToggleFavorite, onBack }) {
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState(initialFilters);

  function reset() {
    setSearchTerm("");
    setFilters(initialFilters);
  }

  return (
    <>
      <div className="reader-panel author-directory-heading">
        <div>
          <p className="author-directory-eyebrow">
            {label("Tác giả", "Author")}
          </p>

          <h2>{author.name}</h2>

          <p className="reader-muted">
            {author.books.length}{" "}
            {label(
              "tác phẩm trong thư viện",
              author.books.length === 1
                ? "work in the library"
                : "works in the library",
            )}
          </p>
        </div>

        <button
          type="button"
          className="reader-button reader-button-secondary"
          onClick={onBack}
        >
          {label("Quay lại danh sách tác giả", "Back to authors")}
        </button>
      </div>

      <CatalogPage
        books={author.books}
        allBooks={author.books}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        filters={filters}
        onFiltersChange={setFilters}
        onReset={reset}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onBrowse={onBack}
      />
    </>
  );
}

export default function AuthorDirectoryPage({
  books,
  favoriteIds = [],
  onToggleFavorite,
}) {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const authors = getPublicAuthors(data, books);

  const selected = authors.find((author) => author.id === selectedId);

  const keyword = normalizeAuthorSearch(query);

  const visibleAuthors = authors.filter((author) => {
    const searchableText = [
      author.name,
      ...author.books.map((book) => book.title),
    ].join(" ");

    return normalizeAuthorSearch(searchableText).includes(keyword);
  });

  if (selected) {
    return (
      <section
        className="reader-page author-directory"
        aria-label={label("Tác phẩm của tác giả", "Author works")}
      >
        <AuthorBooks
          key={selected.id}
          author={selected}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onBack={() => setSelectedId(null)}
        />
      </section>
    );
  }

  return (
    <section
      className="reader-page author-directory"
      aria-label={label("Danh mục tác giả", "Author directory")}
    >
      <div className="reader-panel">
        <h2>{label("Khám phá tác giả", "Discover authors")}</h2>

        <p className="reader-muted">
          {label(
            "Gặp gỡ những tác giả có tác phẩm đang được giới thiệu trong thư viện.",
            "Meet the authors whose work is available in the library.",
          )}
        </p>
      </div>

      {selectedId && !selected && (
        <p className="reader-status" role="status">
          {label(
            "Danh sách đã cập nhật. Tác giả vừa chọn hiện không có tác phẩm công khai.",
            "The list was updated. The selected author currently has no public works.",
          )}
        </p>
      )}

      <label className="reader-field">
        <span>
          {label(
            "Tìm tác giả hoặc tên tác phẩm",
            "Search authors or work titles",
          )}
        </span>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={label(
            "Ví dụ: An Mộc, Những ngày trời trong…",
            "For example: a pen name or book title…",
          )}
        />
      </label>

      <p className="reader-muted" role="status">
        {label("Số tác giả tìm thấy", "Authors found")}: {visibleAuthors.length}
      </p>

      {!visibleAuthors.length && (
        <div className="reader-panel">
          <h3>
            {authors.length
              ? label("Không tìm thấy tác giả", "No authors found")
              : label(
                  "Chưa có tác giả để giới thiệu",
                  "No authors to feature yet",
                )}
          </h3>

          <p className="reader-muted">
            {authors.length
              ? label(
                  "Thử tìm bằng bút danh hoặc tên tác phẩm khác nhé.",
                  "Try another pen name or work title.",
                )
              : label(
                  "Tác giả sẽ xuất hiện tại đây khi có sách đã xuất bản và đang hiển thị trong thư viện.",
                  "Authors appear here when their published books are listed in the library.",
                )}
          </p>
        </div>
      )}

      <div className="author-directory-grid">
        {visibleAuthors.map((author) => {
          const initials = author.name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => Array.from(word)[0])
            .join("")
            .toUpperCase();

          return (
            <article className="author-directory-card" key={author.id}>
              <span className="author-directory-avatar" aria-hidden="true">
                {initials}
              </span>

              <h3>{author.name}</h3>

              <p className="reader-muted">
                {author.books.length}{" "}
                {label(
                  "tác phẩm",
                  author.books.length === 1 ? "work" : "works",
                )}
              </p>

              <div className="author-directory-topics">
                {author.categories.slice(0, 3).map((category) => (
                  <span key={category}>{t(category)}</span>
                ))}
              </div>

              <button
                type="button"
                className="reader-button"
                aria-label={label(
                  `Xem tác phẩm của ${author.name}`,
                  `View works by ${author.name}`,
                )}
                onClick={() => setSelectedId(author.id)}
              >
                {label("Xem tác phẩm", "View works")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
