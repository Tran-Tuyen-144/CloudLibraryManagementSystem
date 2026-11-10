import { useEffect, useState } from "react";

export default function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);

      if (stored === null) return initialValue;

      const parsed = JSON.parse(stored);

      if (Array.isArray(initialValue)) {
        return Array.isArray(parsed) ? parsed : initialValue;
      }

      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { ...initialValue, ...parsed }
        : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Không thể lưu dữ liệu trên trình duyệt:", error);
    }
  }, [key, value]);

  return [value, setValue];
}
