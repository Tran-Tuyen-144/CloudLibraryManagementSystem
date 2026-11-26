import { currentLibraryUser } from "../data/libraryData.js";
import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions.js";
import {
  refreshLibrary,
  runLibraryCommand,
  useConnection,
  useLibraryData,
} from "../ui/libraryStore.js";

export const bookCopiesService = {
  mode: "api",
  update: ({ id, status }) => runLibraryCommand("copy.update", { id, status }),
};

export function useBookCopies() {
  const library = useLibraryData();
  const connection = useConnection();
  const user = currentLibraryUser(library);
  const canRead =
    hasPermission(user, P.MANAGEMENT) && hasPermission(user, P.CATALOG);
  return {
    rows: canRead ? library.bookCopies : [],
    books: library.books,
    canRead,
    canMaintain: hasPermission(user, P.BOOKS_MANAGE),
    isDemo: false,
    loading: connection.loading,
    error: connection.error || "",
    refresh: refreshLibrary,
  };
}
