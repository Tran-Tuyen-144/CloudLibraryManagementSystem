import { currentLibraryUser } from "../data/libraryData.js";
import { runLibraryCommand, useLibraryData } from "../ui/libraryStore.js";
export default function useFavorites() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);
  return {
    favoriteIds: data.favoriteIdsByEmail[user?.email] || [],
    toggleFavorite: (id, ensureSaved = false) =>
      runLibraryCommand("favorite.toggle", { id, ensureSaved }),
  };
}
