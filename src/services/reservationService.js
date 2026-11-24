
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { apiRequest } from "../api/client.js";

import {
  useDemoReservationRows,
  canReserveDemoBook,
  queuePosition,
  createDemoReservation,
  cancelDemoReservation,
  markDemoReservationReady,
  collectDemoReservation,
  expireDemoReservations,
} from "../ui/reservationDemoStore.js";

const MODE =
  import.meta.env.VITE_RESERVATION_SOURCE === "api"
    ? "api"
    : "demo";

const EMPTY = [];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeResult(result) {
  if (result?.ok === false) {
    return {
      ok: false,
      error: result.error || "serverError",
      message: result.message || "",
    };
  }

  return {
    ok: true,
    data: result?.data ?? null,
    count: result?.count,
  };
}

async function execute(action, payload) {
  try {
    return normalizeResult(
      await adapter[action](payload),
    );
  } catch (error) {
    return {
      ok: false,
      error: error?.code || "networkError",
      message:
        error?.message ||
        "Không thực hiện được yêu cầu.",
    };
  }
}

const demoAdapter = {
  async create(payload) {
    return createDemoReservation(payload);
  },

  async cancel(payload) {
    return cancelDemoReservation(payload);
  },

  async markReady(payload) {
    return markDemoReservationReady(payload);
  },

  async collect(payload) {
    return collectDemoReservation(payload);
  },

  async expire(payload) {
    return expireDemoReservations(payload);
  },
};

// Phần API được chuẩn bị theo cấu trúc trong ZIP.
// Chưa dùng cho đến khi kết nối BE + xác thực thật.
const apiAdapter = {
  async list({ signal } = {}) {
    const response = await apiRequest("/snapshot", {
      method: "GET",
      signal,
      auth: true,
    });

    const rows = response?.data?.reservations;

    if (!Array.isArray(rows)) {
      const error = new Error(
        "API chưa trả về danh sách đặt trước hợp lệ.",
      );

      error.code = "invalidResponse";
      throw error;
    }

    return rows.filter(
      (row) =>
        row &&
        typeof row.id === "string" &&
        typeof row.bookId === "string" &&
        typeof row.readerEmail === "string" &&
        typeof row.status === "string",
    );
  },

  async create({ book }) {
    if (!book?.id) {
      return { ok: false, error: "invalidBook" };
    }

    return apiRequest("/commands", {
      method: "POST",
      auth: true,
      idempotencyKey: crypto.randomUUID(),
      body: {
        command: "reservation.create",
        input: { bookId: book.id },
      },
    });
  },

  async cancel({ id }) {
    if (!id) {
      return { ok: false, error: "notFound" };
    }

    return apiRequest("/commands", {
      method: "POST",
      auth: true,
      idempotencyKey: crypto.randomUUID(),
      body: {
        command: "reservation.cancel",
        input: { id },
      },
    });
  },

  async markReady() {
    return {
      ok: false,
      error: "managedByBackend",
      message:
        "Backend quản lý việc phân bổ bản sách khi có sách trả.",
    };
  },

  async collect() {
    return {
      ok: false,
      error: "notImplemented",
      message:
        "Cần tích hợp quy trình bàn giao và tạo phiếu mượn của Backend.",
    };
  },

  async expire() {
    return {
      ok: false,
      error: "managedByBackend",
      message:
        "Backend chịu trách nhiệm xử lý thời hạn giữ sách.",
    };
  },
};

const adapter =
  MODE === "api" ? apiAdapter : demoAdapter;

export const reservationService = {
  mode: MODE,
  isDemo: MODE === "demo",

  canReserveBook: canReserveDemoBook,

  getPosition(rows, reservation) {
    if (MODE === "api") {
      const position = Number(
        reservation?.queuePosition ??
          reservation?.position,
      );

      return Number.isInteger(position) &&
        position > 0
        ? position
        : null;
    }

    return queuePosition(rows, reservation);
  },

  create(payload) {
    return execute("create", payload);
  },

  cancel(payload) {
    return execute("cancel", payload);
  },

  markReady(payload) {
    return execute("markReady", payload);
  },

  collect(payload) {
    return execute("collect", payload);
  },

  expire(payload) {
    return execute("expire", payload);
  },
};

export function useReservations({
  readerEmail = "",
  all = false,
} = {}) {
  const demoRows = useDemoReservationRows();

  const [apiState, setApiState] = useState({
    rows: EMPTY,
    loading: MODE === "api",
    error: "",
  });

  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    if (MODE === "api") {
      setRevision((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    if (MODE !== "api") return;

    const controller = new AbortController();

    apiAdapter
      .list({ signal: controller.signal })
      .then((rows) => {
        if (controller.signal.aborted) return;

        setApiState({
          rows,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;

        setApiState({
          rows: EMPTY,
          loading: false,
          error:
            error?.message ||
            "Không tải được yêu cầu đặt trước.",
        });
      });

    return () => controller.abort();
  }, [readerEmail, revision]);

  const allRows =
    MODE === "demo" ? demoRows : apiState.rows;

  const email = normalizeEmail(readerEmail);

  const rows = all
    ? allRows
    : allRows.filter(
        (item) =>
          normalizeEmail(item.readerEmail) === email,
      );

  return {
    rows,
    allRows,
    refresh,
    isDemo: MODE === "demo",
    loading: MODE === "api" && apiState.loading,
    error: MODE === "api" ? apiState.error : "",
  };
}
