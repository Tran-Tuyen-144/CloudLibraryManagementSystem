import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

export default function BookCarousel({ books = [] }) {
  useUiSettings();

  const [activeIndex, setActiveIndex] = useState(() =>
    Math.floor(books.length / 2),
  );

  if (books.length === 0) return null;

  const currentIndex = activeIndex % books.length;
  const visibleCount = Math.min(7, books.length);
  const middle = Math.floor(visibleCount / 2);
  const activeBook = books[currentIndex];

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

  return (
    <section className="book-carousel">
      <div className="carousel-stage">
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
      </div>

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

      <p
        className="carousel-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeBook.title} — {activeBook.author}
      </p>
    </section>
  );
}
