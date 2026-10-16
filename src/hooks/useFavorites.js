import { useEffect, useState } from "react";

const STORAGE_KEY = "cloudlibrary:favorites:v1";

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(saved)) return [];

    return [...new Set(saved.filter((id) => typeof id === "string"))];
  } catch {
    return [];
  }
}

export default function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState(loadFavorites);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch (error) {
      console.warn("Không lưu được danh sách yêu thích:", error);
    }
  }, [favoriteIds]);

  function toggleFavorite(bookId) {
    setFavoriteIds((current) =>
      current.includes(bookId)
        ? current.filter((id) => id !== bookId)
        : [...current, bookId],
    );
  }

  return { favoriteIds, toggleFavorite };
}
