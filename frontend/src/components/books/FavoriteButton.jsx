import { Heart } from "lucide-react";
import { t, useUiSettings } from "../../ui/settings";
import "./FavoriteButton.css";

export default function FavoriteButton({
  book,
  isFavorite,
  onToggleFavorite,
  className = "",
}) {
  useUiSettings();

  const label = t(
    isFavorite ? "Bỏ {{0}} khỏi yêu thích" : "Thêm {{0}} vào yêu thích",
    { 0: book.title },
  );

  return (
    <button
      type="button"
      className={`favorite-button ${isFavorite ? "is-saved" : ""} ${className}`}
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      onClick={() => onToggleFavorite(book.id)}
    >
      <Heart
        size={19}
        fill={isFavorite ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
