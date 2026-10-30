import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Library,
  LogOut,
  ShieldCheck,
  Users,
  UserCog,
  History,
  LogIn,
  Settings,
} from "lucide-react";
import AuthorApplicationsPage from "./AuthorApplicationsPage";
import CategoriesManagementPage from "./CategoriesManagementPage";
import ManuscriptReviewPage from "./ManuscriptReviewPage";
import UiControls from "../components/layout/UiControls";
import LibrarianPage from "./LibrarianPage";
import PermissionPage from "./PermissionPage";
import ManagementModules from "./ManagementModules";
import HistoryPage from "./HistoryPage";
import StatisticsPage from "./StatisticsPage";
import LibrarySettingsPage from "./LibrarySettingsPage";
import { useLibrarySettings } from "../ui/librarySettingsStore";
import { MANAGEMENT_PAGES, managementVisit } from "../data/libraryHistory";
import { updateLibrary } from "../ui/libraryStore";
import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";
import { useUiSettings } from "../ui/settings";

import "./LoanWorkspace.css";
import "./ManagementPage.css";

const messages = {
  vi: {
    manuscripts: "Duyệt tác phẩm",
    categories: "Thể loại",
    authors: "Duyệt tác giả",
    area: "KHU VỰC QUẢN TRỊ",
    overview: "Tổng quan",
    settings: "Cài đặt thư viện",
    books: "Kho sách",
    readersPage: "Độc giả",
    staff: "Nhân sự",
    permissions: "Quyền tài khoản",
    audit: "Lịch sử thao tác",
    access: "Lịch sử truy cập",
    forbidden: "Bạn không có quyền mở chức năng này.",
    loans: "Quản lý mượn trả",
    role: "Thủ thư",
    admin: "Quản trị viên",
    logout: "Đăng xuất",
    navigation: "Điều hướng quản trị",
    newPassword: "Cấp mật khẩu mới (không bắt buộc)",

newPasswordHint:
  "Để trống để giữ mật khẩu hiện tại. Nhập 8–128 ký tự để cấp lại mật khẩu cho tài khoản này.",
  },
  en: {
    newPassword: "Set a new password (optional)",

newPasswordHint:
  "Leave blank to keep the current password. Enter 8–128 characters to set a new password for this account.",
    manuscripts: "Manuscript reviews",
    categories: "Categories",
    authors: "Author applications",
    area: "MANAGEMENT AREA",
    overview: "Overview",
    settings: "Library settings",
    books: "Book inventory",
    readersPage: "Readers",
    staff: "Staff",
    permissions: "Account permissions",
    audit: "Activity history",
    access: "Access history",
    forbidden: "You do not have permission to open this function.",
    loans: "Loan management",
    role: "Librarian",
    admin: "Administrator",
    logout: "Sign out",
    navigation: "Management navigation",
  },
};

export default function ManagementPage({
  user,
  books,
  requests,
  onProcess,
  onCreateDemo,
  onLogout,
}) {
  const { language, theme } = useUiSettings();
  const copy = messages[language];
  const settings = useLibrarySettings();

  const [page, setPage] = useState("overview");
  const [initialTab, setInitialTab] = useState("pending");
  const entered = useRef(false);

  useEffect(() => {
    if (entered.current) return;

    entered.current = true;
    updateLibrary((state) => managementVisit(state, "overview"));
  }, []);

  function openPage(nextPage) {
    updateLibrary((state) => managementVisit(state, nextPage));
    setPage(nextPage);
  }

  function openLoans(tab = "pending") {
    setInitialTab(tab);
    openPage("loans");
  }

  return (
    <div className="management-app" data-theme={theme} lang={language}>
      <aside className="management-sidebar">
        <div className="management-brand">
          <span>
            <Library size={25} aria-hidden="true" />
          </span>

          <div>
            <strong>{settings.libraryName}</strong>
            <small>{copy.area}</small>
          </div>
        </div>

        <nav className="management-nav" aria-label={copy.navigation}>
          {[
            {
              id: "overview",
              permission: P.DASHBOARD,
              Icon: LayoutDashboard,
            },
            {
              id: "loans",
              permission: P.LOANS_READ,
              Icon: ClipboardList,
            },
            {
              id: "books",
              permission: P.CATALOG,
              Icon: BookOpen,
            },
            {
              id: "readersPage",
              permission: P.READERS_READ,
              Icon: Users,
            },
            {
              id: "authors",
              permission: P.AUTHORS_REVIEW,
              Icon: UserCog,
            },
            {
              id: "manuscripts",
              permission: P.MANUSCRIPTS_REVIEW,
              Icon: BookOpen,
            },
            {
              id: "categories",
              permission: P.CATEGORIES_MANAGE,
              Icon: BookOpen,
            },
            {
              id: "staff",
              permission: P.ACCOUNTS_MANAGE,
              Icon: UserCog,
            },
            {
              id: "audit",
              permission: P.AUDIT_OWN,
              Icon: History,
            },
            {
              id: "access",
              permission: P.ACCESS_OWN,
              Icon: LogIn,
            },
            {
              id: "settings",
              permission: P.SETTINGS_MANAGE,
              Icon: Settings,
            },
            {
              id: "permissions",
              permission: P.PERMISSIONS_OWN,
              Icon: ShieldCheck,
            },
          ]
            .filter((item) => hasPermission(user, item.permission))
            .map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={page === id ? "page" : undefined}
                onClick={() => (id === "loans" ? openLoans() : openPage(id))}
              >
                <Icon size={19} aria-hidden="true" />
                {copy[id]}
              </button>
            ))}
        </nav>

        <div className="management-account">
          <span>{user.role === "admin" ? copy.admin : copy.role}</span>
          <strong>{user.fullName}</strong>
          <small>{user.email}</small>

          <button type="button" onClick={onLogout}>
            <LogOut size={17} aria-hidden="true" />
            {copy.logout}
          </button>
        </div>
      </aside>

      <div className="management-body">
        <header className="management-header">
          <div>
            <small>{copy.area}</small>
            <h1>{copy[page]}</h1>
          </div>

          <UiControls />
        </header>

        <main className="management-main">
          {!hasPermission(user, MANAGEMENT_PAGES[page]) ? (
            <p role="alert">{copy.forbidden}</p>
          ) : page === "categories" ? (
            <CategoriesManagementPage />
          ) : page === "manuscripts" ? (
            <ManuscriptReviewPage />
          ) : page === "authors" ? (
            <AuthorApplicationsPage />
          ) : page === "settings" ? (
            <LibrarySettingsPage />
          ) : ["audit", "access"].includes(page) ? (
            <HistoryPage key={page} kind={page} />
          ) : ["books", "readersPage", "staff"].includes(page) ? (
            <ManagementModules
              key={page}
              kind={page === "readersPage" ? "readers" : page}
            />
          ) : page === "permissions" ? (
            <PermissionPage user={user} />
          ) : page === "overview" ? (
            <StatisticsPage onOpenLoans={openLoans} />
          ) : (
            <LibrarianPage
              key={initialTab}
              books={books}
              requests={requests}
              onProcess={onProcess}
              onCreateDemo={
                hasPermission(user, P.DEMO_SEED) ? onCreateDemo : undefined
              }
              initialTab={initialTab}
              embedded
            />
          )}
        </main>
      </div>
    </div>
  );
}
