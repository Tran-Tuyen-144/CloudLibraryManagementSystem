import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Headphones,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { pdfTextParagraphs } from "../data/readerContent";
import { browserCanSpeak } from "../services/voiceService";
import "./ReaderAudioPlayer.css";

import {
  RATES,
  normalizeAudioPreferences,
  readAudioPreferences,
  writeAudioPreferences,
  prioritizeVoices,
  resolveAudioVoice,
} from "./readerAudioPreferences";

function splitForSpeech(text, language) {
  const paragraphs = String(text || "").split(/\r?\n+/u);
  const result = [];
  const limit = 210;
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(language === "en" ? "en" : "vi", {
          granularity: "sentence",
        })
      : null;

  for (const paragraph of paragraphs) {
    const clean = paragraph.replace(/\s+/gu, " ").trim();
    if (!clean) continue;
    const sentences = segmenter
      ? Array.from(segmenter.segment(clean), (item) => item.segment)
      : [clean];

    for (const sentence of sentences) {
      let chunk = "";
      for (const word of sentence.trim().split(/\s+/u).filter(Boolean)) {
        // Split unusually long tokens without cutting a Unicode surrogate pair.
        const chars = Array.from(word);
        if (chars.length > limit) {
          if (chunk) result.push(chunk);
          chunk = "";
          for (let offset = 0; offset < chars.length; offset += limit) {
            result.push(chars.slice(offset, offset + limit).join(""));
          }
        } else if (!chunk) {
          chunk = word;
        } else if (Array.from(`${chunk} ${word}`).length <= limit) {
          chunk += ` ${word}`;
        } else {
          result.push(chunk);
          chunk = word;
        }
      }
      if (chunk) result.push(chunk);
    }
  }
  return result;
}

export default function ReaderAudioPlayer({
  pdfDoc,
  pdfError,
  chapter,
  page,
  language,
  autoPlay,
  onAutoPlayConsumed,
  onComplete,
  continuous,
}) {
  const supported = browserCanSpeak();
  const synth = supported ? window.speechSynthesis : null;
  const [pdfText, setPdfText] = useState(null);
  const [voices, setVoices] = useState(() => synth?.getVoices() || []);
  const [preferences, setPreferences] = useState(readAudioPreferences);
  const { voiceId, rate, volume } = preferences;
  const [storageFailed, setStorageFailed] = useState(false);
  const orderedVoices = useMemo(
    () => prioritizeVoices(voices, language),
    [voices, language],
  );
  const missingVoice = Boolean(
    voiceId && !voices.some((voice) => voice.voiceURI === voiceId),
  );
  const [playback, setPlayback] = useState("idle");
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const sequenceRef = useRef(0);
  const utteranceRef = useRef(null);

  // PDF text extraction happens locally in the browser; image-only PDFs need OCR.
  useEffect(() => {
    if (chapter || !pdfDoc || !page) return undefined;
    let cancelled = false;

    pdfDoc
      .getPage(page)
      .then((pdfPage) => pdfPage.getTextContent())
      .then((content) => {
        if (!cancelled) {
          setPdfText({
            doc: pdfDoc,
            page,
            status: "ready",
            text: pdfTextParagraphs(content.items).join("\n"),
          });
        }
      })
      .catch(() => {
        if (!cancelled)
          setPdfText({ doc: pdfDoc, page, status: "error", text: "" });
      });

    return () => {
      cancelled = true;
    };
  }, [chapter, pdfDoc, page]);

  useEffect(() => {
    if (!synth) return undefined;
    const refresh = () => setVoices(synth.getVoices());
    synth.addEventListener?.("voiceschanged", refresh);
    return () => synth.removeEventListener?.("voiceschanged", refresh);
  }, [synth]);

  const currentPdf =
    pdfText?.doc === pdfDoc && pdfText?.page === page ? pdfText : null;
  const extractionFailed =
    !chapter && Boolean(pdfError || currentPdf?.status === "error");
  const loadingPdf = !chapter && !extractionFailed && !currentPdf;
  const text = chapter?.content || currentPdf?.text || "";
  const segments = useMemo(
    () => splitForSpeech(text, language),
    [text, language],
  );

  function stop() {
    sequenceRef.current += 1;
    if (synth && utteranceRef.current) synth.cancel();
    utteranceRef.current = null;
    setPlayback("idle");
  }

  // Stop the voice when changing page/chapter, document, or leaving Online Reading.
  useLayoutEffect(
    () => () => {
      sequenceRef.current += 1;
      if (synth && utteranceRef.current) synth.cancel();
      utteranceRef.current = null;
    },
    [synth, text],
  );

  function speakAt(start, settings = preferences) {
    if (!supported || !segments.length) return;
    stop();
    if (synth.paused) synth.resume();
    const token = sequenceRef.current;
    setError("");
    setFinished(false);
    setPlayback("playing");

    const speak = (index) => {
      if (token !== sequenceRef.current) return;
      if (index >= segments.length) {
        utteranceRef.current = null;
        setPlayback("idle");
        setPosition(segments.length - 1);
        setFinished(true);
        onComplete?.();
        return;
      }

      setPosition(index);
      const utterance = new SpeechSynthesisUtterance(segments[index]);
      const selectedVoice = resolveAudioVoice(
        voices,
        settings.voiceId,
        language,
      );
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.lang =
        selectedVoice?.lang || (language === "en" ? "en-US" : "vi-VN");
      utterance.rate = settings.rate;
      utterance.volume = settings.volume;
      utterance.onend = () => speak(index + 1);
      utterance.onerror = (event) => {
        if (token !== sequenceRef.current) return;
        utteranceRef.current = null;
        setPlayback("idle");
        if (event.error === "canceled" || event.error === "interrupted") return;
        setError(
          language === "en"
            ? "Speech playback failed."
            : "Không phát được giọng đọc trên trình duyệt này.",
        );
      };
      utteranceRef.current = utterance;
      synth.speak(utterance);
    };

    speak(Math.min(Math.max(0, start), segments.length - 1));
  }

  function changePreferences(change) {
    const next = normalizeAudioPreferences({ ...preferences, ...change });
    setPreferences(next);
    setStorageFailed(!writeAudioPreferences(next));
    // Web Speech cannot reliably change a running utterance. Restart the
    // current segment with the new settings only if it was already playing.
    if (playback === "playing") speakAt(position, next);
    else if (playback === "paused") stop();
  }

  function toggle() {
    if (playback === "playing") {
      synth.pause();
      setPlayback("paused");
    } else if (playback === "paused") {
      synth.resume();
      setPlayback("playing");
    } else {
      speakAt(finished ? 0 : position);
    }
  }

  const ready =
    supported && segments.length > 0 && !loadingPdf && !extractionFailed;
  // A parent request is scoped to one specific next unit and consumed once.
  const consumeAutoPlay = useEffectEvent(() => {
    onAutoPlayConsumed?.();
    if (ready) speakAt(0);
  });
  useEffect(() => {
    if (!autoPlay || (supported && loadingPdf)) return undefined;
    const timer = setTimeout(() => consumeAutoPlay(), 0);
    return () => clearTimeout(timer);
  }, [autoPlay, supported, loadingPdf]);

  const progress = finished
    ? 100
    : segments.length
      ? ((position + (playback === "idle" ? 0 : 1)) / segments.length) * 100
      : 0;
  const label = language === "en" ? "Listen to book" : "Nghe sách";
  const note = !supported
    ? language === "en"
      ? "Your browser does not support speech playback."
      : "Trình duyệt chưa hỗ trợ giọng đọc."
    : extractionFailed
      ? language === "en"
        ? "Unable to extract PDF text. Try reopening the page."
        : "Không trích xuất được chữ từ PDF. Hãy thử mở lại trang."
      : loadingPdf
        ? language === "en"
          ? "Extracting text from PDF…"
          : "Đang trích xuất chữ từ PDF…"
        : !segments.length
          ? language === "en"
            ? "No readable text on this page (scanned PDFs need OCR)."
            : "Trang này chưa có chữ để đọc (PDF dạng ảnh cần OCR)."
          : finished
            ? language === "en"
              ? "Finished this section."
              : "Đã đọc hết nội dung này."
            : continuous
              ? language === "en"
                ? "Continuous reading · Browser voice"
                : "Đọc liên tục · Giọng đọc trình duyệt"
              : language === "en"
                ? "Scroll mode: reads current section only"
                : "Chế độ cuộn: chỉ đọc nội dung hiện tại";

  return (
    <section className="reader-audio" aria-label={label}>
      <div className="reader-audio-top">
        <span className="reader-audio-heading">
          <Headphones size={17} aria-hidden="true" /> {label}
        </span>
        <span className="reader-audio-note" role="status">
          {error ||
            (storageFailed && ready
              ? language === "en"
                ? "Settings cannot be saved in this browser."
                : "Trình duyệt không lưu được cài đặt."
              : note)}
        </span>
      </div>

      <div className="reader-audio-track">
        <label htmlFor="reader-audio-progress">
          {language === "en" ? "Segment" : "Đoạn"}{" "}
          {segments.length ? position + 1 : 0}/{segments.length}
        </label>
        <input
          id="reader-audio-progress"
          type="range"
          min="0"
          max={Math.max(0, segments.length - 1)}
          step="1"
          value={Math.min(position, Math.max(0, segments.length - 1))}
          disabled={!ready}
          aria-label={
            language === "en" ? "Jump to speech segment" : "Chuyển tới đoạn đọc"
          }
          style={{ "--reader-audio-progress": `${progress}%` }}
          onChange={(event) => {
            const next = Number(event.target.value);
            onAutoPlayConsumed?.();
            setFinished(false);
            if (playback !== "idle") speakAt(next);
            else setPosition(next);
          }}
        />
        <span>{Math.round(progress)}%</span>
      </div>

      <div className="reader-audio-controls">
        <div className="reader-audio-transport">
          <button
            type="button"
            aria-label={language === "en" ? "Previous segment" : "Đoạn trước"}
            title={language === "en" ? "Previous segment" : "Đoạn trước"}
            onClick={() => {
              onAutoPlayConsumed?.();
              speakAt(Math.max(0, position - 1));
            }}
            disabled={!ready || position === 0}
          >
            <SkipBack size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="reader-audio-play"
            aria-label={playback === "playing" ? "Tạm dừng" : "Phát giọng đọc"}
            title={playback === "playing" ? "Tạm dừng" : "Phát hoặc tiếp tục"}
            onClick={() => {
              onAutoPlayConsumed?.();
              toggle();
            }}
            disabled={!ready}
          >
            {playback === "playing" ? (
              <Pause size={21} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={21} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={language === "en" ? "Next segment" : "Đoạn tiếp"}
            title={language === "en" ? "Next segment" : "Đoạn tiếp"}
            onClick={() => {
              onAutoPlayConsumed?.();
              speakAt(Math.min(segments.length - 1, position + 1));
            }}
            disabled={!ready || position >= segments.length - 1}
          >
            <SkipForward size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={language === "en" ? "Stop" : "Dừng"}
            title={language === "en" ? "Stop" : "Dừng"}
            onClick={() => {
              onAutoPlayConsumed?.();
              stop();
              setPosition(0);
              setFinished(false);
            }}
            disabled={playback === "idle" && !autoPlay && !finished}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="reader-audio-settings">
          <label>
            <span>{language === "en" ? "Voice" : "Giọng đọc"}</span>
            <select
              value={voiceId}
              onChange={(event) =>
                changePreferences({ voiceId: event.target.value })
              }
              disabled={!supported}
            >
              <option value="">
                {language === "en"
                  ? "Auto (language)"
                  : "Tự động theo ngôn ngữ"}
              </option>
              {missingVoice && (
                <option value={voiceId}>
                  {language === "en"
                    ? "Saved voice unavailable (auto fallback)"
                    : "Giọng đã lưu không khả dụng (tự động thay thế)"}
                </option>
              )}
              {orderedVoices.map((voice) => (
                <option
                  key={`${voice.voiceURI}-${voice.lang}`}
                  value={voice.voiceURI}
                >
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{language === "en" ? "Speed" : "Tốc độ"}</span>
            <select
              value={rate}
              onChange={(event) =>
                changePreferences({ rate: Number(event.target.value) })
              }
              disabled={!supported}
            >
              {RATES.map((value) => (
                <option value={value} key={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label className="reader-audio-volume">
            <span>
              <Volume2 size={16} aria-hidden="true" />{" "}
              {language === "en" ? "Volume" : "Âm lượng"}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              disabled={!supported}
              aria-label={language === "en" ? "Volume" : "Âm lượng"}
              onChange={(event) =>
                changePreferences({ volume: Number(event.target.value) })
              }
            />
          </label>
        </div>
      </div>
    </section>
  );
}
