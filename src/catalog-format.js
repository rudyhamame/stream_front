export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[پ]/g, "ب")
    .replace(/[چ]/g, "ج")
    .replace(/[ڤ]/g, "ف")
    .replace(/[گ]/g, "ك")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function compareCatalogTitles(a, b) {
  return String(a?.title || '').trim().localeCompare(String(b?.title || '').trim(), undefined, { numeric: true, sensitivity: 'base' })
    || String(a?.key || '').localeCompare(String(b?.key || ''));
}

export function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${tail}` : tail;
}

export function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?::\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function describeEncodeStrategy(strategy, videoMode) {
  if (strategy === "DIRECT") return "DIRECT";
  if (strategy === "HLS_REMUX") return "HLS REMUX";
  if (strategy === "HLS_AUDIO_TRANSCODE") return "HLS AUDIO TRANSCODE";
  if (strategy === "HLS_VIDEO_TRANSCODE") return "HLS VIDEO TRANSCODE";
  if (strategy === "HLS_FULL_TRANSCODE") return "HLS FULL TRANSCODE";
  if (strategy === "UNSUPPORTED") return "UNSUPPORTED";
  void videoMode;
  return "";
}
