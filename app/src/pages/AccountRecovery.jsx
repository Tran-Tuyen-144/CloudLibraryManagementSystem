import { useEffect, useId, useRef, useState } from "react";
import { Mail, LockKeyhole } from "lucide-react";
import { useUiSettings } from "../ui/settings";
import UiControls from "../components/layout/UiControls";
import "./AuthPage.css";

// Integration seam: the real auth controller supplies onConfirm({email, code, signal})
// and handles success/navigation. No fake confirmation or network call in demo.
export default function AccountRecovery({
  email: initialEmail = "",
  onConfirm,
  onBack,
}) {
  const { language } = useUiSettings();
  const vi = language !== "en";
  const id = useId();
  const pending = useRef(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => pending.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || typeof onConfirm !== "function") return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await onConfirm({
        email: email.trim(),
        code: code.trim(),
        signal: controller.signal,
      });
      if (!controller.signal.aborted && result?.ok !== true) setError("failed");
    } catch {
      if (!controller.signal.aborted) setError("failed");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="access-page access-recovery"
      aria-labelledby={`${id}-title`}
    >
      <header className="access-topbar">
        <UiControls />
      </header>
      <div className="access-main access-recovery-main">
        <div className="access-form-panel">
          <h2 id={`${id}-title`}>{vi ? "Xác minh email" : "Verify email"}</h2>
          <p className="access-recovery-description">
            {vi
              ? "Nhập email và mã xác minh đã nhận."
              : "Enter your email and verification code."}
          </p>
          <form className="access-form" onSubmit={submit}>
            <div className="access-field">
              <label htmlFor={`${id}-email`}>Email</label>
              <div className="access-input">
                <Mail
                  className="access-field-icon"
                  size={17}
                  aria-hidden="true"
                />
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            <div className="access-field">
              <label htmlFor={`${id}-code`}>
                {vi ? "Mã xác minh" : "Verification code"}
              </label>
              <div className="access-input">
                <LockKeyhole
                  className="access-field-icon"
                  size={17}
                  aria-hidden="true"
                />
                <input
                  id={`${id}-code`}
                  name="code"
                  autoComplete="one-time-code"
                  required
                  maxLength={128}
                  value={code}
                  disabled={busy}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
            </div>
            {typeof onConfirm !== "function" && (
              <p role="status" className="access-error">
                {vi
                  ? "Chưa kết nối dịch vụ xác minh email."
                  : "Email verification service is not connected."}
              </p>
            )}
            {error && (
              <p role="alert" className="access-error">
                {vi
                  ? "Không xác minh được email. Kiểm tra mã và thử lại."
                  : "Could not verify email. Check the code and try again."}
              </p>
            )}
            <button
              className="access-submit"
              type="submit"
              disabled={busy || typeof onConfirm !== "function"}
            >
              {busy
                ? vi
                  ? "Đang xác minh…"
                  : "Verifying…"
                : vi
                  ? "Xác minh email"
                  : "Verify email"}
            </button>
          </form>
          <button
            className="access-back"
            type="button"
            disabled={busy || !onBack}
            onClick={onBack}
          >
            {vi ? "Quay lại đăng nhập" : "Back to sign in"}
          </button>
        </div>
      </div>
    </section>
  );
}
