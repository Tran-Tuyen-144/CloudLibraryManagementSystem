import { useState } from "react";
import {
  BookOpen,
  Library,
} from "lucide-react";

import CatalogPage from "./CatalogPage";
import useApiCatalog from "../hooks/useApiCatalog";
import UiControls from "../components/layout/UiControls";
import BotanicalDecor from "../components/layout/BotanicalDecor";

import {
  useUiSettings,
  t,
} from "../ui/settings";

import "../App.css";
import "../GalaxyTheme.css";
import "../components/layout/BotanicalTheme.css";
import "../components/layout/Sidebar.css";
import "../components/layout/Header.css";
import "./ApiCatalogPage.css";

const initialFilters = {
  category: "all",
  availability: "all",
  sort: "title-asc",
};

const messages = {
  vi: {
    note: "Danh mục đang ở chế độ chỉ xem.",
    error:
      "Không thể tải danh mục sách. Vui lòng thử lại.",
    moreError:
      "Chưa tải được trang tiếp theo. Các sách đã tải vẫn được giữ lại.",
    more: "Xem thêm sách",
    loading: "Đang tải…",
    retry: "Thử lại",
  },

  en: {
    note: "The catalog is currently read-only.",
    error:
      "The catalog could not be loaded. Please try again.",
    moreError:
      "The next page could not be loaded. Previously loaded books are still available.",
    more: "Load more books",
    loading: "Loading…",
    retry: "Try again",
  },
};

export default function ApiCatalogPage() {
  const { theme, language } = useUiSettings();
  const copy = messages[language];

  const [searchTerm, setSearchTerm] =
    useState("");

  const [filters, setFilters] =
    useState(initialFilters);

  const catalog = useApiCatalog({
    q: searchTerm,
    ...filters,
  });

  function reset() {
    setSearchTerm("");
    setFilters(initialFilters);
  }

  return (
    <div
      className="app-layout galaxy-theme api-catalog"
      data-theme={theme}
      lang={language}
    >
      <aside className="sidebar">
        <BotanicalDecor placement="sidebar" />

        <button
          type="button"
          className="sidebar-brand"
          onClick={reset}
          aria-label="Cloud Library"
        >
          <span className="sidebar-brand-mark">
            <Library
              size={24}
              aria-hidden="true"
            />
          </span>

          <span className="sidebar-brand-text">
            <strong>Cloud Library</strong>
            <small>
              {t("Thư viện của bạn")}
            </small>
          </span>
        </button>

        <nav
          className="sidebar-nav"
          aria-label={t("Danh mục sách")}
        >
          <button
            type="button"
            className="sidebar-button is-active"
            aria-current="page"
            onClick={reset}
            title={t("Danh mục sách")}
          >
            <BookOpen
              size={21}
              aria-hidden="true"
            />

            <span className="sidebar-label">
              {t("Danh mục sách")}
            </span>
          </button>
        </nav>
      </aside>

      <main className="main-content botanical-main">
        <header className="header api-catalog-header">
          <h1 className="header-title">
            {t("Danh mục sách")}
          </h1>

          <div className="header-actions">
            <UiControls />
          </div>
        </header>

        <p className="api-catalog-note">
          {copy.note}
        </p>

        <CatalogPage
          books={catalog.items}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={reset}
          remote
          loading={catalog.loading}
          errorMessage={
            catalog.error ? copy.error : ""
          }
          onRetry={catalog.reload}
          totalCount={catalog.total}
        />

        {catalog.moreError && (
          <p
            className="api-catalog-more-error"
            role="alert"
          >
            {copy.moreError}
          </p>
        )}

        {catalog.nextCursor &&
          !catalog.loading &&
          !catalog.error && (
            <div className="api-catalog-pagination">
              <button
                type="button"
                className="catalog-reset"
                disabled={catalog.loadingMore}
                onClick={catalog.loadMore}
              >
                {catalog.loadingMore
                  ? copy.loading
                  : catalog.moreError
                    ? copy.retry
                    : copy.more}
              </button>
            </div>
          )}
      </main>
    </div>
  );
}