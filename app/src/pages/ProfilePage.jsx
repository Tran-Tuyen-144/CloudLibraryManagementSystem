import { useState } from "react";
import useStoredState from "../hooks/useStoredState";
import { profileStorageKey } from "../hooks/useDemoAuth";
import { t } from "../ui/settings";
import "./ReaderPages.css";

export default function ProfilePage({
  user,
  favoriteCount,
  onBrowseFavorites,
  onUpdateProfile,
  live = false,
  local,
}) {
  const [profile, setProfile] = useStoredState(
    profileStorageKey(user.email),
    {
      fullName: user.fullName,
      email: user.email,
      phone: live ? user.phone || "" : "",
      interest: live ? user.interest || "" : "",
    },
    { persist: !live },
  );

  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  async function changePassword(event) {
    event.preventDefault();
    if (passwordBusy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    if (values.get("password") !== values.get("confirmPassword")) {
      setPasswordMessage("Mật khẩu xác nhận không khớp.");
      return;
    }
    setPasswordBusy(true);
    try {
      await local.featureRequest("/auth/password", {
        method: "POST",
        body: {
          currentPassword: values.get("currentPassword"),
          password: values.get("password"),
        },
      });
      form.reset();
      setPasswordMessage("Đã đổi mật khẩu. Đăng xuất và đăng nhập lại.");
    } catch (e) {
      setPasswordMessage(e.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  function changeField(event) {
    const { name, value } = event.target;

    setDraft((current) => ({
      ...current,
      [name]: value,
    }));

    setMessage("");
  }

  async function saveProfile(event) {
    event.preventDefault();

    const fullName = draft.fullName.trim();

    if (!fullName) {
      setMessage({
        key: "Nhập họ tên trước khi lưu nhé.",
      });
      return;
    }

    const nextProfile = {
      fullName,
      email: user.email,
      phone: draft.phone.trim(),
      interest: draft.interest.trim(),
    };

    if (live) {
      const result = await onUpdateProfile(nextProfile);
      if (!result.ok) {
        setMessage({ key: "Không thể lưu hồ sơ. Vui lòng thử lại." });
        return;
      }
    } else {
      onUpdateProfile({ fullName });
    }
    setProfile(nextProfile);
    setDraft(nextProfile);

    setMessage({
      key: "Đã cập nhật hồ sơ.",
    });
  }

  function undoChanges() {
    setDraft(profile);

    setMessage({
      key: "Đã khôi phục thông tin đã lưu.",
    });
  }

  return (
    <section className="reader-page" aria-label={t("Hồ sơ của tôi")}>
      <div className="reader-profile-layout">
        <aside className="reader-panel reader-profile-summary">
          <span className="reader-avatar" aria-hidden="true">
            {(profile.fullName.trim()[0] || "B").toUpperCase()}
          </span>

          <h2>{profile.fullName || t("Bạn đọc")}</h2>

          <p>{user.email}</p>

          <span className="reader-badge">
            {t(user.role === "author" ? "Tác giả" : "Bạn đọc")}
          </span>

          <button
            className="reader-button reader-button-secondary"
            type="button"
            onClick={onBrowseFavorites}
          >
            {t("Sách yêu thích")} ({favoriteCount})
          </button>
        </aside>

        <div className="reader-panel">
          <div className="reader-panel-heading">
            <h2>{t("Thông tin cá nhân")}</h2>
          </div>

          <form className="reader-profile-form" onSubmit={saveProfile}>
            <label className="reader-field">
              <span>{t("Họ và tên")}</span>

              <input
                name="fullName"
                autoComplete="name"
                value={draft.fullName}
                onChange={changeField}
                maxLength={100}
                required
              />
            </label>

            <label className="reader-field">
              <span>{t("Email")}</span>

              <input name="email" type="email" value={user.email} readOnly />
            </label>

            <label className="reader-field">
              <span>{t("Số điện thoại")}</span>

              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                value={draft.phone}
                onChange={changeField}
                maxLength={30}
              />
            </label>

            <label className="reader-field">
              <span>{t("Chủ đề yêu thích")}</span>

              <input
                name="interest"
                value={draft.interest}
                onChange={changeField}
                placeholder={t("Nhập chủ đề yêu thích")}
                maxLength={150}
              />
            </label>

            <div className="reader-profile-actions">
              <button className="reader-button" type="submit">
                {t("Lưu thay đổi")}
              </button>

              <button
                className="reader-button reader-button-secondary"
                type="button"
                onClick={undoChanges}
              >
                {t("Hoàn tác")}
              </button>
            </div>
          </form>

          {local && (
            <form className="reader-profile-form" onSubmit={changePassword}>
              <h2>{t("Đổi mật khẩu")}</h2>
              {[
                ["currentPassword", "Mật khẩu hiện tại"],
                ["password", "Mật khẩu mới"],
                ["confirmPassword", "Xác nhận mật khẩu"],
              ].map(([name, label]) => (
                <label className="reader-field" key={name}>
                  <span>{t(label)}</span>
                  <input
                    type="password"
                    name={name}
                    required
                    minLength={name === "currentPassword" ? 1 : 10}
                    maxLength={128}
                    autoComplete={
                      name === "currentPassword"
                        ? "current-password"
                        : "new-password"
                    }
                  />
                </label>
              ))}
              <button className="reader-button" disabled={passwordBusy}>
                {t("Đổi mật khẩu")}
              </button>
              <p role="status">{passwordMessage}</p>
            </form>
          )}
          <p className="reader-status" role="status">
            {t(message)}
          </p>
        </div>
      </div>
    </section>
  );
}
