
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { apiRequest } from "../api/client.js";

import {
  currentLibraryUser,
} from "../data/libraryData.js";

import {
  hasPermission,
  PERMISSIONS as P,
} from "../data/libraryPermissions.js";

import {
  flattenRequests,
} from "../ui/borrowWorkflow.js";

import {
  copyTotal,
  demoCopyCode,
  deriveDemoBookCopies,
  freezeLegacyCopySlots,
  maintenanceSlots,
} from "../ui/bookCopyInventory.js";

import {
  runLibraryCommand,
  useLibraryData,
} from "../ui/libraryStore.js";

export {
  demoCopyCode,
  deriveDemoBookCopies,
} from "../ui/bookCopyInventory.js";

const MODE =
  import.meta.env.VITE_BOOK_COPIES_SOURCE ===
  "api"
    ? "api"
    : "demo";

const EMPTY = [];

const VALID_STATUS = new Set([
  "available",
  "reserved",
  "borrowed",
  "held",
  "maintenance",
  "retired",
]);

function updateDemoCopy({
  id,
  bookId,
  slot,
  status,
}) {
  return runLibraryCommand(
    P.BOOKS_MANAGE,
    (state) => {
      if (
        ![
          "available",
          "maintenance",
        ].includes(status)
      ) {
        return {
          ok: false,
          error: "invalidStatus",
        };
      }

      const book = state.books.find(
        (item) => item.id === bookId,
      );

      if (
        !book ||
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= copyTotal(book) ||
        id !== demoCopyCode(bookId, slot)
      ) {
        return {
          ok: false,
          error: "notFound",
        };
      }

      const projected =
        deriveDemoBookCopies(
          [book],
          flattenRequests(
            state.requestsByEmail,
          ),
        );

      const current = projected.find(
        (copy) => copy.slot === slot,
      );

      if (
        !current ||
        ![
          "available",
          "maintenance",
        ].includes(current.status)
      ) {
        return {
          ok: false,
          error: "copyInUse",
        };
      }

      if (current.status === status) {
        return {
          ok: false,
          error: "alreadyUpdated",
        };
      }

      const slots =
        maintenanceSlots(book);

      if (status === "maintenance") {
        slots.add(slot);
      } else {
        slots.delete(slot);
      }

      const nextBook = {
        ...book,

        maintenanceCopySlots: [
          ...slots,
        ].sort((a, b) => a - b),
      };

      // Phải cố định các mã đang mượn
      // trước khi thay trạng thái bảo trì.
      const requestsByEmail =
        freezeLegacyCopySlots(
          state.requestsByEmail,
          bookId,
          projected,
        );

      return {
        ok: true,
        targetId: id,

        details: {
          operation: "copy.update",

          before: {
            code: id,
            bookId,
            status: current.status,
          },

          after: {
            code: id,
            bookId,
            status,
          },
        },

        state: {
          ...state,

          requestsByEmail,

          books: state.books.map(
            (item) =>
              item.id === bookId
                ? nextBook
                : item,
          ),
        },
      };
    },
  );
}

const demoAdapter = {
  update: updateDemoCopy,
};

const apiAdapter = {
  async list({
    signal,
  } = {}) {
    const response = await apiRequest(
      "/snapshot",
      {
        method: "GET",
        auth: true,
        signal,
      },
    );

    const data = response?.data;

    if (
      !Array.isArray(
        data?.bookCopies,
      )
    ) {
      const error = new Error(
        "API chưa trả về danh sách bản sách hợp lệ.",
      );

      error.code =
        "invalidResponse";

      throw error;
    }

    return {
      rows: data.bookCopies.filter(
        (item) =>
          item &&
          typeof item.id ===
            "string" &&
          typeof item.bookId ===
            "string" &&
          typeof item.code ===
            "string" &&
          VALID_STATUS.has(
            item.status,
          ),
      ),

      books: Array.isArray(
        data.books,
      )
        ? data.books
        : [],
    };
  },

  async update({
    id,
    status,
  }) {
    if (
      !id ||
      ![
        "available",
        "maintenance",
      ].includes(status)
    ) {
      return {
        ok: false,
        error: "invalidStatus",
      };
    }

    return apiRequest(
      "/commands",
      {
        method: "POST",
        auth: true,

        idempotencyKey:
          crypto.randomUUID(),

        body: {
          command: "copy.update",

          input: {
            id,
            status,
          },
        },
      },
    );
  },
};

export const bookCopiesService = {
  mode: MODE,

  async update(payload) {
    try {
      const result = await (
        MODE === "api"
          ? apiAdapter
          : demoAdapter
      ).update(payload);

      return result?.ok === false
        ? result
        : { ok: true };
    } catch (error) {
      return {
        ok: false,

        error:
          error?.code ||
          "networkError",

        message:
          error?.message ||
          "Không thể cập nhật bản sách.",
      };
    }
  },
};

export function useBookCopies() {
  const library = useLibraryData();

  const user =
    currentLibraryUser(library);

  const canRead =
    hasPermission(user, P.MANAGEMENT) &&
    hasPermission(user, P.CATALOG);

  const canMaintain =
    hasPermission(
      user,
      P.BOOKS_MANAGE,
    );

  const [
    revision,
    setRevision,
  ] = useState(0);

  const [
    remote,
    setRemote,
  ] = useState({
    rows: EMPTY,
    books: EMPTY,
    loading: MODE === "api",
    error: "",
  });

  const refresh =
    useCallback(() => {
      if (MODE === "api") {
        setRevision(
          (value) => value + 1,
        );
      }
    }, []);

  useEffect(() => {
    if (
      MODE !== "api" ||
      !canRead
    ) {
      return;
    }

    const controller =
      new AbortController();

    apiAdapter
      .list({
        signal:
          controller.signal,
      })
      .then((data) => {
        if (
          !controller.signal.aborted
        ) {
          setRemote({
            ...data,
            loading: false,
            error: "",
          });
        }
      })
      .catch((error) => {
        if (
          !controller.signal.aborted
        ) {
          setRemote({
            rows: EMPTY,
            books: EMPTY,
            loading: false,
            error:
              error.message,
          });
        }
      });

    return () =>
      controller.abort();
  }, [
    revision,
    canRead,
    user?.email,
  ]);

  return {
    rows: !canRead
      ? EMPTY
      : MODE === "api"
        ? remote.rows
        : deriveDemoBookCopies(
            library.books,
            flattenRequests(
              library.requestsByEmail,
            ),
          ),

    books:
      MODE === "api"
        ? remote.books
        : library.books,

    canRead,
    canMaintain,

    isDemo: MODE === "demo",

    loading:
      MODE === "api" &&
      remote.loading,

    error:
      MODE === "api"
        ? remote.error
        : "",

    refresh,
  };
}
