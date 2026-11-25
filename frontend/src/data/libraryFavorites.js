export const LEGACY_FAVORITES_KEY = "cloudlibrary:favorites:v1";

function normalizeIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === "string" && id.trim()))]
    : [];
}

export function normalizeFavoriteLists(value, legacyIds = [], accounts = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([email, ids]) => email.includes("@") && Array.isArray(ids))
        .map(([email, ids]) => [email.trim().toLowerCase(), normalizeIds(ids)]),
    );
  }

  // Danh sách cũ không ghi chủ sở hữu.
  // Chỉ tự chuyển khi xác định được một tài khoản bạn đọc duy nhất.
  // Khóa lưu dữ liệu cũ vẫn được giữ nguyên.
  const readers = accounts.filter((account) =>
    ["reader", "author"].includes(account.role),
  );
  const ids = normalizeIds(legacyIds);

  return readers.length === 1 && ids.length ? { [readers[0].email]: ids } : {};
}
