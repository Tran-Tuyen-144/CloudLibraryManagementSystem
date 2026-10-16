import { useState } from "react";
import { Library, Eye, EyeOff } from "lucide-react";
import { useUiSettings } from "../ui/settings";
import { authMessages } from "../ui/authMessages";
import "./AuthPage.css";

export default function AuthPage({ onAuthenticate, onBack }) {
  const { language } = useUiSettings();
  const copy = authMessages[language];

  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setShowPassword(false);
  }

  function handleSubmit(event) {
    event.preventDefault();

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

    onAuthenticate({
      email,
      fullName: isRegister ? fullName : "",
    });
  }

  return (
    <section className="auth-page" aria-label={copy.account}>
      <div className="auth-card">
        <div className="auth-logo" aria-hidden="true">
          <Library size={28} />
        </div>

        <h2>{isRegister ? copy.registerTitle : copy.loginTitle}</h2>

        <p className="auth-subtitle">{copy.subtitle}</p>

        <div className="auth-tabs" role="group" aria-label={copy.account}>
          <button
            type="button"
            aria-pressed={!isRegister}
            className={!isRegister ? "is-active" : ""}
            onClick={() => changeMode("login")}
          >
            {copy.login}
          </button>

          <button
            type="button"
            aria-pressed={isRegister}
            className={isRegister ? "is-active" : ""}
            onClick={() => changeMode("register")}
          >
            {copy.register}
          </button>
        </div>

        <form key={mode} className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="auth-field">
              <span>{copy.fullName}</span>

              <input
                name="fullName"
                autoComplete="name"
                placeholder={copy.namePlaceholder}
                maxLength={100}
                required
              />
            </label>
          )}

          <label className="auth-field">
            <span>{copy.email}</span>

            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              maxLength={254}
              required
            />
          </label>

          <label className="auth-field">
            <span>{copy.password}</span>

            <span className="auth-password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={8}
                required
              />

              <button
                className="auth-password-toggle"
                type="button"
                aria-label={
                  showPassword ? copy.hidePassword : copy.showPassword
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </span>

            <small>{copy.passwordHint}</small>
          </label>

          {isRegister && (
            <label className="auth-field">
              <span>{copy.confirmPassword}</span>

              <input
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {copy[error]}
            </p>
          )}

          <button className="auth-submit" type="submit">
            {isRegister ? copy.register : copy.login}
          </button>
        </form>

        <p className="auth-demo-note">{copy.demoNote}</p>

        <button className="auth-back" type="button" onClick={onBack}>
          {copy.back}
        </button>
      </div>
    </section>
  );
}
