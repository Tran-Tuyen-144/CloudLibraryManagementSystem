//File này quản lý chế độ màu, ngôn ngữ và hàm dịch t().

import { useSyncExternalStore } from "react";
import en from "./en.json";

const STORAGE_KEY = "cloudlibrary:ui-settings:v1";

const defaults = {
  theme: "dark",
  language: "vi",
};

const listeners = new Set();

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    return {
      theme: saved?.theme === "light" ? "light" : "dark",
      language: saved?.language === "en" ? "en" : "vi",
    };
  } catch {
    return defaults;
  }
}

let settings = readSettings();

function applyDocument() {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.lang = settings.language;
}

function subscribe(callback) {
  listeners.add(callback);

  return () => listeners.delete(callback);
}

function getSnapshot() {
  return settings;
}

export function useUiSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaults);
}

function updateSettings(next) {
  settings = {
    ...settings,
    ...next,
  };

  applyDocument();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Không lưu được tùy chọn giao diện:", error);
  }

  listeners.forEach((callback) => callback());
}

export function setTheme(theme) {
  if (theme === "dark" || theme === "light") {
    updateSettings({ theme });
  }
}

export function setLanguage(language) {
  if (language === "vi" || language === "en") {
    updateSettings({ language });
  }
}

export function getLocale() {
  return settings.language === "en" ? "en-US" : "vi-VN";
}

export function t(value, params = {}) {
  const descriptor = value && typeof value === "object" ? value : null;

  const key = String(descriptor?.key ?? value ?? "");

  const values = {
    ...(descriptor?.params || {}),
    ...params,
  };

  const normalized = key.replace(/\s+/g, " ").trim();

  const text = settings.language === "en" ? (en[normalized] ?? key) : key;

  return text.replace(/\{\{([^}]+)\}\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

applyDocument();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }

    settings = readSettings();
    applyDocument();
    listeners.forEach((callback) => callback());
  });
}
