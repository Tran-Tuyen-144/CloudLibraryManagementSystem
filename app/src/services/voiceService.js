import { request as apiRequest } from "../api/runtime.js";
import { readerChapters } from "../data/readerContent.js";

const MODE = import.meta.env.VITE_VOICE_SOURCE === "api" ? "api" : "demo";

const MAX_TEXT = 6000;

export function browserCanSpeak() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function textFromLibraryBook(book) {
  if (!book || book.archived) return "";

  const chapters = readerChapters(book);

  if (chapters.length) {
    return chapters
      .map((chapter) => `${chapter.title}\n${chapter.content}`.trim())
      .join("\n\n")
      .slice(0, MAX_TEXT);
  }

  // Demo chỉ dùng mô tả công khai.
  // Không tự tải hoặc đọc PDF có quyền truy cập riêng.
  return String(book.description || "")
    .trim()
    .slice(0, MAX_TEXT);
}

function validAudioUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value, window.location.href);

    return (
      (url.protocol === "https:" ||
        (url.protocol === "http:" && url.origin === window.location.origin)) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export const voiceService = {
  mode: MODE,
  maxTextLength: MAX_TEXT,

  stopSpeaking() {
    if (browserCanSpeak()) {
      window.speechSynthesis.cancel();
    }
  },

  async speak({
    text,
    language = "vi-VN",
    onEnd = () => {},
    onError = () => {},
  }) {
    const content = String(text || "").trim();

    if (!content || content.length > MAX_TEXT) {
      return {
        ok: false,
        error: "invalidText",
      };
    }

    if (MODE === "api") {
      try {
        const result = await apiRequest("/audio/speech", {
          method: "POST",
          auth: true,
          body: {
            text: content,
            language,
          },
        });

        const url = result?.url || result?.data?.url;

        if (!validAudioUrl(url)) {
          return {
            ok: false,
            error: "invalidAudioResponse",
          };
        }

        return {
          ok: true,
          kind: "remote",
          url,
        };
      } catch (error) {
        return {
          ok: false,
          error: error?.code || "networkError",
          message: error?.message,
        };
      }
    }

    if (!browserCanSpeak()) {
      return {
        ok: false,
        error: "noSpeech",
      };
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(content);

      utterance.lang = language;
      utterance.rate = 1;

      utterance.onend = onEnd;

      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          onError(event.error);
        } else {
          onEnd();
        }
      };

      window.speechSynthesis.speak(utterance);

      return {
        ok: true,
        kind: "browser",
      };
    } catch {
      return {
        ok: false,
        error: "noSpeech",
      };
    }
  },
};
