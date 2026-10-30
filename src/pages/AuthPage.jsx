import { useEffect, useId, useRef, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Library,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";

import UiControls from "../components/layout/UiControls";
import { useLibrarySettings } from "../ui/librarySettingsStore";
import { useUiSettings } from "../ui/settings";
import { authMessages } from "../ui/authMessages";

import "./AuthPage.css";

export default function AuthPage({ onAuthenticate, onBack }) {
  const { language } = useUiSettings();
  const settings = useLibrarySettings();
  const copy = authMessages[language];

  const label = (vi, en) => (language === "en" ? en : vi);

  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = useRef(null);
  const formId = useId();

  const isRegister = mode === "register";
  const errorId = `${formId}-error`;

  useEffect(() => () => pending.current?.abort(), []);

  function changeMode() {
    if (busy) return;

    setMode(isRegister ? "login" : "register");
    setError("");
    setShowPassword(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (pending.current) return;

    const data = new FormData(event.currentTarget);

    const fullName = String(data.get("fullName") || "").trim();

    const email = String(data.get("email") || "").trim();

    const password = String(data.get("password") || "");

    const confirmPassword = String(data.get("confirmPassword") || "");

    if (isRegister && !fullName) {
      setError("emptyName");
      return;
    }

    if (password.length < 8) {
      setError("shortPassword");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("passwordMismatch");
      return;
    }

    setError("");

    const controller = new AbortController();

    pending.current = controller;
    setBusy(true);

    try {
      const result = await onAuthenticate({
        email,
        password,
        mode,
        fullName: isRegister ? fullName : "",
        signal: controller.signal,
      });

      if (!controller.signal.aborted && result?.ok === false) {
        setError(result.error);
      }
    } catch {
      if (!controller.signal.aborted) {
        setError("cryptoUnavailable");
      }
    } finally {
      pending.current = null;

      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  const fields = [
    ...(isRegister
      ? [
          {
            name: "fullName",
            title: copy.fullName,
            Icon: UserRound,
            type: "text",
            autoComplete: "name",
            maxLength: 100,
            placeholder: copy.namePlaceholder,
            invalid: error === "emptyName",
          },
        ]
      : []),

    {
      name: "email",
      title: copy.email,
      Icon: Mail,
      type: "email",
      autoComplete: "username",
      maxLength: 254,
      placeholder: label("Nhập địa chỉ email", "Enter your email address"),
      invalid: ["accountExists", "reservedAccount"].includes(error),
    },

    {
      name: "password",
      title: copy.password,
      Icon: LockKeyhole,
      type: showPassword ? "text" : "password",
      autoComplete: isRegister ? "new-password" : "current-password",
      minLength: 8,
      maxLength: 128,
      placeholder: label("Nhập mật khẩu", "Enter your password"),
      invalid: ["shortPassword", "invalidCredentials"].includes(error),
    },

    ...(isRegister
      ? [
          {
            name: "confirmPassword",
            title: copy.confirmPassword,
            Icon: LockKeyhole,
            type: showPassword ? "text" : "password",
            autoComplete: "new-password",
            minLength: 8,
            maxLength: 128,
            placeholder: copy.confirmPassword,
            invalid: error === "passwordMismatch",
          },
        ]
      : []),
  ];

  return (
    <section className="access-page" aria-label={copy.account}>
      <header className="access-topbar">
        <button
          className="access-brand"
          type="button"
          onClick={onBack}
          disabled={busy}
          aria-label={`${settings.libraryName} — ${copy.back}`}
        >
          <span className="access-brand-icon">
            <Library size={22} aria-hidden="true" />
          </span>

          <span>
            <strong>{settings.libraryName}</strong>

            <small>
              {label("Không gian tri thức của bạn", "Your space for discovery")}
            </small>
          </span>
        </button>

        <UiControls />
      </header>

      <div className="access-main">
        <div className="access-story">
          <p className="access-eyebrow">
            <Sparkles size={15} aria-hidden="true" />

            {label("KHÁM PHÁ CÙNG THƯ VIỆN", "DISCOVER YOUR NEXT CHAPTER")}
          </p>

          <h1>
            {label("Mở từng trang sách.", "Open a book.")}

            <span>
              {label("Chạm một thế giới mới.", "Discover a new world.")}
            </span>
          </h1>

          <p className="access-description">
            {label(
              "Những câu chuyện, ý tưởng và cảm hứng đang chờ bạn. Bắt đầu hành trình đọc theo cách của riêng mình.",
              "Stories, ideas and inspiration are waiting. Begin a reading journey that is entirely your own.",
            )}
          </p>

          <div className="access-features">
            <span>{label("Đọc online", "Read online")}</span>

            <span>{label("Mượn sách", "Borrow books")}</span>

            <span>{label("Trở thành tác giả", "Become an author")}</span>
          </div>
        </div>

        <div className="access-form-panel">
          <p className="access-eyebrow">
            {isRegister
              ? label("TẠO TÀI KHOẢN", "CREATE AN ACCOUNT")
              : label("CHÀO MỪNG TRỞ LẠI", "WELCOME BACK")}
          </p>

          <h2>{isRegister ? copy.registerTitle : copy.loginTitle}</h2>

          <p className="access-form-intro">
            {isRegister
              ? label(
                  "Điền thông tin để bắt đầu hành trình đọc.",
                  "Enter your details to start your reading journey.",
                )
              : label(
                  "Đăng nhập để tiếp tục những trang sách còn dang dở.",
                  "Sign in to pick up where you left off.",
                )}
          </p>

          <form
            key={mode}
            className="access-form"
            onSubmit={handleSubmit}
            onChange={() => error && setError("")}
            aria-busy={busy}
            aria-label={isRegister ? copy.register : copy.login}
          >
            <fieldset className="access-fields" disabled={busy}>
              {fields.map(({ name, title, Icon, invalid, ...input }) => {
                const id = `${formId}-${name}`;

                return (
                  <div className="access-field" key={name}>
                    <label htmlFor={id}>{title}</label>

                    <div
                      className={`access-input${
                        name === "password" ? " has-toggle" : ""
                      }`}
                    >
                      <Icon
                        className="access-field-icon"
                        size={17}
                        aria-hidden="true"
                      />

                      <input
                        {...input}
                        id={id}
                        name={name}
                        required
                        aria-invalid={invalid || undefined}
                        aria-describedby={
                          invalid
                            ? errorId
                            : name === "password"
                              ? `${formId}-hint`
                              : undefined
                        }
                      />

                      {name === "password" && (
                        <button
                          className="access-password-toggle"
                          type="button"
                          aria-label={
                            showPassword ? copy.hidePassword : copy.showPassword
                          }
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword((current) => !current)}
                        >
                          {showPassword ? (
                            <EyeOff size={17} aria-hidden="true" />
                          ) : (
                            <Eye size={17} aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>

                    {name === "password" && (
                      <small id={`${formId}-hint`}>{copy.passwordHint}</small>
                    )}
                  </div>
                );
              })}
            </fieldset>

            {error && (
              <p className="access-error" role="alert" id={errorId}>
                {copy[error] || copy.invalidCredentials}
              </p>
            )}

            <button className="access-submit" type="submit" disabled={busy}>
              {busy && (
                <LoaderCircle
                  className="access-spinner"
                  size={18}
                  aria-hidden="true"
                />
              )}

              <span>
                {busy
                  ? copy.signingIn
                  : isRegister
                    ? label("Tạo tài khoản", "Create account")
                    : copy.login}
              </span>

              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>

          <p className="access-switch">
            {isRegister
              ? label("Đã có tài khoản?", "Already have an account?")
              : label("Chưa có tài khoản?", "New to the library?")}{" "}
            <button type="button" onClick={changeMode} disabled={busy}>
              {isRegister ? copy.login : copy.register}
            </button>
          </p>

          <button
            className="access-back"
            type="button"
            onClick={onBack}
            disabled={busy}
          >
            <ArrowLeft size={15} aria-hidden="true" />

            {copy.back}
          </button>
        </div>
      </div>
    </section>
  );
}
