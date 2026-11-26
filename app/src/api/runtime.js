const base = import.meta.env?.VITE_API_BASE_URL || "/api/v1";
let session;
try {
  session = JSON.parse(sessionStorage.getItem("cloudlibrary:access") || "null");
} catch {
  session = null;
}
export const accessToken = () => session?.accessToken || null;
export function setSession(value) {
  session = {
    accessToken: value.accessToken,
    expiresAt: Date.now() + (value.expiresIn || 3600) * 1000,
  };
  sessionStorage.setItem("cloudlibrary:access", JSON.stringify(session));
}
export function clearSession() {
  session = null;
  sessionStorage.removeItem("cloudlibrary:access");
}
let refreshing;
export async function request(
  path,
  {
    method = "GET",
    body,
    auth = true,
    idempotencyKey,
    signal,
    retry = true,
    query = {},
    responseType = "json",
    timeoutMs = 30000,
  } = {},
) {
  const headers = { Accept: "application/json" };
  if (auth && accessToken()) headers.Authorization = `Bearer ${accessToken()}`;
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response;
  try {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    }
    response = await fetch(base + path + (search.size ? `?${search}` : ""), {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      credentials: "same-origin",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (cause) {
    if (retry && idempotencyKey && !signal?.aborted) {
      return request(path, {
        method,
        body,
        auth,
        idempotencyKey,
        signal,
        retry: false,
        query, responseType, timeoutMs,
      });
    }
    const error = new Error(
      cause.name === "TimeoutError"
        ? "Máy chủ phản hồi chậm. Hãy thử lại."
        : "Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.",
      { cause },
    );
    error.code = "networkError";
    throw error;
  }
  if (
    response.status === 401 &&
    auth &&
    retry &&
    path !== "/auth/refresh" &&
    import.meta.env?.VITE_AUTH_MODE === "cognito"
  ) {
    refreshing ||= request("/auth/refresh", {
      method: "POST",
      auth: false,
      retry: false,
    })
      .then((value) => setSession(value))
      .finally(() => {
        refreshing = null;
      });
    await refreshing;
    return request(path, {
      method,
      body,
      auth,
      idempotencyKey,
      signal,
      retry: false,
      query, responseType, timeoutMs,
    });
  }
  if (response.ok && responseType === "blob") return response.blob();
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.message || "Chưa xử lý được yêu cầu.",
    );
    error.code = payload.error?.code || "serverError";
    error.status = response.status;
    error.requestId = payload.error?.requestId;
    throw error;
  }
  return payload;
}
export async function uploadFile(file, purpose = "content") {
  if (!file?.size || file.size > 20 * 1024 * 1024)
    throw new Error("Chọn tệp có dung lượng tối đa 20 MB.");
  const { capabilities } = await request("/health", { auth: false });
  if (capabilities.mode === "aws") {
    const upload = await request("/uploads", {
      method: "POST",
      body: { contentType: file.type, size: file.size, purpose },
    });
    const result = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "x-amz-server-side-encryption": "AES256",
      },
      body: file,
      credentials: "omit",
      signal: AbortSignal.timeout(120000),
    });
    if (!result.ok) throw new Error("Chưa tải được tệp. Hãy thử lại.");
    return request(`/uploads/${encodeURIComponent(upload.id)}/complete`, {
      method: "POST",
      body: {},
    });
  }
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  return request("/uploads", { method: "POST", body: form });
}
