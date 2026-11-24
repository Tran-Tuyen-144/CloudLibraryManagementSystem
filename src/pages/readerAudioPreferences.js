export const AUDIO_PREFS_KEY = "cloudlibrary:reader-audio-settings:v1";
export const RATES = [0.75, 1, 1.25, 1.5, 2];

export function normalizeAudioPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    voiceId: typeof source.voiceId === "string" ? source.voiceId : "",
    rate: RATES.includes(source.rate) ? source.rate : 1,
    volume: typeof source.volume === "number" && Number.isFinite(source.volume)
      ? Math.min(1, Math.max(0, source.volume)) : 1,
  };
}

export function readAudioPreferences() {
  try {
    return normalizeAudioPreferences(JSON.parse(globalThis.localStorage.getItem(AUDIO_PREFS_KEY) || "null"));
  } catch {
    return normalizeAudioPreferences(null);
  }
}

export function writeAudioPreferences(value) {
  try {
    globalThis.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(normalizeAudioPreferences(value)));
    return true;
  } catch {
    return false;
  }
}

export function prioritizeVoices(voices, language) {
  const preferred = language === "en" ? "en" : "vi";
  const rank = (voice) => {
    const match = String(voice.lang || "").toLowerCase().split(/[-_]/)[0] === preferred;
    return (match ? 0 : 2) + (voice.localService ? 0 : 1);
  };
  return [...voices].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
}

export function resolveAudioVoice(voices, voiceId, language) {
  const selected = voiceId && voices.find((voice) => voice.voiceURI === voiceId);
  if (selected) return selected;
  const preferred = language === "en" ? "en" : "vi";
  return prioritizeVoices(voices, language).find((voice) =>
    String(voice.lang || "").toLowerCase().split(/[-_]/)[0] === preferred
  ) || null;
}
