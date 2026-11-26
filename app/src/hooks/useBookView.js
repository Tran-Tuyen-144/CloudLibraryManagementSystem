import { useEffect } from "react";
import { request } from "../api/runtime.js";
import { refreshLibrary, useLibraryData } from "../ui/libraryStore.js";
export default function useBookView(id, enabled = true) {
  const data = useLibraryData();
  useEffect(() => {
    if (!id || !enabled) return;
    const timer = setTimeout(() => {
      request(`/books/${encodeURIComponent(id)}/views`, { method: "POST" })
        .then(() => refreshLibrary())
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [id, enabled]);
  return data.books.find((b) => b.id === id)?.viewCount || 0;
}
