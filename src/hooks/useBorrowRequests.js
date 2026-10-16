import useStoredState from "./useStoredState";

const STORAGE_KEY = "cloudlibrary:demo-requests-by-email:v1";

export default function useBorrowRequests(email) {
  const accountKey = (email || "").trim().toLowerCase();

  const [requestsByEmail, setRequestsByEmail] = useStoredState(STORAGE_KEY, {});

  const requests = Array.isArray(requestsByEmail[accountKey])
    ? requestsByEmail[accountKey]
    : [];

  function checkRequest(book) {
    if (!accountKey) return "loginRequired";
    if (!book) return "invalidBook";
    if (!(book.availableCopies > 0)) return "unavailable";

    const pending = requests.filter((request) => request.status === "pending");

    if (pending.some((request) => request.bookId === book.id)) {
      return "duplicate";
    }

    return pending.length >= 3 ? "limit" : "";
  }

  function createRequest(book, note = "") {
    const error = checkRequest(book);

    if (error) {
      return {
        ok: false,
        error,
      };
    }

    const request = {
      id: crypto.randomUUID(),
      bookId: book.id,
      title: book.title,
      createdAt: new Date().toISOString(),
      status: "pending",
      note: note.trim().slice(0, 300),
    };

    setRequestsByEmail((current) => {
      const saved = Array.isArray(current[accountKey])
        ? current[accountKey]
        : [];

      const pending = saved.filter((item) => item.status === "pending");

      const hasDuplicate = pending.some((item) => item.bookId === book.id);

      if (pending.length >= 3 || hasDuplicate) {
        return current;
      }

      return {
        ...current,
        [accountKey]: [request, ...saved],
      };
    });

    return { ok: true };
  }

  function cancelRequest(requestId) {
    if (!accountKey) return;

    setRequestsByEmail((current) => {
      const saved = Array.isArray(current[accountKey])
        ? current[accountKey]
        : [];

      return {
        ...current,
        [accountKey]: saved.map((request) =>
          request.id === requestId && request.status === "pending"
            ? {
                ...request,
                status: "cancelled",
                cancelledAt: new Date().toISOString(),
              }
            : request,
        ),
      };
    });
  }

  return {
    requests,
    createRequest,
    cancelRequest,
  };
}
