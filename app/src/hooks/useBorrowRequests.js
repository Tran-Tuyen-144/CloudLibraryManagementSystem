import { currentLibraryUser } from "../data/libraryData.js";
import { availableBooks, flattenRequests } from "../ui/borrowWorkflow.js";
import { runLibraryCommand, useLibraryData } from "../ui/libraryStore.js";
export default function useBorrowRequests() {
  const data = useLibraryData();
  const user = currentLibraryUser(data);
  const rows = flattenRequests(data.requestsByEmail);
  const allBooks = availableBooks(data.books, rows);
  const processRequest = (values) =>
    runLibraryCommand("loan.action", {
      ...values,
      version: rows.find((r) => r.id === values.id)?.version,
    });
  return {
    books: allBooks.filter((b) => !b.archived),
    allBooks,
    requests: rows.filter((r) => r.readerEmail === user?.email),
    allRequests: ["admin", "librarian"].includes(user?.role) ? rows : [],
    createRequest: (book, note) =>
      runLibraryCommand("loan.create", { bookId: book?.id, note }),
    cancelRequest: (id) => processRequest({ id, action: "cancel" }),
    processRequest,
    createDemoRequests: () =>
      Promise.resolve({ ok: false, error: "demoDisabled" }),
  };
}
