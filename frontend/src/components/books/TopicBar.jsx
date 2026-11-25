import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t, useUiSettings } from "../../ui/settings";

import "./TopicBar.css";

export default function TopicBar({
  categories = [],
  activeCategory = "all",
  onChange,
}) {
  const { language } = useUiSettings();
  const listRef = useRef(null);

  const selected = categories.includes(activeCategory)
    ? activeCategory
    : "all";

  function scroll(direction) {
    const list = listRef.current;

    if (!list) return;

    list.scrollBy({
      left: direction * list.clientWidth * 0.75,
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div
      className="topic-strip"
      role="group"
      aria-label={t("Lọc sách theo chủ đề")}
    >
      <button
        type="button"
        className="topic-strip__arrow"
        onClick={() => scroll(-1)}
        aria-label={
          language === "en"
            ? "Scroll categories left"
            : "Cuộn thể loại sang trái"
        }
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>

      <div className="topic-strip__list" ref={listRef}>
        {["all", ...categories].map((category) => (
          <button
            key={category}
            type="button"
            className={`topic-strip__button ${
              selected === category ? "is-active" : ""
            }`}
            aria-pressed={selected === category}
            onClick={() => onChange(category)}
          >
            {t(category === "all" ? "Tất cả" : category)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="topic-strip__arrow"
        onClick={() => scroll(1)}
        aria-label={
          language === "en"
            ? "Scroll categories right"
            : "Cuộn thể loại sang phải"
        }
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}