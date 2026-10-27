import { useLibrarySettings } from "../../ui/librarySettingsStore";
import { t } from "../../ui/settings.js";
import BotanicalDecor from "./BotanicalDecor";

import { hasPermission, PERMISSIONS as P } from "../../data/libraryPermissions";

import {
  Library,
  Compass,
  BookOpen,
  Heart,
  BookMarked,
  Sparkles,
  UserRound,
  Users,
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
    id: "authors",
    label: "Danh mục tác giả",
    icon: Users,
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
    id: "author-workspace",
    label: "Khu vực tác giả",
    icon: UserRound,
  },
  {
    id: "author-registration",
    label: "Đăng ký tác giả",
    icon: UserRound,
  },
  {
    id: "profile",
    label: "Hồ sơ của tôi",
    icon: UserRound,
  },
];

export default function Sidebar({ activePage, onNavigate, user }) {
  const settings = useLibrarySettings();

  const canUseAuthorWorkspace =
    user?.role === "author" && hasPermission(user, P.AUTHOR_WORKSPACE);

  const visibleMenuItems = menuItems.filter((item) => {
    if (item.id === "author-workspace") {
      return canUseAuthorWorkspace;
    }

    if (item.id === "author-registration") {
      return user?.role !== "author";
    }

    return true;
  });

  return (
    <aside className="sidebar">
      <BotanicalDecor placement="sidebar" />

      <button
        type="button"
        className="sidebar-brand"
        aria-label={`${settings.libraryName} — ${t("Khám phá")}`}
        title={settings.libraryName}
        onClick={() => onNavigate("discover")}
      >
        <span className="sidebar-brand-mark">
          <Library size={24} aria-hidden="true" />
        </span>

        <span className="sidebar-brand-text">
          <strong>{settings.libraryName}</strong>
          <small>{t("Thư viện của bạn")}</small>
        </span>
      </button>

      <nav className="sidebar-nav" aria-label={t("Điều hướng thư viện")}>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          const label = t(item.label);

          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-button ${isActive ? "is-active" : ""}`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              title={label}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />

              <span className="sidebar-label">{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
