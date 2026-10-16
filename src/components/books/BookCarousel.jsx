import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
} from "lucide-react";

import { BookDetails } from "./HomeSections";
import { t, useUiSettings } from "../../ui/settings";
import "./BookCarousel.css";

function CarouselCover({ book }) {
  const [failedCover, setFailedCover] = useState(null);

  if (!book.cover || failedCover === book.cover) {
    return (
      <span className="carousel-cover-fallback">
        <strong>{book.title}</strong>
        <small>{book.author}</small>
      </span>
    );
  }

  return (
    <img
      className="carousel-cover-image"
      src={book.cover}
      alt={t("Bìa sách {{0}}", { 0: book.title })}
      draggable={false}
      onError={() => setFailedCover(book.cover)}
    />
  );
}

export default function BookCarousel({
  books = [],
  favoriteIds = [],
  onToggleFavorite,
  onBrowseCategory,
}) {
  const { language } = useUiSettings();

  const [activeIndex, setActiveIndex] = useState(() => {
    const index = books.findIndex((book) => book.id === "pride");

    return index >= 0 ? index : Math.floor(books.length / 2);
  });

  const [selectedBook, setSelectedBook] = useState(null);

  if (books.length === 0) return null;

  const currentIndex = activeIndex % books.length;
  const activeBook = books[currentIndex];

  const visibleCount = Math.min(7, books.length);
  const middle = Math.floor(visibleCount / 2);

  const categories = [
    ...new Set(books.map((book) => book.category).filter(Boolean)),
  ];

  const slides = Array.from({ length: visibleCount }, (_, position) => {
    const offset = position - middle;

    const index = (currentIndex + offset + books.length) % books.length;

    const distance = Math.abs(offset);

    return {
      book: books[index],
      index,
      offset,
      scale: 1 - distance * 0.13,
      opacity: 1 - distance * 0.17,
      depth: visibleCount - distance,
    };
  });

  function move(direction) {
    setActiveIndex(
      (current) => (current + direction + books.length) % books.length,
    );
  }

  function categoryLabel(category) {
    if (category === "Tài liệu mẫu" && language === "en") {
      return "Sample document";
    }

    return t(category);
  }

  return (
    <section className="book-carousel">
      <div className="carousel-stage">
        <div className="carousel-halo" aria-hidden="true" />

        {slides.map((slide) => (
          <button
            key={slide.book.id}
            type="button"
            className={
              "carousel-card" + (slide.offset === 0 ? " is-current" : "")
            }
            style={{
              "--offset": slide.offset,
              "--scale": slide.scale,
              "--opacity": slide.opacity,
              "--depth": slide.depth,
            }}
            aria-label={slide.book.title}
            aria-pressed={slide.offset === 0}
            onClick={() => setActiveIndex(slide.index)}
          >
            <CarouselCover book={slide.book} />
          </button>
        ))}

        <button
          type="button"
          className="carousel-arrow carousel-arrow-left"
          aria-label={t("Sách trước")}
          onClick={() => move(-1)}
          disabled={books.length < 2}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="carousel-arrow carousel-arrow-right"
          aria-label={t("Sách tiếp theo")}
          onClick={() => move(1)}
          disabled={books.length < 2}
        >
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </div>

      <div className="carousel-details">
        <h2>{activeBook.title}</h2>

        <p>{activeBook.author}</p>

        <button
          type="button"
          className="carousel-details-button"
          onClick={() => setSelectedBook(activeBook)}
        >
          {t("Xem chi tiết")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      {onBrowseCategory && (
        <div
          className="carousel-topics"
          role="group"
          aria-label={t("Lọc sách theo chủ đề")}
        >
          <button
            type="button"
            className="carousel-topic is-active"
            onClick={() => onBrowseCategory("all")}
          >
            <Grid2X2 size={15} aria-hidden="true" />
            {t("Tất cả")}
          </button>

          {categories.slice(0, 4).map((category) => (
            <button
              key={category}
              type="button"
              className="carousel-topic"
              onClick={() => onBrowseCategory(category)}
            >
              <BookOpen size={15} aria-hidden="true" />
              {categoryLabel(category)}
            </button>
          ))}
        </div>
      )}

      <p
        className="carousel-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeBook.title} — {activeBook.author}
      </p>

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
