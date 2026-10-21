import { useId, useState } from "react";
import { Building2, Save } from "lucide-react";

import { currentLibraryUser } from "../data/libraryData";

import {
  LIBRARY_TEXT_LIMITS,
  validateLibrarySettings,
} from "../data/librarySettings";

import {
  hasPermission,
  PERMISSIONS as P,
} from "../data/libraryPermissions";

import { useLibraryData } from "../ui/libraryStore";

import {
  saveLibrarySettings,
  useLibrarySettings,
} from "../ui/librarySettingsStore";

import { useUiSettings } from "../ui/settings";
import "./LibrarySettingsPage.css";

const messages = {
  vi: {
    title: "Cài đặt thư viện",
    intro: "Quản lý quy định mượn sách và thông tin nơi nhận sách.",
    policy: "Quy định mượn trả",
    info: "Thông tin thư viện",
    pickup: "Thông tin nhận sách",

    maxActiveLoans: "Giới hạn phiếu mỗi độc giả",
    loanDays: "Số ngày mượn mặc định",

    limitHint:
      "Từ 1 đến 20. Tính cả phiếu chờ duyệt, chờ nhận và đang mượn.",

    daysHint:
      "Từ 1 đến 60 ngày. Dùng để gợi ý hạn trả khi mở phiếu bàn giao.",

    applies:
      "Cấu hình áp dụng cho yêu cầu mới và gợi ý hạn trả khi bàn giao. Hạn trả đã lưu và các phiếu cũ được giữ nguyên.",

    libraryName: "Tên thư viện",
    address: "Địa chỉ nhận sách",
    contactEmail: "Email liên hệ",
    phone: "Điện thoại",
    openingHours: "Giờ phục vụ",

    optional:
      "Các thông tin liên hệ có thể để trống. Nội dung đã nhập sẽ hiển thị ở trang mượn sách.",

    save: "Lưu cài đặt",
    reset: "Hủy thay đổi",
    saved: "Đã lưu cài đặt thư viện.",
    unsaved: "Có thay đổi chưa lưu.",
    current: "Đang dùng cấu hình đã lưu.",
    reload: "Tải cấu hình mới",

    settingsConflict:
      "Cài đặt đã được cập nhật ở phiên khác. Tải cấu hình mới trước khi sửa tiếp.",

    invalidPolicy:
      "Giới hạn phiếu phải là số nguyên từ 1–20; số ngày mượn từ 1–60.",

    invalidLibraryInfo:
      "Kiểm tra tên thư viện và độ dài thông tin đã nhập.",

    invalidContact:
      "Kiểm tra email hoặc số điện thoại liên hệ.",

    forbidden:
      "Chỉ quản trị viên được thay đổi cài đặt thư viện.",

    loginRequired: "Vui lòng đăng nhập lại.",
  },

  en: {
    title: "Library settings",
    intro: "Manage borrowing rules and book collection details.",
    policy: "Borrowing rules",
    info: "Library information",
    pickup: "Book collection information",

    maxActiveLoans: "Active record limit per reader",
    loanDays: "Default loan duration",

    limitHint:
      "From 1 to 20. Includes pending requests, pickup reservations and active loans.",

    daysHint:
      "From 1 to 60 days. Suggests a due date when opening a handover form.",

    applies:
      "Settings apply to new requests and suggested handover due dates. Saved due dates and existing records remain unchanged.",

    libraryName: "Library name",
    address: "Collection address",
    contactEmail: "Contact email",
    phone: "Phone",
    openingHours: "Opening hours",

    optional:
      "Contact fields are optional. Entered details will appear on the borrowing page.",

    save: "Save settings",
    reset: "Discard changes",
    saved: "Library settings saved.",
    unsaved: "You have unsaved changes.",
    current: "Using saved settings.",
    reload: "Load latest settings",

    settingsConflict:
      "Settings changed in another session. Load the latest settings before editing again.",

    invalidPolicy:
      "Use an integer record limit of 1–20 and a loan duration of 1–60 days.",

    invalidLibraryInfo:
      "Check the library name and field lengths.",

    invalidContact:
      "Check the contact email or phone number.",

    forbidden:
      "Only administrators can change library settings.",

    loginRequired: "Please sign in again.",
  },
};

export function LibraryInfo() {
  const { language } = useUiSettings();
  const copy = messages[language];
  const settings = useLibrarySettings();

  return (
    <aside
      className="library-info"
      aria-label={copy.pickup}
    >
      <h2>
        <Building2 size={19} aria-hidden="true" />
        {copy.pickup}
      </h2>

      <strong>{settings.libraryName}</strong>

      <dl>
        {[
          "address",
          "openingHours",
          "contactEmail",
          "phone",
        ]
          .filter((key) => settings[key])
          .map((key) => (
            <div key={key}>
              <dt>{copy[key]}</dt>
              <dd>{settings[key]}</dd>
            </div>
          ))}
      </dl>
    </aside>
  );
}

export default function LibrarySettingsPage() {
  const formId = useId();
  const { language } = useUiSettings();
  const copy = messages[language];

  const data = useLibraryData();
  const settings = useLibrarySettings();

  const [base, setBase] = useState(() => settings);
  const [draft, setDraft] = useState(() => settings);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const conflict =
    JSON.stringify(settings) !== JSON.stringify(base);

  const validation = validateLibrarySettings(draft);

  const dirty =
    JSON.stringify(
      validation.ok ? validation.settings : draft,
    ) !== JSON.stringify(base);

  function reload() {
    setBase(settings);
    setDraft(settings);
    setNotice("");
    setError("");
  }

  function change(name, value) {
    setDraft((current) => ({
      ...current,
      [name]: value,
    }));

    setNotice("");
    setError("");
  }

  function submit(event) {
    event.preventDefault();

    const result = saveLibrarySettings(draft, base);

    if (!result.ok) {
      setError(result.error);

      if (result.field) {
        event.currentTarget.elements
          .namedItem(result.field)
          ?.focus();
      }

      return;
    }

    const next = validateLibrarySettings(draft).settings;

    setBase(next);
    setDraft(next);
    setError("");
    setNotice("saved");
  }

  if (
    !hasPermission(
      currentLibraryUser(data),
      P.SETTINGS_MANAGE,
    )
  ) {
    return <p role="alert">{copy.forbidden}</p>;
  }

  return (
    <section
      className="library-settings loan-workspace"
      aria-label={copy.title}
    >
      <div className="library-settings-heading">
        <h2>
          <Building2 size={24} aria-hidden="true" />
          {copy.title}
        </h2>
        <p>{copy.intro}</p>
      </div>

      <p className="library-settings-note">
        {copy.applies}
      </p>

      {conflict && (
        <div
          className="library-settings-conflict"
          role="alert"
        >
          <p>{copy.settingsConflict}</p>

          <button
            type="button"
            className="loan-button"
            onClick={reload}
          >
            {copy.reload}
          </button>
        </div>
      )}

      <form onSubmit={submit}>
        <fieldset className="library-settings-panel">
          <legend>{copy.policy}</legend>

          <div className="library-settings-grid">
            {["maxActiveLoans", "loanDays"].map((name) => (
              <label
                className="library-settings-field"
                key={name}
              >
                <span>{copy[name]}</span>

                <input
                  name={name}
                  aria-label={copy[name]}
                  aria-describedby={`${formId}-${name}-hint`}
                  type="number"
                  min={1}
                  max={name === "maxActiveLoans" ? 20 : 60}
                  step={1}
                  value={draft[name]}
                  onChange={(event) =>
                    change(name, event.target.value)
                  }
                  required
                />

                <small id={`${formId}-${name}-hint`}>
                  {
                    copy[
                      name === "maxActiveLoans"
                        ? "limitHint"
                        : "daysHint"
                    ]
                  }
                </small>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="library-settings-panel">
          <legend>{copy.info}</legend>

          <p className="library-settings-muted">
            {copy.optional}
          </p>

          <div className="library-settings-grid">
            {Object.entries(LIBRARY_TEXT_LIMITS).map(
              ([name, max]) => (
                <label
                  className={`library-settings-field ${
                    [
                      "libraryName",
                      "address",
                      "openingHours",
                    ].includes(name)
                      ? "is-wide"
                      : ""
                  }`}
                  key={name}
                >
                  <span>{copy[name]}</span>

                  <input
                    name={name}
                    type={
                      name === "contactEmail"
                        ? "email"
                        : name === "phone"
                          ? "tel"
                          : "text"
                    }
                    maxLength={max}
                    required={name === "libraryName"}
                    value={draft[name]}
                    onChange={(event) =>
                      change(name, event.target.value)
                    }
                  />
                </label>
              ),
            )}
          </div>
        </fieldset>

        {error && (
          <p
            className="library-settings-error"
            role="alert"
          >
            {copy[error] || copy.invalidLibraryInfo}
          </p>
        )}

        <div className="library-settings-actions">
          <span role="status">
            {copy[notice] ||
              (dirty ? copy.unsaved : copy.current)}
          </span>

          <button
            type="button"
            className="loan-button"
            onClick={reload}
            disabled={!dirty && !conflict}
          >
            {copy.reset}
          </button>

          <button
            type="submit"
            className="loan-button is-primary"
            disabled={!dirty || conflict}
          >
            <Save size={17} aria-hidden="true" />
            {copy.save}
          </button>
        </div>
      </form>
    </section>
  );
}