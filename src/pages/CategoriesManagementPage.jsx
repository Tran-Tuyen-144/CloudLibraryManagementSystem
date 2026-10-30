import { useState } from "react";

import { currentLibraryUser } from "../data/libraryData";

import { categoryKey, categoryUsage } from "../data/libraryCategories";

import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../data/categoryActions";

import { hasPermission, PERMISSIONS as P } from "../data/libraryPermissions";

import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";

import { useUiSettings } from "../ui/settings";

import "./ManagementModules.css";
import "./CategoriesManagementPage.css";

export default function CategoriesManagementPage() {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [replacementId, setReplacementId] = useState("");
  const [message, setMessage] = useState("");

  const errors = {
    invalidCategory: label(
      "Nhập tên thể loại từ 1 đến 80 ký tự.",
      "Enter a category name of 1 to 80 characters.",
    ),
    duplicateCategory: label(
      "Thể loại này đã tồn tại.",
      "This category already exists.",
    ),
    staleCategory: label(
      "Thể loại đã thay đổi. Hãy chọn lại thao tác.",
      "The category changed. Select the action again.",
    ),
    categoryInUse: label(
      "Chọn thể loại thay thế trước khi xóa.",
      "Choose a replacement category before deleting.",
    ),
    forbidden: label(
      "Bạn không có quyền quản lý thể loại.",
      "You cannot manage categories.",
    ),
  };

  if (!hasPermission(currentLibraryUser(data), P.CATEGORIES_MANAGE)) {
    return <p role="alert">{errors.forbidden}</p>;
  }

  const categories = data.categories || [];

  const rows = categories
    .filter((item) => categoryKey(item.name).includes(categoryKey(query)))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const usage = deleting ? categoryUsage(data, deleting) : null;

  function save(event) {
    event.preventDefault();

    const result = editing
      ? runLibraryCommand(P.CATEGORIES_MANAGE, (state) =>
          updateCategory(state, {
            id: editing.id,
            expectedName: editing.name,
            name,
          }),
        )
      : runLibraryCommand(P.CATEGORIES_CREATE, (state) =>
          createCategory(state, name),
        );

    setMessage(result.ok ? "saved" : result.error);

    if (result.ok) {
      setName("");
      setEditing(null);
    }
  }

  function remove() {
    const result = runLibraryCommand(P.CATEGORIES_MANAGE, (state) =>
      deleteCategory(state, {
        id: deleting.id,
        expectedName: deleting.name,
        replacementId,
      }),
    );

    setMessage(result.ok ? "deleted" : result.error);

    if (result.ok) {
      setDeleting(null);
      setReplacementId("");
    }
  }

  return (
    <section className="manage-module categories-page">
      <div className="manage-module-heading">
        <div>
          <h2>{label("Quản lý thể loại", "Manage categories")}</h2>

          <p>
            {label(
              "Danh sách thể loại dùng chung cho sách và bản thảo.",
              "Shared categories for books and manuscripts.",
            )}
          </p>
        </div>
      </div>

      <form className="manage-toolbar" onSubmit={save}>
        <label className="manage-field categories-name">
          <span>
            {editing
              ? label("Đổi tên thể loại", "Rename category")
              : label("Thể loại mới", "New category")}
          </span>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </label>

        <button className="loan-button is-primary" type="submit">
          {editing
            ? label("Lưu thay đổi", "Save changes")
            : label("Thêm thể loại", "Add category")}
        </button>

        {editing && (
          <button
            className="loan-button"
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            {label("Hủy", "Cancel")}
          </button>
        )}
      </form>

      <p
        role={errors[message] ? "alert" : "status"}
        className="manage-feedback"
      >
        {message === "saved"
          ? label("Đã lưu thể loại.", "Category saved.")
          : message === "deleted"
            ? label("Đã xóa thể loại.", "Category deleted.")
            : errors[message] ||
              (message
                ? label(
                    "Chưa thực hiện được thao tác.",
                    "Unable to complete this action.",
                  )
                : "")}
      </p>

      {deleting && (
        <div className="categories-delete">
          <h3>
            {label("Xóa thể loại", "Delete category")}: {deleting.name}
          </h3>

          <p>
            {usage.books} {label("sách", "books")} · {usage.manuscripts}{" "}
            {label("bản thảo", "manuscripts")}
          </p>

          {usage.books + usage.manuscripts > 0 && (
            <label className="manage-field">
              <span>{label("Chuyển sang thể loại", "Move to category")}</span>

              <select
                value={replacementId}
                onChange={(event) => setReplacementId(event.target.value)}
              >
                <option value="">
                  {label("Chọn thể loại thay thế", "Choose a replacement")}
                </option>

                {categories
                  .filter((item) => item.id !== deleting.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="manage-row-actions">
            <button
              className="loan-button"
              type="button"
              onClick={() => setDeleting(null)}
            >
              {label("Hủy", "Cancel")}
            </button>

            <button
              className="loan-button is-primary"
              type="button"
              onClick={remove}
              disabled={usage.books + usage.manuscripts > 0 && !replacementId}
            >
              {label("Xác nhận xóa", "Confirm deletion")}
            </button>
          </div>
        </div>
      )}

      <label className="manage-field categories-search">
        <span>{label("Tìm thể loại", "Search categories")}</span>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <ul className="categories-list">
        {rows.map((item) => {
          const count = categoryUsage(data, item);

          return (
            <li key={item.id}>
              <div>
                <strong>{item.name}</strong>

                <small>
                  {count.books} {label("sách", "books")} · {count.manuscripts}{" "}
                  {label("bản thảo", "manuscripts")}
                </small>
              </div>

              <div className="manage-row-actions">
                <button
                  className="loan-button"
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setName(item.name);
                    setDeleting(null);
                    setMessage("");
                  }}
                >
                  {label("Sửa", "Edit")}
                </button>

                <button
                  className="loan-button"
                  type="button"
                  onClick={() => {
                    setDeleting(item);
                    setReplacementId("");
                    setEditing(null);
                    setName("");
                    setMessage("");
                  }}
                >
                  {label("Xóa", "Delete")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!rows.length && (
        <p className="manage-empty">
          {label("Không có thể loại phù hợp.", "No matching categories.")}
        </p>
      )}
    </section>
  );
}
