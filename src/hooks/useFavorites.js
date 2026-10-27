import { currentLibraryUser } from "../data/libraryData.js";
import { updateLibrary, useLibraryData } from "../ui/libraryStore.js";

export default function useFavorites() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  const favoriteIds = ["reader", "author"].includes(user?.role)
    ? data.favoriteIdsByEmail?.[user.email] || []
    : [];

  function toggleFavorite(bookId, ensureSaved = false) {
    updateLibrary((state) => {
      // Lấy tài khoản hiện tại ngay lúc thao tác.
      const actor = currentLibraryUser(state);

      if (!["reader", "author"].includes(actor?.role)) {
        return state;
      }
      const current = state.favoriteIdsByEmail?.[actor.email] || [];
      const isFavorite = current.includes(bookId);

      // Khi đăng nhập để lưu sách, giữ nguyên nếu sách đã được lưu.
      if (ensureSaved && isFavorite) return state;

      if (
        !isFavorite &&
        !state.books.some((book) => book.id === bookId && !book.archived)
      ) {
        return state;
      }

      return {
        ...state,

        favoriteIdsByEmail: {
          ...state.favoriteIdsByEmail,

          [actor.email]: isFavorite
            ? current.filter((id) => id !== bookId)
            : [...current, bookId],
        },
      };
    });
  }

  return { favoriteIds, toggleFavorite };
}
