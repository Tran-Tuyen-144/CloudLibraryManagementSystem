import { useState } from "react";
import { BookCover, BookDetails } from "../components/books/HomeSections";
import FavoriteButton from "../components/books/FavoriteButton";
import "./ReaderPages.css";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

export default function AssistantPage({
  books,
  favoriteIds,
  onToggleFavorite,
}) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);

  const categories = [
    ...new Set(books.map((book) => book.category).filter(Boolean)),
  ];

  function recommend(event) {
    event.preventDefault();

    const terms = [
      ...new Set(
        normalize(question)
          .split(/\s+/)
          .filter((term) => term.length > 2),
      ),
    ];

    const candidates = books.filter(
      (book) =>
        (category === "all" || book.category === category) &&
        (!availableOnly || book.availableCopies > 0),
    );

    const ranked = candidates
      .map((book) => {
        const text = normalize(
          `${book.title} ${book.author} ${book.category} ${
            book.description || ""
          }`,
        );

        const score = terms.reduce(
          (sum, term) => sum + (text.includes(term) ? 1 : 0),
          0,
        );

        return { book, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.book.title.localeCompare(b.book.title, "vi"),
      );

    const matches = ranked.filter((item) => item.score > 0);

    const fallback =
      terms.length > 0 && matches.length === 0 && ranked.length > 0;

    setResult({
      books: (matches.length > 0 ? matches : ranked)
        .slice(0, 4)
        .map((item) => item.book),
      fallback,
    });
  }

  return (
    <section className="reader-page" aria-label="Trợ lý tìm sách">
      <p className="reader-note">
        Bản demo gợi ý theo từ khóa và thể loại trong danh mục hiện có. Trang
        này chưa kết nối mô hình AI.
      </p>

      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>Hôm nay bạn muốn đọc gì?</h2>
        </div>

        <form className="reader-assistant-form" onSubmit={recommend}>
          <label className="reader-field">
            <span>Sở thích hoặc nội dung bạn quan tâm</span>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ví dụ: thói quen, tình yêu, giấc mơ..."
              rows={3}
              maxLength={500}
            />
          </label>

          <div className="reader-form-row">
            <label className="reader-field">
              <span>Thể loại</span>

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">Tất cả thể loại</option>

                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="reader-check">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
              />
              Chỉ sách còn sẵn
            </label>

            <button className="reader-button" type="submit">
              Gợi ý sách
            </button>
          </div>
        </form>
      </div>

      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>Gợi ý dành cho bạn</h2>
        </div>

        <p className="reader-status" role="status">
          {result === null
            ? "Nhập sở thích hoặc chọn thể loại để xem gợi ý."
            : result.books.length === 0
              ? "Không có sách phù hợp với bộ lọc. Thử thể loại khác nhé."
              : result.fallback
                ? "Chưa có sách khớp từ khóa. Đây là các sách khác phù hợp với bộ lọc bạn chọn."
                : `Có ${result.books.length} cuốn sách gợi ý.`}
        </p>

        {result && result.books.length > 0 && (
          <div className="reader-suggestion-grid">
            {result.books.map((book) => (
              <article className="reader-suggestion" key={book.id}>
                <button
                  className="reader-book-button"
                  type="button"
                  onClick={() => setSelectedBook(book)}
                  aria-label={`Xem chi tiết ${book.title}`}
                >
                  <span className="reader-suggestion-cover">
                    <BookCover book={book} />
                  </span>

                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                  <span>{book.category}</span>
                </button>

                <FavoriteButton
                  book={book}
                  isFavorite={favoriteIds.includes(book.id)}
                  onToggleFavorite={onToggleFavorite}
                  className="reader-suggestion-favorite"
                />
              </article>
            ))}
          </div>
        )}
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
