import { useEffect } from "react";
import { currentLibraryUser } from "../data/libraryData.js";
import { bookViewCount, recordBookView } from "../data/bookDiscovery.js";
import { updateLibrary, useLibraryData } from "../ui/libraryStore.js";

export default function useBookView(bookId, enabled = true) {
  const data = useLibraryData();
  const user = currentLibraryUser(data);

  const viewerKey = user ? `account:${user.email}` : "guest";
  const role = user?.role || "guest";

  useEffect(() => {
    if (!enabled) return;

    updateLibrary((state) => {
      const actor = currentLibraryUser(state);

      if (
        (state.session && !actor) ||
        (actor && !["reader", "author"].includes(actor.role))
      ) {
        return state;
      }

      const key = actor ? `account:${actor.email}` : "guest";

      return recordBookView(state, bookId, key);
    });
  }, [bookId, enabled, viewerKey, role]);

  return bookViewCount(data.books.find((book) => book.id === bookId));
}
