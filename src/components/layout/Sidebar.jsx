import { t } from "../../ui/settings.js";
import {
  Library,
  Compass,
  BookOpen,
  Heart,
  BookMarked,
  Sparkles,
  UserRound,
} from "lucide-react";
import "./Sidebar.css";
const menuItems = [
  {
    id: "discover",
    label: "Khám phá",
    icon: Compass,
  },
  {
    id: "catalog",
    label: "Danh mục sách",
    icon: BookOpen,
  },
  {
    id: "favorites",
    label: "Sách yêu thích",
    icon: Heart,
  },
  {
    id: "loans",
    label: "Sách đang mượn",
    icon: BookMarked,
  },
  {
    id: "ai",
    label: "Trợ lý AI",
    icon: Sparkles,
  },
  {
    id: "profile",
    label: "Hồ sơ của tôi",
    icon: UserRound,
  },
];
export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-brand"
        aria-label="Cloud Library — về trang khám phá"
        title="Cloud Library"
        onClick={() => onNavigate("discover")}
      >
        <span className="sidebar-brand-mark">
          <Library size={24} aria-hidden="true" />
        </span>

        <span className="sidebar-brand-text">
          <strong>Cloud Library</strong>
          <small>{t("Thư viện của bạn")}</small>
        </span>
      </button>

      <nav className="sidebar-nav" aria-label="Điều hướng thư viện">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-button ${isActive ? "is-active" : ""}`}
              aria-label={t(item.label)}
              aria-current={isActive ? "page" : undefined}
              title={t(item.label)}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />

              <span className="sidebar-label">{t(item.label)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
