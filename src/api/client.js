export class ApiError extends Error {
  constructor(code, message, { status = 0, field } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

function buildUrl(baseUrl, path, query = {}) {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[?#]/.test(path)
  ) {
    throw new ApiError(
      "invalidRequest",
      "Đường dẫn API không hợp lệ.",
    );
  }

  const params = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (
        item === undefined ||
        item === null ||
        item === ""
      ) {
        continue;
      }

      params.append(name, String(item));
    }
  }

  const search = params.toString();

  return (
    `${baseUrl.replace(/\/+$/, "")}${path}` +
    (search ? `?${search}` : "")
  );
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };

    const onAbort = () =>
      finish(reject, new Error("aborted"));

    signal.addEventListener("abort", onAbort, {
      once: true,
    });

    if (signal.aborted) onAbort();

    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

const statusCodes = {
  400: "invalidRequest",
  401: "loginRequired",
  403: "forbidden",
  404: "notFound",
  409: "staleRequest",
  422: "invalidInput",
  429: "rateLimited",
};

export function createApiClient({
  baseUrl = "/api/v1",
  getAccessToken = () => null,
  timeoutMs = 15000,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  return async function request(
    path,
    {
      method = "GET",
      query = {},
      body,
      signal,
      auth = true,
      headers = {},
      idempotencyKey,
      responseType = "json",
      timeoutMs: requestTimeout = timeoutMs,
    } = {},
  ) {
    if (
      !Number.isFinite(requestTimeout) ||
      requestTimeout <= 0 ||
      requestTimeout > 120000
    ) {
      throw new ApiError(
        "invalidRequest",
        "Thời gian chờ API không hợp lệ.",
      );
    }

    if (!["json", "blob"].includes(responseType)) {
      throw new ApiError(
        "invalidRequest",
        "Kiểu phản hồi không hợp lệ.",
      );
    }

    if (signal?.aborted) {
      throw new ApiError(
        "cancelled",
        "Đã hủy yêu cầu.",
      );
    }

    const url = buildUrl(baseUrl, path, query);
    const controller = new AbortController();
    const cancel = () => controller.abort();

    signal?.addEventListener("abort", cancel, {
      once: true,
    });

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeout);

    async function perform() {
      const requestHeaders = new Headers(headers);

      requestHeaders.delete("Authorization");

      if (!requestHeaders.has("Accept")) {
        requestHeaders.set("Accept", "application/json");
      }

      if (auth) {
        let token;

        try {
          token = await getAccessToken({
            signal: controller.signal,
          });
        } catch {
          throw new ApiError(
            "loginRequired",
            "Không thể xác nhận phiên đăng nhập.",
            { status: 401 },
          );
        }

        if (
          typeof token !== "string" ||
          !token.trim()
        ) {
          throw new ApiError(
            "loginRequired",
            "Vui lòng đăng nhập trước khi tiếp tục.",
            { status: 401 },
          );
        }

        requestHeaders.set(
          "Authorization",
          `Bearer ${token}`,
        );
      }

      if (controller.signal.aborted) {
        throw new ApiError(
          "cancelled",
          "Đã hủy yêu cầu.",
        );
      }

      if (body !== undefined) {
        requestHeaders.set(
          "Content-Type",
          "application/json",
        );
      }

      if (idempotencyKey) {
        requestHeaders.set(
          "Idempotency-Key",
          idempotencyKey,
        );
      }

      const response = await fetchImpl(url, {
        method: method.toUpperCase(),
        headers: requestHeaders,
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });

      if (response.ok && responseType === "blob") {
        return response.blob();
      }

      if (response.ok && response.status === 204) {
        return null;
      }

      const raw = await response.text();
      let payload;

      try {
        payload = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new ApiError(
            "invalidResponse",
            "API trả về dữ liệu không đúng định dạng JSON.",
            { status: response.status },
          );
        }
      }

      if (!response.ok) {
        const error = payload?.error;

        throw new ApiError(
          typeof error?.code === "string"
            ? error.code
            : statusCodes[response.status] || "serverError",
          typeof error?.message === "string"
            ? error.message
            : `Yêu cầu API thất bại (HTTP ${response.status}).`,
          {
            status: response.status,
            field:
              typeof error?.field === "string"
                ? error.field
                : undefined,
          },
        );
      }

      return payload;
    }

    try {
      return await abortable(
        perform(),
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError(
          timedOut ? "timeout" : "cancelled",
          timedOut
            ? "API phản hồi quá lâu. Vui lòng thử lại."
            : "Đã hủy yêu cầu.",
        );
      }

      if (error instanceof ApiError) throw error;

      throw new ApiError(
        "networkError",
        "Không thể kết nối đến API.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  };
}

let tokenProvider = () => null;

export function setAccessTokenProvider(provider) {
  if (
    provider !== null &&
    typeof provider !== "function"
  ) {
    throw new TypeError(
      "Token provider must be a function or null.",
    );
  }

  tokenProvider = provider || (() => null);
}

export const apiRequest = createApiClient({
  baseUrl:
    import.meta.env?.VITE_API_BASE_URL?.trim() ||
    "/api/v1",

  getAccessToken: (context) => tokenProvider(context),
});