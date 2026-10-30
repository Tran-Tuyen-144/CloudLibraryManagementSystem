import { useId, useState } from "react";

import { categoryKey, findCategory } from "../../data/libraryCategories";

import { createCategory } from "../../data/categoryActions";
import { currentLibraryUser } from "../../data/libraryData";

import { hasPermission, PERMISSIONS as P } from "../../data/libraryPermissions";

import {
  getLibrarySnapshot,
  runLibraryCommand,
  useLibraryData,
} from "../../ui/libraryStore";

import { useUiSettings } from "../../ui/settings";

import "./CategoryInput.css";

export default function CategoryInput({
  defaultValue = "",
  className = "reader-field",
}) {
  const data = useLibraryData();
  const { language } = useUiSettings();

  const label = (vi, en) => (language === "en" ? en : vi);

  const id = useId();

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const categories = data.categories || [];
  const exact = findCategory(categories, value);

  const matches = categories
    .filter((item) =>
      [item.name, ...(item.aliases || [])].some((name) =>
        categoryKey(name).includes(categoryKey(value)),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    .slice(0, 6);

  const canCreate = hasPermission(
    currentLibraryUser(data),
    P.CATEGORIES_CREATE,
  );

  function add() {
    const result = runLibraryCommand(P.CATEGORIES_CREATE, (state) =>
      createCategory(state, value),
    );

    const chosen = findCategory(getLibrarySnapshot().categories, value);

    if (result.ok || (result.error === "duplicateCategory" && chosen)) {
      setValue(chosen.name);
      setOpen(false);
      setMessage("saved");
    } else {
      setMessage(result.error);
    }
  }

  return (
    <div
      className={`${className} category-control`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <label htmlFor={id}>{label("Thể loại", "Category")}</label>

      <input
        id={id}
        name="category"
        value={value}
        maxLength={80}
        required
        autoComplete="off"
        placeholder={label(
          "Nhập để tìm hoặc thêm thể loại",
          "Type to find or add a category",
        )}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setMessage("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && matches.length > 0 && (
        <div
          className="category-suggestions"
          role="group"
          aria-label={label("Gợi ý thể loại", "Category suggestions")}
        >
          {matches.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setValue(item.name);
                setOpen(false);
                setMessage("");
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {canCreate && value.trim() && !exact && (
        <button type="button" className="category-add" onClick={add}>
          {label("Thêm thể loại", "Add category")}: {value.trim()}
        </button>
      )}

      {message && (
        <small role="status">
          {message === "saved"
            ? label("Đã chọn thể loại.", "Category selected.")
            : message === "invalidCategory"
              ? label(
                  "Tên thể loại cần từ 1 đến 80 ký tự.",
                  "Category names must contain 1 to 80 characters.",
                )
              : label(
                  "Chưa thêm được thể loại. Kiểm tra lại tài khoản.",
                  "Unable to add the category. Check your account.",
                )}
        </small>
      )}
    </div>
  );
}
