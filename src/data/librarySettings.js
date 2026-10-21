export const DEFAULT_LIBRARY_SETTINGS = Object.freeze({
  maxActiveLoans: 3,
  loanDays: 14,
  libraryName: "Cloud Library",
  address: "",
  contactEmail: "",
  phone: "",
  openingHours: "",
});

export const LIBRARY_TEXT_LIMITS = Object.freeze({
  libraryName: 80,
  address: 250,
  contactEmail: 254,
  phone: 30,
  openingHours: 160,
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{3,29}$/;

const validPhone = (value) =>
  phonePattern.test(value) &&
  (value.match(/\d/g) || []).length >= 4;

const policyNumber = (value) =>
  ["string", "number"].includes(typeof value)
    ? Number(value)
    : NaN;

const validInteger = (value, max) =>
  Number.isInteger(value) &&
  value >= 1 &&
  value <= max;

const text = (value) =>
  typeof value === "string" ? value.trim() : "";

export function normalizeLibrarySettings(input = {}) {
  const source =
    input && typeof input === "object" ? input : {};

  const result = { ...DEFAULT_LIBRARY_SETTINGS };

  if (validInteger(source.maxActiveLoans, 20)) {
    result.maxActiveLoans = source.maxActiveLoans;
  }

  if (validInteger(source.loanDays, 60)) {
    result.loanDays = source.loanDays;
  }

  for (const [key, max] of Object.entries(LIBRARY_TEXT_LIMITS)) {
    const value = text(source[key]);

    if (
      value.length <= max &&
      (key !== "libraryName" || value)
    ) {
      result[key] = value;
    }
  }

  if (
    result.contactEmail &&
    !emailPattern.test(result.contactEmail)
  ) {
    result.contactEmail = "";
  }

  if (result.phone && !validPhone(result.phone)) {
    result.phone = "";
  }

  return result;
}

export function validateLibrarySettings(input = {}) {
  input =
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
      ? input
      : {};

  const maxActiveLoans = policyNumber(input.maxActiveLoans);
  const loanDays = policyNumber(input.loanDays);

  if (
    !validInteger(maxActiveLoans, 20) ||
    !validInteger(loanDays, 60)
  ) {
    return {
      ok: false,
      error: "invalidPolicy",
      field: !validInteger(maxActiveLoans, 20)
        ? "maxActiveLoans"
        : "loanDays",
    };
  }

  const settings = { maxActiveLoans, loanDays };

  for (const [key, max] of Object.entries(LIBRARY_TEXT_LIMITS)) {
    settings[key] = text(input[key]);

    if (
      (key === "libraryName" && !settings[key]) ||
      settings[key].length > max
    ) {
      return {
        ok: false,
        error: "invalidLibraryInfo",
        field: key,
      };
    }
  }

  if (
    settings.contactEmail &&
    !emailPattern.test(settings.contactEmail)
  ) {
    return {
      ok: false,
      error: "invalidContact",
      field: "contactEmail",
    };
  }

  if (settings.phone && !validPhone(settings.phone)) {
    return {
      ok: false,
      error: "invalidContact",
      field: "phone",
    };
  }

  return { ok: true, settings };
}