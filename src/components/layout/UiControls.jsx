import { Sun, Moon, Languages } from "lucide-react";
import { useUiSettings, setTheme, setLanguage, t } from "../../ui/settings";

export default function UiControls() {
  const { theme, language } = useUiSettings();

  const nextTheme = theme === "dark" ? "light" : "dark";

  const label = t(
    theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối",
  );

  return (
    <div className="ui-controls">
      <button
        className="ui-theme-button"
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={label}
        title={label}
      >
        {theme === "dark" ? (
          <Sun size={17} aria-hidden="true" />
        ) : (
          <Moon size={17} aria-hidden="true" />
        )}

        <span>{t(theme === "dark" ? "Sáng" : "Tối")}</span>
      </button>

      <label className="ui-language-control">
        <Languages size={17} aria-hidden="true" />

        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label={t("Ngôn ngữ")}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  );
}
