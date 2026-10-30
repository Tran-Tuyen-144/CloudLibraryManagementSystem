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
}) {
  const [profile, setProfile] = useStoredState(profileStorageKey(user.email), {
    fullName: user.fullName,
    email: user.email,
    phone: "",
    interest: "",
  });

  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");

  function changeField(event) {
    const { name, value } = event.target;

    setDraft((current) => ({
      ...current,
      [name]: value,
    }));

    setMessage("");
  }

  function saveProfile(event) {
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

    setProfile(nextProfile);
    setDraft(nextProfile);
    onUpdateProfile({ fullName });

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

          <p className="reader-status" role="status">
            {t(message)}
          </p>
        </div>
      </div>
    </section>
  );
}
