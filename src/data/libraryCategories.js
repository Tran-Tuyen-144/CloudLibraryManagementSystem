const defaults = [
  "Tiểu thuyết",
  "Truyện ngắn",
  "Truyện tranh",
  "Thiếu nhi",
  "Kỹ năng sống",
  "Tâm lý",
  "Kinh tế",
  "Công nghệ",
  "Khoa học",
  "Lịch sử",
  "Thơ",
  "Khác",
];

export const categoryName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

export const categoryKey = (value) =>
  categoryName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\bki (?=nang\b|thuat\b)/g, "ky ");

export function findCategory(categories = [], value) {
  const key = categoryKey(value);

  return key
    ? categories.find((item) =>
        [item.name, ...(item.aliases || [])].some(
          (name) => categoryKey(name) === key,
        ),
      )
    : undefined;
}

export function normalizeCategories(saved, books = [], manuscripts = []) {
  const result = [];

  function add(value, source = {}) {
    const name = categoryName(value);

    if (!name || name.length > 80 || findCategory(result, name)) {
      return;
    }

    const proposedId = typeof source.id === "string" ? source.id : "";

    result.push({
      id:
        proposedId && !result.some((item) => item.id === proposedId)
          ? proposedId
          : `category:${encodeURIComponent(categoryKey(name))}`,

      name,

      aliases: Array.isArray(source.aliases)
        ? source.aliases
            .map(categoryName)
            .filter(
              (alias) =>
                alias && alias.length <= 80 && !findCategory(result, alias),
            )
        : [],
    });
  }

  if (Array.isArray(saved)) {
    saved.forEach((item) => {
      if (item && typeof item.name === "string") {
        add(item.name, item);
      }
    });
  } else {
    defaults.forEach((name) => add(name));
  }

  // Đưa các thể loại trong dữ liệu cũ vào danh sách chung.
  [...books, ...manuscripts].forEach((item) => add(item.category));

  return result.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function categoryUsage(state, category) {
  const matches = (item) => findCategory([category], item.category);

  return {
    books: state.books.filter(matches).length,

    manuscripts: (state.authorManuscripts || []).filter(matches).length,
  };
}
