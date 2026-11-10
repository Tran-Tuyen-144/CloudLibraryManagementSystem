import "./TopicBar.css";

export default function TopicBar({ categories, activeCategory, onChange }) {
  return (
    <div className="topic-bar" role="group" aria-label="Lọc sách theo chủ đề">
      <button
        type="button"
        className={`topic-tab ${activeCategory === "all" ? "is-active" : ""}`}
        aria-pressed={activeCategory === "all"}
        onClick={() => onChange("all")}
      >
        Tất cả
      </button>

      {categories.slice(0, 4).map((category) => (
        <button
          key={category}
          type="button"
          className={`topic-tab ${
            activeCategory === category ? "is-active" : ""
          }`}
          aria-pressed={activeCategory === category}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}

      <select
        className="topic-select"
        aria-label="Chọn thể loại sách"
        value={activeCategory}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">Thể loại</option>

        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  );
}
