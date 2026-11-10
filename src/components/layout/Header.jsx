import { Search, UserRound, LogIn, LogOut } from "lucide-react";
import UiControls from "./UiControls";
import NotificationCenter from "./NotificationCenter";
import { t, useUiSettings } from "../../ui/settings";
import { authMessages } from "../../ui/authMessages";
import "./Header.css";

export default function Header({
  title,
  searchTerm,
  onSearchTermChange,
  onSearch,
  onProfileClick,
  user,
  onLoginClick,
  onLogout,
  onOpenRequest,
}) {
  const { language } = useUiSettings();
  const copy = authMessages[language];

  function handleSubmit(event) {
    event.preventDefault();
    onSearch(searchTerm.trim());
  }

  return (
    <header className="header">
      <form
        className="header-search"
        role="search"
        aria-label={t("Tìm kiếm")}
        onSubmit={handleSubmit}
      >
        <button type="submit" aria-label={t("Tìm kiếm")}>
          <Search size={20} aria-hidden="true" />
        </button>

        <input
          type="search"
          name="search"
          placeholder={t("Tìm sách, tác giả...")}
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
        />
      </form>

      <h1 className="header-title" title={title}>
        {title}
      </h1>

      <div className="header-actions">
        <UiControls />

        <NotificationCenter
          key={user?.email || "guest"}
          user={user}
          onOpenRequest={onOpenRequest}
        />

        {user ? (
          <div className="header-user-controls">
            <button
              type="button"
              className="header-account-button"
              onClick={onProfileClick}
              aria-label={t("Hồ sơ của tôi")}
              title={user.email}
            >
              <UserRound size={19} aria-hidden="true" />

              <span className="header-account-name">
                {user.fullName}
              </span>
            </button>

            <button
              type="button"
              className="header-logout-button"
              onClick={onLogout}
              aria-label={copy.logout}
              title={copy.logout}
            >
              <LogOut size={19} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="header-login-button"
            onClick={onLoginClick}
          >
            <LogIn size={19} aria-hidden="true" />
            <span>{copy.login}</span>
          </button>
        )}
      </div>
    </header>
  );
}