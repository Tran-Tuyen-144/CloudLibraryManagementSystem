export class ServiceError extends Error {
  constructor(code, message = code, status = 422, fields) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}
export function ensure(test, code, message, status = 422) {
  if (!test) throw new ServiceError(code, message, status);
}
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export const businessDay = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function addDays(day, count) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export const nowIso = () => new Date().toISOString();
export const activeStatuses = ["pending", "approved", "borrowed"];
export function fineAmount(loan, settings, at = businessDay()) {
  const end = loan.returnedAt ? businessDay(loan.returnedAt) : at;
  return (
    Math.max(
      0,
      Math.round((Date.parse(end) - Date.parse(loan.dueDate)) / 86400000),
    ) * (loan.dailyFineVnd ?? settings.dailyFineVnd ?? 5000)
  );
}
