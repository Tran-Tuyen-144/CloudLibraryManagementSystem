import {
  refreshLibrary,
  runLibraryCommand,
  useConnection,
  useLibraryData,
} from "../ui/libraryStore.js";

const emailKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export const reservationService = {
  mode: "api",
  isDemo: false,
  canReserveBook: (book) =>
    Boolean(
      book &&
      !book.archived &&
      book.physicalEnabled !== false &&
      Number(book.availableCopies) === 0 &&
      Number(book.totalCopies ?? 0) > 0,
    ),
  getPosition: (_rows, reservation) =>
    Number.isInteger(reservation?.position) ? reservation.position : null,
  create: ({ book }) =>
    runLibraryCommand("reservation.create", { bookId: book?.id }),
  cancel: ({ id }) => runLibraryCommand("reservation.cancel", { id }),
  // Creating a request does not claim that the physical book has been handed over.
  requestPickup: ({ bookId }) =>
    runLibraryCommand("loan.create", { bookId, note: "Nhận sách đặt trước" }),
};

export function useReservations({ readerEmail = "", all = false } = {}) {
  const library = useLibraryData();
  const connection = useConnection();
  const allRows = library.reservations;
  return {
    rows: all
      ? allRows
      : allRows.filter(
          (row) => emailKey(row.readerEmail) === emailKey(readerEmail),
        ),
    allRows,
    refresh: refreshLibrary,
    isDemo: false,
    loading: connection.loading,
    error: connection.error || "",
  };
}
