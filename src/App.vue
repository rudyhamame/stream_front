<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Html5Qrcode } from "html5-qrcode";
import Hls from "hls.js";
import { registerPlugin } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";

const base = (import.meta.env.VITE_API_BASE_URL || "https://rh-stream-backend.onrender.com").replace(/\/$/, "");
const api = path => `${base}${path}`;
const androidApp = ref(Boolean(window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform?.() === "android"));
const androidPage = ref("welcome");
const androidVideo = ref(null);
const androidNowPlaying = ref(null);
const androidPlaying = ref(false);
const androidMuted = ref(false);
const androidCurrentTime = ref(0);
const androidDuration = ref(0);
const androidPlaybackOffset = ref(0);
const androidPendingSeek = ref(-1);
const androidMediaReady = ref(false);
const androidBuffering = ref(false);
const androidControlsVisible = ref(true);
const androidQuality = ref("Auto");
const androidPlayerError = ref("");
const androidFullscreen = ref(false);
let androidHls = null;
let androidSeekTimer = null;
let androidControlsTimer = null;
const Immersive = registerPlugin("Immersive");
const storedToken = () => window.localStorage.getItem("rh-device-token") || "";
const deviceToken = ref(storedToken());
const pairCode = new URLSearchParams(window.location.search).get("pair") || "";
const pairing = ref(Boolean(pairCode) || !deviceToken.value);
const pairingReady = ref(false);
const pairingNeedsSignup = ref(false);
const pairingMode = ref("signup");
const pairingEmail = ref("");
const pairingPassword = ref("");
const pairingPasswordConfirmation = ref("");
const loginDevices = ref([]);
const selectedLoginDevice = ref("");
const changePasswordOpen = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const newPasswordConfirmation = ref("");
const passwordMessage = ref("");
const passwordMessageType = ref("info");
const scannerOpen = ref(false);
const scannerError = ref("");
let qrScanner = null;
let loginViewportFrame = null;
let nativeKeyboardHeight = 0;
let loginKeyboardLift = 0;
const imageUrl = value => {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? api(`/api/xtream/logo?url=${encodeURIComponent(url)}`) : url;
};
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (deviceToken.value) headers.set("x-device-token", deviceToken.value);
  const response = await fetch(api(path), { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

async function loadPairingInfo() {
  if (!pairCode) return;
  const data = await request("/api/device-session/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode }) });
  pairingNeedsSignup.value = Boolean(data.needsSignup);
  pairingMode.value = pairingNeedsSignup.value ? "signup" : "login";
  pairingReady.value = true;
  if (data.authenticated) {
    pairing.value = false;
    await setAndroidLoginWindow(true);
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(), loadLinkedDevices()]);
  }
}

async function claimPairing() {
  try {
    if (!pairCode) return;
    if (isPairingSignup.value && pairingPassword.value !== pairingPasswordConfirmation.value) throw new Error("Passwords do not match");
    const path = isPairingSignup.value ? "/api/device-session/setup" : "/api/device-session/login";
    const data = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode, email: pairingEmail.value, password: pairingPassword.value }) });
    deviceToken.value = data.token;
    window.localStorage.setItem("rh-device-token", data.token);
    pairing.value = false;
    await setAndroidLoginWindow(true);
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(), loadLinkedDevices()]);
  } catch (error) { messageType.value = "error"; message.value = error.message; }
}

async function signIn() {
  try {
    if (loginDevices.value.length > 1 && !selectedLoginDevice.value) throw new Error("Select a linked Roku device");
    const data = await request("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pairingEmail.value, password: pairingPassword.value, deviceId: selectedLoginDevice.value }) });
    if (!data.token) {
      loginDevices.value = data.devices || [];
      selectedLoginDevice.value = loginDevices.value[0]?.deviceId || "";
      return;
    }
    deviceToken.value = data.token;
    window.localStorage.setItem("rh-device-token", data.token);
    pairing.value = false;
    await setAndroidLoginWindow(true);
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(), loadLinkedDevices()]);
  } catch (error) { messageType.value = "error"; message.value = error.message; }
}

function logout() {
  deviceToken.value = "";
  window.localStorage.removeItem("rh-device-token");
  pairing.value = true;
  pairingReady.value = false;
  pairingEmail.value = "";
  pairingPassword.value = "";
  pairingPasswordConfirmation.value = "";
  setAndroidLoginWindow(true);
  window.history.replaceState({}, "", window.location.pathname);
}

async function changePassword() {
  passwordMessage.value = "";
  if (newPassword.value !== newPasswordConfirmation.value) {
    passwordMessageType.value = "error";
    passwordMessage.value = "New passwords do not match.";
    return;
  }
  try {
    await request("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }) });
    currentPassword.value = "";
    newPassword.value = "";
    newPasswordConfirmation.value = "";
    passwordMessageType.value = "success";
    passwordMessage.value = "Password changed successfully.";
  } catch (error) {
    passwordMessageType.value = "error";
    passwordMessage.value = error.message;
  }
}

async function unlinkDevice(device) {
  if (!window.confirm(`Unlink ${device.label}?`)) return;
  try {
    busy.value = true;
    await request(`/api/account/devices/${encodeURIComponent(device.deviceId)}`, { method: "DELETE" });
    await loadLinkedDevices();
    messageType.value = "success";
    message.value = `${device.label} was unlinked.`;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}

async function stopQrScanner() {
  if (!qrScanner) return;
  try {
    if (qrScanner.isScanning) await qrScanner.stop();
    qrScanner.clear();
  } catch { /* Camera may already have been released by Android. */ }
  qrScanner = null;
  scannerOpen.value = false;
}

function pairingUrlFromScan(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const scannedUrl = new URL(raw);
    const scannedPair = scannedUrl.searchParams.get("pair");
    if (scannedPair) return `${window.location.origin}${window.location.pathname}?pair=${encodeURIComponent(scannedPair)}`;
  } catch { /* Roku may encode the pairing code as plain text. */ }
  if (/^[A-Za-z0-9_-]{8,160}$/.test(raw)) {
    return `${window.location.origin}${window.location.pathname}?pair=${encodeURIComponent(raw)}`;
  }
  return "";
}

async function startQrScanner() {
  scannerError.value = "";
  scannerOpen.value = true;
  await new Promise(resolve => setTimeout(resolve, 50));
  try {
    qrScanner = new Html5Qrcode("qr-reader");
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async decodedText => {
        const target = pairingUrlFromScan(decodedText);
        if (!target) {
          scannerError.value = "This is not a valid RH Stream pairing QR code.";
          return;
        }
        await stopQrScanner();
        window.location.assign(target);
      },
      () => { /* Most frames do not contain a QR code. */ }
    );
  } catch (error) {
    await stopQrScanner();
    scannerError.value = error?.message || "Camera permission is required to scan the Roku QR code.";
  }
}

function updateLoginKeyboardLift() {
  if (loginViewportFrame) cancelAnimationFrame(loginViewportFrame);
  loginViewportFrame = requestAnimationFrame(() => {
    loginViewportFrame = null;
    const root = document.documentElement;
    const active = document.activeElement;
    if (!pairing.value || !active?.matches?.(".login-card input, .login-card select")) {
      loginKeyboardLift = 0;
      root.style.setProperty("--login-keyboard-lift", "0px");
      return;
    }
    const viewport = window.visualViewport;
    const viewportBottom = nativeKeyboardHeight > 0
      ? window.innerHeight - nativeKeyboardHeight
      : viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const submit = active.closest("form")?.querySelector(".login-submit");
    // Measurements include the previous CSS transform. Add the old lift back
    // before calculating the next lift, otherwise email -> password snaps down.
    const targetBottom = Math.max(active.getBoundingClientRect().bottom, submit?.getBoundingClientRect().bottom || 0) + loginKeyboardLift;
    const lift = Math.min(window.innerHeight * .45, Math.max(0, targetBottom + 18 - viewportBottom));
    loginKeyboardLift = Math.ceil(lift);
    root.style.setProperty("--login-keyboard-lift", `${loginKeyboardLift}px`);
  });
}

function resetLoginKeyboardLift() {
  window.setTimeout(updateLoginKeyboardLift, 80);
}

function handleNativeKeyboardHeight(event) {
  nativeKeyboardHeight = Math.max(0, Number(event.detail?.height) || 0);
  updateLoginKeyboardLift();
}

onBeforeUnmount(stopQrScanner);
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", updateLoginKeyboardLift);
  window.visualViewport?.removeEventListener("scroll", updateLoginKeyboardLift);
  document.removeEventListener("focusin", updateLoginKeyboardLift);
  document.removeEventListener("focusout", resetLoginKeyboardLift);
  window.removeEventListener("rh-keyboard-height", handleNativeKeyboardHeight);
  if (loginViewportFrame) cancelAnimationFrame(loginViewportFrame);
});

const online = ref(false), sources = ref([]), sourceId = ref(""), linkedDevices = ref([]);
const name = ref(""), url = ref(""), editing = ref(null), busy = ref(false), loading = ref(false), message = ref(""), messageType = ref("info");
const kind = ref("channel"), items = ref([]), categories = ref([]), languages = ref([]), category = ref("all"), titleLanguage = ref("all"), query = ref("");
const selectedKeys = ref([]), savedItems = ref([]), archivedItems = ref([]), knownItems = ref({}), view = ref("library"), page = ref(1), pages = ref(1), total = ref(0);
const sortBy = ref("name"), selectionFilter = ref("all");
const selectedCount = computed(() => selectedKeys.value.length);
const isPairingSignup = computed(() => pairingMode.value === "signup");
const savedKeys = computed(() => new Set(savedItems.value.map(item => item.key)));
const savedCount = computed(() => savedItems.value.length);
const visibleItems = computed(() => {
  const filtered = items.value.filter(item => selectionFilter.value === "all"
    || (selectionFilter.value === "selected" && selectedKeys.value.includes(item.key))
    || (selectionFilter.value === "available" && !selectedKeys.value.includes(item.key) && !savedKeys.value.has(item.key)));
  return [...filtered].sort((a, b) => {
    if (sortBy.value === "recent") return String(b.added || "").localeCompare(String(a.added || ""));
    if (sortBy.value === "category") return String(a.categoryId || "").localeCompare(String(b.categoryId || "")) || a.title.localeCompare(b.title);
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" });
  });
});
const typeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, savedItems.value.filter(item => item.kind === value).length])));
const archiveCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, archivedItems.value.filter(item => item.kind === value).length])));
const savedItemsForTab = computed(() => savedItems.value.filter(item => item.kind === kind.value));
function savedItemsForTabFor(value) { return savedItems.value.filter(item => item.kind === value); }

const androidPlayerSrc = computed(() => {
  const item = androidNowPlaying.value;
  if (!item) return "";
  const playableSourceId = item.sourceId || sourceId.value;
  const extension = item.extension ? `?ext=${encodeURIComponent(item.extension)}` : "";
  const fallback = playableSourceId && item.id
    ? `/api/xtream/hls/${encodeURIComponent(playableSourceId)}/movie/${encodeURIComponent(item.id)}/master.m3u8${extension}`
    : "";
  const raw = item.playbackUrl || item.url || fallback;
  if (!raw) return "";
  const target = new URL(raw, base);
  if (deviceToken.value) target.searchParams.set("deviceToken", deviceToken.value);
  return target.toString();
});

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function handleAndroidMetadata(event) {
  const duration = Number(event.target.duration) || 0;
  if (androidPlaybackOffset.value === 0 || androidDuration.value === 0) androidDuration.value = androidPlaybackOffset.value + duration;
}

const androidRemainingTime = computed(() => Math.max(0, androidDuration.value - androidCurrentTime.value));
const androidTimelineStyle = computed(() => {
  const percent = androidDuration.value ? Math.min(100, Math.max(0, (androidCurrentTime.value / androidDuration.value) * 100)) : 0;
  return { "--android-progress": `${percent}%` };
});
const androidUpNext = computed(() => {
  const movies = savedItemsForTabFor("movie");
  const index = movies.findIndex(item => item.key === androidNowPlaying.value?.key);
  return index >= 0 ? movies[index + 1] || null : null;
});

function clearAndroidControlsTimer() {
  if (androidControlsTimer) clearTimeout(androidControlsTimer);
  androidControlsTimer = null;
}

function scheduleAndroidControlsHide() {
  clearAndroidControlsTimer();
  if (!androidPlaying.value || androidBuffering.value || androidPlayerError.value) return;
  androidControlsTimer = setTimeout(() => { androidControlsVisible.value = false; }, 3600);
}

function showAndroidControls() {
  androidControlsVisible.value = true;
  scheduleAndroidControlsHide();
}

function toggleAndroidControls(event) {
  if (event?.target?.closest?.("button, input")) return;
  androidControlsVisible.value = !androidControlsVisible.value;
  if (androidControlsVisible.value) scheduleAndroidControlsHide(); else clearAndroidControlsTimer();
}

function onAndroidPlay() {
  androidPlaying.value = true;
  androidBuffering.value = false;
  scheduleAndroidControlsHide();
}

function onAndroidPause() {
  androidPlaying.value = false;
  showAndroidControls();
}

function onAndroidWaiting() {
  androidBuffering.value = true;
  showAndroidControls();
}

function onAndroidReady(event) {
  androidBuffering.value = false;
  if (event?.type === "playing" && !androidMediaReady.value) {
    const video = event.target;
    const reveal = () => {
      if (video !== androidVideo.value || androidMediaReady.value) return;
      video.style.opacity = "1";
      androidMediaReady.value = true;
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
    else setTimeout(reveal, 500);
  }
  scheduleAndroidControlsHide();
}

function onAndroidFirstFrame() {
  androidMediaReady.value = true;
  onAndroidReady();
}

function movieStreamUrl(startSeconds = 0) {
  const source = androidPlayerSrc.value;
  if (!source) return "";
  const target = new URL(source);
  if (startSeconds > 0) target.searchParams.set("start", String(Math.floor(startSeconds)));
  return target.toString();
}

async function configureMoviePlayback(startSeconds = 0) {
  await nextTick();
  const video = androidVideo.value;
  const source = movieStreamUrl(startSeconds);
  if (!video || !source) {
    androidPlayerError.value = "This movie does not have a playable stream.";
    return;
  }
  if (androidHls) {
    androidHls.destroy();
    androidHls = null;
  }
  video.removeAttribute("src");
  video.style.opacity = "0";
  video.load();
  try {
    if (Hls.isSupported()) {
      androidHls = new Hls({ enableWorker: true, lowLatencyMode: false });
      androidHls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) androidPlayerError.value = "This movie could not be played right now.";
      });
      androidHls.on(Hls.Events.MEDIA_ATTACHED, async () => {
        try { await video.play(); androidPlaying.value = true; } catch { /* The user can press Play. */ }
      });
      androidHls.loadSource(source);
      androidHls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      await video.play();
      androidPlaying.value = true;
    } else androidPlayerError.value = "HLS playback is not supported on this device.";
  } catch { androidPlayerError.value = "This movie could not be played right now."; }
}

async function playAndroidMovie(item) {
  androidNowPlaying.value = item;
  androidFullscreen.value = false;
  androidPlaying.value = false;
  androidMuted.value = false;
  androidCurrentTime.value = 0;
  androidDuration.value = 0;
  androidPlaybackOffset.value = 0;
  androidPendingSeek.value = -1;
  androidMediaReady.value = false;
  androidBuffering.value = true;
  androidControlsVisible.value = true;
  androidQuality.value = item.quality || "Auto";
  androidPlayerError.value = "";
  await configureMoviePlayback(0);
}

async function playWebMovie(item) {
  androidNowPlaying.value = item;
  androidPlaying.value = false;
  androidMuted.value = false;
  androidCurrentTime.value = 0;
  androidDuration.value = 0;
  androidPlaybackOffset.value = 0;
  androidPendingSeek.value = -1;
  androidMediaReady.value = false;
  androidBuffering.value = true;
  androidControlsVisible.value = true;
  androidQuality.value = item.quality || "Auto";
  androidPlayerError.value = "";
  await configureMoviePlayback(0);
}

async function lockAndroidLandscape() {
  try { await ScreenOrientation.lock({ orientation: "landscape" }); } catch { /* Browser preview may not expose orientation locking. */ }
}

async function unlockAndroidOrientation() {
  try { await ScreenOrientation.unlock(); } catch { /* Browser preview may not expose orientation unlocking. */ }
}

async function setAndroidLoginWindow(active) {
  if (!androidApp.value || !Immersive) return;
  try {
    if (active) await Immersive.enter();
    else await Immersive.exit();
  } catch { /* Native window controls are unavailable in browser preview. */ }
}

async function restoreAndroidWindow() {
  await unlockAndroidOrientation();
  await new Promise(resolve => setTimeout(resolve, 180));
  if (androidApp.value && Immersive) {
    try { await Immersive.enter(); } catch { /* Native immersive mode may already be active. */ }
  }
}

async function closeAndroidPlayer() {
  clearAndroidControlsTimer();
  if (androidSeekTimer) {
    clearTimeout(androidSeekTimer);
    androidSeekTimer = null;
  }
  if (androidHls) {
    androidHls.destroy();
    androidHls = null;
  }
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* Fullscreen may already be closing. */ }
  }
  androidVideo.value?.pause();
  androidVideo.value?.removeAttribute("src");
  androidVideo.value?.load();
  androidNowPlaying.value = null;
  androidPlaying.value = false;
  androidPlayerError.value = "";
  androidFullscreen.value = false;
  androidPendingSeek.value = -1;
  androidMediaReady.value = false;
  androidBuffering.value = false;
  await restoreAndroidWindow();
}

async function toggleAndroidPlayback() {
  if (!androidVideo.value) return;
  if (androidVideo.value.paused) {
    try { await androidVideo.value.play(); } catch { androidPlayerError.value = "Playback could not start."; }
  } else androidVideo.value.pause();
}

function seekAndroidMovie(event) {
  if (!androidVideo.value) return;
  seekAndroidTo(Number(event.target.value));
}

function seekAndroidTo(target) {
  const duration = androidDuration.value || Infinity;
  const next = Math.max(0, Math.min(Number(target) || 0, duration));
  androidPendingSeek.value = next;
  androidCurrentTime.value = next;
  showAndroidControls();
  if (androidSeekTimer) clearTimeout(androidSeekTimer);
  androidSeekTimer = setTimeout(() => restartAndroidAt(next), 650);
}

function seekAndroidBy(seconds) {
  const basePosition = androidPendingSeek.value >= 0 ? androidPendingSeek.value : androidCurrentTime.value;
  seekAndroidTo(basePosition + seconds);
}

async function restartAndroidAt(target) {
  androidSeekTimer = null;
  if (!androidNowPlaying.value) return;
  androidPendingSeek.value = -1;
  androidPlaybackOffset.value = target;
  androidCurrentTime.value = target;
  androidPlayerError.value = "";
  androidBuffering.value = true;
  showAndroidControls();
  await configureMoviePlayback(target);
}

function toggleAndroidMute() {
  if (!androidVideo.value) return;
  androidVideo.value.muted = !androidVideo.value.muted;
  androidMuted.value = androidVideo.value.muted;
}

async function fullscreenAndroidMovie() {
  try {
    androidFullscreen.value = true;
    if (Immersive) await Immersive.enter();
    await lockAndroidLandscape();
    // Android uses the CSS overlay plus the native immersive window. Calling
    // the WebView video fullscreen API here can reintroduce a landscape inset.
    if (!androidApp.value) await androidVideo.value?.requestFullscreen?.();
    if (Immersive) await Immersive.enter();
  } catch {
    androidFullscreen.value = false;
    /* Fullscreen is optional on some WebViews. */
  }
}

onBeforeUnmount(() => {
  if (androidHls) androidHls.destroy();
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  unlockAndroidOrientation();
});

function handleFullscreenChange() {
  if (document.fullscreenElement || !androidFullscreen.value) return;
  androidFullscreen.value = false;
  restoreAndroidWindow();
}

document.addEventListener("fullscreenchange", handleFullscreenChange);

function typeLabel(value) { return value === "series" ? "Series" : value === "movie" ? "Movies" : "Channels"; }
function typeIcon(value) { return value === "series" ? "▦" : value === "movie" ? "▶" : "◉"; }

function applySource(source) {
  if (!source) return;
  savedItems.value = [...(source.enabledItems || [])];
  archivedItems.value = [...(source.archivedItems || [])];
  rememberItems([...savedItems.value, ...archivedItems.value]);
  sources.value = sources.value.map(item => item.id === source.id ? source : item);
}

function rememberItems(entries = []) {
  const next = { ...knownItems.value };
  for (const item of entries) if (item?.key) next[item.key] = item;
  knownItems.value = next;
}

async function loadSources(preferred = sourceId.value) {
  const data = await request("/api/xtream/sources");
  sources.value = data.items || [];
  sourceId.value = sources.value.some(item => item.id === preferred) ? preferred : (sources.value[0]?.id || "");
  const source = sources.value.find(item => item.id === sourceId.value);
  selectedKeys.value = [];
  savedItems.value = [...(source?.enabledItems || [])];
  archivedItems.value = [...(source?.archivedItems || [])];
  rememberItems([...savedItems.value, ...archivedItems.value]);
  if (source) await Promise.all([loadCatalog(), loadSaved()]);
  else { items.value = []; savedItems.value = []; archivedItems.value = []; }
}

async function loadLinkedDevices() {
  const data = await request("/api/account/devices");
  linkedDevices.value = data.items || [];
}

let catalogRequestId = 0;
let catalogController = null;
async function loadCatalog(reset = true) {
  if (!sourceId.value) return;
  if (reset) page.value = 1;
  const requestId = ++catalogRequestId;
  if (catalogController) catalogController.abort();
  catalogController = new AbortController();
  const requestedSourceId = sourceId.value;
  const requestedKind = kind.value;
  loading.value = true;
  message.value = "";
  try {
    const params = new URLSearchParams({ sourceId: requestedSourceId, kind: requestedKind, category: category.value, titleLanguage: titleLanguage.value, q: query.value.trim(), page: String(page.value), limit: "50" });
    const data = await request(`/api/xtream/catalog?${params}`, { signal: catalogController.signal });
    if (requestId !== catalogRequestId || requestedSourceId !== sourceId.value || requestedKind !== kind.value) return;
    items.value = data.items || [];
    rememberItems(items.value);
    categories.value = data.categories || [];
    languages.value = data.languages || [];
    page.value = data.pagination?.page || 1;
    pages.value = data.pagination?.pageCount || 1;
    total.value = data.pagination?.total || 0;
  } catch (error) {
    if (error.name !== "AbortError" && requestId === catalogRequestId) { message.value = error.message; messageType.value = "error"; }
  }
  finally { if (requestId === catalogRequestId) loading.value = false; }
}

async function loadSaved() {
  const data = await request(`/api/xtream/sources/${sourceId.value}/enabled`);
  applySource(data.source);
  savedItems.value = data.items || [];
}

async function saveSource() {
  busy.value = true;
  try {
    const isEditing = Boolean(editing.value);
    const data = await request(isEditing ? `/api/xtream/sources/${editing.value}` : "/api/xtream/sources", {
      method: isEditing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.value, url: url.value }),
    });
    name.value = ""; url.value = ""; editing.value = null;
    await loadSources(data.id);
    messageType.value = "success";
    message.value = "Source saved.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}

function editSource(source) { editing.value = source.id; name.value = source.name; url.value = ""; }
function cancelEdit() { editing.value = null; name.value = ""; url.value = ""; }
async function deleteSource(source) {
  if (!confirm(`Delete “${source.name}”?`)) return;
  try {
    await request(`/api/xtream/sources/${source.id}`, { method: "DELETE" });
    await loadSources();
    messageType.value = "success";
    message.value = `Deleted “${source.name}”.`;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
}
async function chooseSource(id) { sourceId.value = id; category.value = "all"; titleLanguage.value = "all"; await loadSources(id); }
async function chooseKind(value) { if (kind.value === value && items.value.length) return; kind.value = value; category.value = "all"; titleLanguage.value = "all"; query.value = ""; await loadCatalog(); }
function toggle(item) { if (savedKeys.value.has(item.key)) return; rememberItems([item]); selectedKeys.value = selectedKeys.value.includes(item.key) ? selectedKeys.value.filter(key => key !== item.key) : [...selectedKeys.value, item.key]; }
function selectPage() { const available = items.value.filter(item => !savedKeys.value.has(item.key)); rememberItems(available); selectedKeys.value = [...new Set([...selectedKeys.value, ...available.map(item => item.key)])]; }
function clearType() { const prefix = `${kind.value}:`; selectedKeys.value = selectedKeys.value.filter(key => !key.startsWith(prefix)); }
async function movePage(delta) { page.value += delta; await loadCatalog(false); }
async function saveSelection() {
  if (!selectedKeys.value.length) return;
  busy.value = true;
  try {
    const pendingItems = selectedKeys.value.map(key => knownItems.value[key]).filter(Boolean);
    const missing = selectedKeys.value.length - pendingItems.length;
    if (missing) throw new Error(`${missing} selected item(s) are no longer available. Reload their catalog page and save again.`);
    const enabledItems = [...new Map([...savedItems.value, ...pendingItems].map(item => [item.key, item])).values()];
    const addedCount = pendingItems.filter(item => !savedKeys.value.has(item.key)).length;
    const data = await request(`/api/xtream/sources/${sourceId.value}/selection`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabledKeys: enabledItems.map(item => item.key), enabledItems }),
    });
    applySource(data);
    selectedKeys.value = [];
    messageType.value = "success";
    message.value = `Saved successfully. ${addedCount} item(s) added; ${data.selectedCount} total enabled on Roku.`;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}
async function removeSaved(item) {
  busy.value = true;
  try {
    const enabledItems = savedItems.value.filter(entry => entry.key !== item.key);
    const data = await request(`/api/xtream/sources/${sourceId.value}/selection`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabledKeys: enabledItems.map(entry => entry.key), enabledItems }),
    });
    applySource(data);
    messageType.value = "success";
    message.value = `Removed “${item.title}” from Roku.`;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}
async function archiveSaved(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}`, { method: "POST" }));
    messageType.value = "success";
    message.value = "Item archived and removed from Roku.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}
async function restoreArchived(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}/restore`, { method: "POST" }));
    messageType.value = "success";
    message.value = "Item restored to the Roku library.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}

let searchTimer;
watch(query, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadCatalog(), 350); });
watch(category, () => loadCatalog());
watch(titleLanguage, () => loadCatalog());
onMounted(async () => {
  window.visualViewport?.addEventListener("resize", updateLoginKeyboardLift);
  window.visualViewport?.addEventListener("scroll", updateLoginKeyboardLift);
  document.addEventListener("focusin", updateLoginKeyboardLift);
  document.addEventListener("focusout", resetLoginKeyboardLift);
  window.addEventListener("rh-keyboard-height", handleNativeKeyboardHeight);
  if (pairing.value) {
    await setAndroidLoginWindow(true);
    // Capacitor can restore its WebView window flags just after mount.
    // Reapply login edge-to-edge once the native view has settled.
    if (androidApp.value) window.setTimeout(() => setAndroidLoginWindow(true), 350);
  } else if (androidApp.value) {
    await setAndroidLoginWindow(true);
    window.setTimeout(() => setAndroidLoginWindow(true), 350);
  }
  try {
    if (pairCode) {
      await loadPairingInfo();
      return;
    }
    if (!deviceToken.value) return;
    await request("/api/health"); online.value = true; await Promise.all([loadSources(), loadLinkedDevices()]);
  } catch (error) { online.value = false; messageType.value = "error"; message.value = error.message; }
});
</script>

<template>
  <main class="shell" :class="{ 'android-app-mode': androidApp, 'login-shell': pairing }">
    <section v-if="pairing" class="pairing-gate login-gate">
      <div class="login-art" aria-hidden="true">
        <img class="login-city" src="/login/city-background.png" alt="">
        <img class="login-couple" src="/login/couple-foreground.png" alt="">
        <div class="login-art-fade"></div>
      </div>
      <div class="pairing-card login-card" :class="{ 'login-card-plain': !pairCode }">
        <div class="login-brand"><img class="login-brand-mark" src="/login/rh-login-mark.png" alt="RH"><span>IPTV PLAYER</span></div>
        <p v-if="pairCode" class="eyebrow">ROKU LIBRARY</p>
        <h1 v-if="pairCode && isPairingSignup">Create your account</h1>
        <h1 v-else-if="pairCode">Open your Roku library</h1>
        <h1 v-else>Sign in to your library</h1>
        <p v-if="pairCode && !pairingReady">Checking the secure Roku link…</p>
        <template v-else-if="pairCode">
          <p>{{ isPairingSignup ? 'Create an account to activate this Roku and manage its library from your phone.' : 'Sign in to link this Roku and open its library. The TV will connect automatically.' }}</p>
          <form @submit.prevent="claimPairing">
            <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <label>Password<input v-model="pairingPassword" type="password" minlength="8" required :autocomplete="isPairingSignup ? 'new-password' : 'current-password'" placeholder="Your password"></label>
            <label v-if="isPairingSignup">Confirm password<input v-model="pairingPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password" placeholder="Repeat password"></label>
            <button type="submit" class="primary-action login-submit">{{ isPairingSignup ? 'Create account & activate Roku' : 'Sign in & link Roku' }}</button>
            <button v-if="pairingNeedsSignup" type="button" class="source-action" @click="pairingMode = isPairingSignup ? 'login' : 'signup'">{{ isPairingSignup ? 'I already have an account' : 'Create a new account' }}</button>
          </form>
        </template>
        <template v-else>
          <template v-if="!scannerOpen">
            <form @submit.prevent="signIn">
              <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
              <label>Password<input v-model="pairingPassword" type="password" minlength="8" required autocomplete="current-password" placeholder="Your password"></label>
              <label v-if="loginDevices.length">Roku device<select v-model="selectedLoginDevice" required><option v-for="device in loginDevices" :key="device.deviceId" :value="device.deviceId">{{ device.label }}</option></select></label>
              <button type="submit" class="primary-action login-submit">Sign in</button>
            </form>
            <p class="login-scan-copy">To link a new Roku, scan its QR code.</p>
            <button type="button" class="source-action scan-action" @click="startQrScanner">Scan Roku QR code</button>
          </template>
          <div v-if="scannerOpen" class="scanner-panel"><div id="qr-reader"></div><button type="button" class="source-action" @click="stopQrScanner">Cancel scan</button></div>
          <p v-if="scannerError" class="xtream-message is-error">{{ scannerError }}</p>
        </template>
        <p v-if="message" class="xtream-message is-error">{{ message }}</p>
      </div>
    </section>
    <template v-else>
    <nav class="topbar">
      <div class="brand"><img class="app-brand-mark" src="/login/rh-login-mark.png" alt="RH"><span>IPTV Player</span></div>
      <div class="topbar-actions"><span class="status"><i :class="{offline:!online}"></i>{{ online ? "Backend online" : "Backend offline" }}</span><button type="button" class="logout-button" @click="logout">Log out</button></div>
    </nav>
    <section v-if="androidApp" class="android-page-shell">
      <article v-if="androidPage === 'welcome'" class="android-page"><p class="eyebrow">WELCOME</p><h1>Your library,<br><em>ready to watch.</em></h1><p>Manage your Roku library, browse your selected content, and keep your devices connected from one place.</p><div class="android-library-stats"><div class="android-stat"><strong>{{ typeCounts.series || 0 }}</strong><span>Series</span></div><div class="android-stat"><strong>{{ typeCounts.movie || 0 }}</strong><span>Movies</span></div><div class="android-stat"><strong>{{ typeCounts.channel || 0 }}</strong><span>Live Channels</span></div></div></article>
      <article v-else-if="androidPage === 'playlist'" class="android-page android-playlist-page"><p class="eyebrow">PLAYLIST</p><h1>Feed your<br><em>library.</em></h1><form v-if="!sources.length" class="android-playlist-source-form" @submit.prevent="saveSource"><input v-model="name" required placeholder="Playlist name"><input v-model="url" required placeholder="Xtream playlist URL" spellcheck="false"><button type="submit" class="primary-action" :disabled="busy">Add playlist</button></form><template v-else><div class="android-playlist-source"><span>PLAYLIST SOURCE</span><select :value="sourceId" @change="chooseSource($event.target.value)"><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select></div><div class="android-playlist-tabs"><button v-for="value in ['series','movie','channel']" :key="value" type="button" :class="{active:kind === value}" @click="chooseKind(value)">{{ typeLabel(value) }} <small>{{ typeCounts[value] || 0 }}</small></button></div><label class="android-playlist-search"><span>⌕</span><input v-model="query" placeholder="Search this playlist"></label><div v-if="visibleItems.length" class="android-playlist-items"><label v-for="item in visibleItems" :key="item.key" :class="{enabled:savedKeys.has(item.key),pending:selectedKeys.includes(item.key)}"><input type="checkbox" :checked="selectedKeys.includes(item.key)" :disabled="savedKeys.has(item.key)" @change="toggle(item)"><span class="android-playlist-icon">{{ typeIcon(kind) }}</span><span><strong>{{ item.title }}</strong><small>{{ item.categoryId || 'Uncategorized' }}</small></span><em>{{ savedKeys.has(item.key) ? 'Added' : selectedKeys.includes(item.key) ? 'Ready' : 'Add' }}</em></label></div><p v-else class="android-empty">No matching {{ typeLabel(kind).toLowerCase() }} found.</p><button type="button" class="android-playlist-save" :disabled="busy || !selectedCount" @click="saveSelection">Add {{ selectedCount }} selected to library</button></template></article>
      <article v-else-if="androidPage === 'series'" class="android-page"><p class="eyebrow">SERIES</p><h1>Series</h1><div v-if="savedItemsForTabFor('series').length" class="android-item-list"><div v-for="item in savedItemsForTabFor('series')" :key="item.key"><span>▦</span><strong>{{ item.title }}</strong></div></div><p v-else class="android-empty">No series are enabled yet. Add them from the library manager.</p></article>
      <article v-else-if="androidPage === 'movies'" class="android-page"><p class="eyebrow">MOVIES</p><h1>Movies</h1><div v-if="savedItemsForTabFor('movie').length" class="android-item-list"><button v-for="item in savedItemsForTabFor('movie')" :key="item.key" type="button" class="android-movie-item" @click="playAndroidMovie(item)"><span>▶</span><strong>{{ item.title }}</strong><small>Play movie</small></button></div><p v-else class="android-empty">No movies are enabled yet. Add them from the library manager.</p></article>
      <article v-else-if="androidPage === 'channels'" class="android-page"><p class="eyebrow">CHANNELS</p><h1>Channels</h1><div v-if="savedItemsForTabFor('channel').length" class="android-item-list"><div v-for="item in savedItemsForTabFor('channel')" :key="item.key"><span>◉</span><strong>{{ item.title }}</strong></div></div><p v-else class="android-empty">No channels are enabled yet. Add them from the library manager.</p></article>
      <article v-else class="android-page"><p class="eyebrow">SETTINGS</p><h1>Settings</h1><div class="android-settings-card"><span>Account</span><strong>{{ linkedDevices.length }} linked Roku device{{ linkedDevices.length === 1 ? '' : 's' }}</strong></div><section class="android-linked-settings"><p class="eyebrow">LINKED ROKUS</p><div v-if="linkedDevices.length" class="android-linked-settings-list"><article v-for="device in linkedDevices" :key="device.id"><div><strong>{{ device.label }}</strong><small>{{ device.deviceId }}</small></div><button type="button" class="android-unlink-button" :disabled="busy" @click="unlinkDevice(device)">Unlink</button></article></div><p v-else class="android-empty">No linked Roku devices.</p></section><button type="button" class="source-action android-change-password-toggle" @click="changePasswordOpen = !changePasswordOpen">{{ changePasswordOpen ? 'Cancel password change' : 'Change password' }}</button><form v-if="changePasswordOpen" class="android-password-form" @submit.prevent="changePassword"><label>Current password<input v-model="currentPassword" type="password" minlength="8" required autocomplete="current-password"></label><label>New password<input v-model="newPassword" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirm new password<input v-model="newPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password"></label><button type="submit" class="primary-action" :disabled="busy">Change password</button><p v-if="passwordMessage" :class="['android-password-message', `is-${passwordMessageType}`]">{{ passwordMessage }}</p></form><button type="button" class="logout-button android-logout" @click="logout">Log out</button></article>
      <nav class="android-bottom-menu" aria-label="Main menu"><button v-for="item in [{id:'welcome',label:'Welcome',icon:'⌂'},{id:'playlist',label:'Playlist',icon:'＋'},{id:'series',label:'Series',icon:'▦'},{id:'movies',label:'Movies',icon:'▶'},{id:'channels',label:'Channels',icon:'◉'},{id:'settings',label:'Settings',icon:'⚙'}]" :key="item.id" type="button" :class="{active:androidPage === item.id}" @click="androidPage = item.id"><span>{{ item.icon }}</span><small>{{ item.label }}</small></button></nav>
      <section v-if="androidNowPlaying" class="android-player" :class="{'is-fullscreen': androidFullscreen}" role="dialog" aria-label="Movie player">
        <header class="android-player-header"><button type="button" class="android-player-back" aria-label="Close player" @click="closeAndroidPlayer">‹</button><div class="android-player-title"><p class="eyebrow">NOW PLAYING</p><h2>{{ androidNowPlaying.title }}</h2><p>Movie · {{ androidQuality }}</p></div><button type="button" class="android-player-close" aria-label="More options">⋮</button></header>
        <div class="android-video-frame" @click="toggleAndroidControls"><video ref="androidVideo" :src="androidPlayerSrc" playsinline preload="metadata" @loadedmetadata="handleAndroidMetadata" @timeupdate="androidCurrentTime = androidPlaybackOffset + $event.target.currentTime" @play="onAndroidPlay" @pause="onAndroidPause" @playing="onAndroidReady" @waiting="onAndroidWaiting" @stalled="onAndroidWaiting" @canplay="onAndroidReady" @ended="androidPlaying = false" @error="androidPlayerError = 'Playback unavailable'; androidBuffering = false; showAndroidControls()"></video><div v-if="!androidMediaReady && !androidPlayerError" class="android-video-placeholder"><span class="android-placeholder-mark">RH</span><strong>Preparing your stream</strong><small>{{ androidNowPlaying.title }}</small></div><div v-if="androidBuffering && androidMediaReady && !androidPlayerError" class="android-buffering"><span></span></div><div class="android-player-overlay" :class="{visible: androidControlsVisible || !androidPlaying || androidBuffering || androidPlayerError}"><div class="android-center-controls"><button type="button" aria-label="Rewind 10 seconds" @click.stop="seekAndroidBy(-10)">↶<small>10</small></button><button type="button" class="android-center-play" aria-label="Play or pause" @click.stop="toggleAndroidPlayback">{{ androidPlaying ? 'Ⅱ' : '▶' }}</button><button type="button" aria-label="Forward 10 seconds" @click.stop="seekAndroidBy(10)">↷<small>10</small></button></div><div class="android-timeline"><span>{{ formatTime(androidCurrentTime) }}</span><input type="range" min="0" :max="androidDuration || 0" :value="androidCurrentTime" :style="androidTimelineStyle" aria-label="Movie progress" @pointerdown="showAndroidControls" @input="seekAndroidMovie"><span>-{{ formatTime(androidRemainingTime) }}</span></div></div><div v-if="androidPlayerError" class="android-player-error"><strong>Playback unavailable</strong><button type="button" @click.stop="playAndroidMovie(androidNowPlaying)">Retry</button></div></div>
        <div class="android-player-utility"><button type="button"><span>4K</span><small>Quality</small></button><button type="button" @click="fullscreenAndroidMovie"><span>□</span><small>Fullscreen</small></button></div>
        <article v-if="androidUpNext" class="android-up-next"><div class="android-up-next-icon"><img v-if="androidUpNext.logo" :src="imageUrl(androidUpNext.logo)" :alt="androidUpNext.title"><span v-else>▶</span></div><div><p>UP NEXT</p><strong>{{ androidUpNext.title }}</strong><small>Continue watching</small></div><button type="button" aria-label="Play next movie" @click="playAndroidMovie(androidUpNext)">▶</button></article>
      </section>
    </section>
    <header class="manager-hero">
      <div>
        <p class="eyebrow">ROKU PLAYLIST BUILDER</p>
        <h1>Build your<br><em>Roku library.</em></h1>
        <p>Select only what you want on the TV. Organize Series, Movies, and Channels here; archived items stay safely outside the Roku feed.</p>
      </div>
      <div class="hero-note"><span class="hero-note-icon">✓</span><strong>One focused workflow</strong><small>Choose · Filter · Save</small></div>
    </header>

    <section v-if="linkedDevices.length" class="linked-devices" aria-label="Linked Roku devices">
      <div><p class="eyebrow">YOUR DEVICES</p><h2>Linked Rokus</h2></div>
      <div class="linked-device-list"><article v-for="device in linkedDevices" :key="device.id"><span class="linked-device-icon">▣</span><span><strong>{{ device.label }}</strong><small>Linked {{ new Date(device.linkedAt).toLocaleDateString() }}</small></span></article></div>
    </section>

    <section class="xtream-control-panel">
      <div class="section-heading"><div><p class="eyebrow">STEP 01 · CONNECTION</p><h2>Choose a catalog source</h2><p class="section-copy">Connect an Xtream source once, then manage exactly what Roku can see.</p></div><span class="section-count">{{ sources.length }} source{{ sources.length === 1 ? '' : 's' }}</span></div>
      <form class="xtream-source-form" @submit.prevent="saveSource">
        <label><span>Display name</span><input v-model="name" required placeholder="My provider"></label>
        <label class="source-url"><span>Xtream playlist URL</span><input v-model="url" :required="!editing" placeholder="http://provider/get.php?..." spellcheck="false"></label>
        <button class="primary-action" :disabled="busy">{{ editing ? "Save source" : "Add source" }}</button>
        <button v-if="editing" type="button" class="source-action" @click="cancelEdit">Cancel</button>
      </form>
      <div class="xtream-source-list">
        <article v-for="source in sources" :key="source.id" :class="{active:source.id===sourceId}">
          <button type="button" class="xtream-source-choice" @click="chooseSource(source.id)"><span class="source-pulse"></span><strong>{{source.name}}</strong><small>{{source.endpoint}}</small></button>
          <button class="source-action" @click="editSource(source)">Edit</button><button class="source-delete" @click="deleteSource(source)">Delete</button>
        </article>
      </div>

      <template v-if="sourceId">
        <div class="xtream-view-tabs">
          <button type="button" :class="{active:view==='library'}" @click="view='library'"><span class="tab-icon">▣</span>Roku library <span>{{ savedCount }}</span></button>
          <button type="button" :class="{active:view==='archive'}" @click="view='archive'"><span class="tab-icon">⌁</span>Archive <span>{{ archivedItems.length }}</span></button>
        </div>

        <template v-if="view==='library'">
          <div class="workspace-heading"><div><p class="eyebrow">STEP 02 · CURATE CONTENT</p><h2>What should Roku show?</h2></div><div class="selection-summary"><strong>{{ savedCount }}</strong><span>enabled on Roku</span></div></div>
          <div class="content-type-tabs" role="tablist" aria-label="Roku content type">
            <button type="button" v-for="value in ['series','movie','channel']" :key="value" role="tab" :aria-selected="kind===value" :class="{active:kind===value}" @click="chooseKind(value)"><span class="type-icon">{{ typeIcon(value) }}</span><span><strong>{{ typeLabel(value) }}</strong><small>{{ typeCounts[value] || 0 }} enabled</small></span><b>{{ archiveCounts[value] || 0 }} archived</b></button>
          </div>
          <div class="xtream-toolbar">
            <label class="catalog-search"><span>⌕</span><input v-model="query" placeholder="Search this catalog…"></label>
            <select v-model="category"><option value="all">All categories</option><option v-for="item in categories" :key="item.id" :value="item.id">{{item.name}}</option></select>
            <select v-model="titleLanguage" aria-label="Filter by title language"><option value="all">Title language: All</option><option v-for="item in languages" :key="item" :value="item">Title language: {{item}}</option></select>
            <select v-model="sortBy"><option value="name">Sort: A–Z</option><option value="recent">Sort: Recently added</option><option value="category">Sort: Category</option></select>
            <select v-model="selectionFilter"><option value="all">Show: All items</option><option value="available">Show: Not selected</option><option value="selected">Show: Selected only</option></select>
            <div class="toolbar-actions"><button type="button" class="source-action" @click="selectPage">Select visible</button><button type="button" class="source-delete" @click="clearType">Clear {{ typeLabel(kind) }}</button></div>
            <button type="button" class="xtream-save" :disabled="busy || !selectedCount" @click="saveSelection">Save {{ selectedCount }} selected to Roku</button>
          </div>
          <div v-if="loading" class="loading"><span class="loading-ring"></span><span>Loading {{ typeLabel(kind).toLowerCase() }}…</span></div>
          <div v-else-if="!visibleItems.length" class="loading empty-catalog"><span class="empty-icon">⌕</span><span>No matching {{ typeLabel(kind).toLowerCase() }} found.</span></div>
          <div v-else class="xtream-item-list">
            <label v-for="item in visibleItems" :key="item.key" :class="{enabled:savedKeys.has(item.key), pending:selectedKeys.includes(item.key)}">
              <input type="checkbox" :checked="selectedKeys.includes(item.key)" :disabled="savedKeys.has(item.key)" @change="toggle(item)"><span class="item-poster"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(kind) }}</span></span>
              <span class="item-copy"><strong>{{item.title}}</strong><small>{{item.categoryId || 'Uncategorized'}}</small></span><em>{{savedKeys.has(item.key)?"On Roku":selectedKeys.includes(item.key)?"Selected":"Not selected"}}</em>
            </label>
          </div>
          <div class="xtream-pagination"><button type="button" :disabled="page<=1" @click="movePage(-1)">‹ Previous</button><span>Page {{page}} / {{pages}} <b>·</b> {{total}} {{ typeLabel(kind).toLowerCase() }}</span><button type="button" :disabled="page>=pages" @click="movePage(1)">Next ›</button></div>
          <section class="xtream-enabled-section">
            <div class="section-heading compact"><div><p class="eyebrow">SAVED ON ROKU</p><h2>{{ typeLabel(kind) }}</h2></div><span class="section-count accent-count">{{ typeCounts[kind] || 0 }}</span></div>
            <div v-if="savedItemsForTab.length" class="xtream-enabled-table"><div v-for="item in savedItemsForTab" :key="item.key" class="xtream-enabled-row" :class="{'web-playable-row': item.kind === 'movie'}" @click="item.kind === 'movie' && playWebMovie(item)"><div class="xtream-enabled-name"><span class="item-poster small"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(item.kind) }}</span></span><strong>{{item.title}}</strong></div><span class="xtream-kind-badge">{{typeLabel(item.kind)}}</span><code>{{item.id}}</code><div class="xtream-row-actions"><button v-if="item.kind === 'movie'" type="button" class="xtream-play-button" @click.stop="playWebMovie(item)">Play</button><button type="button" class="source-action" :disabled="busy" @click.stop="archiveSaved(item)">Archive</button><button type="button" class="source-delete" :disabled="busy" @click.stop="removeSaved(item)">Remove</button></div></div></div>
            <div v-else class="empty xtream-enabled-empty"><strong>No {{ typeLabel(kind).toLowerCase() }} items enabled.</strong><span>Select items above, then press “Save to Roku”.</span></div>
          </section>
        </template>

        <section v-else class="xtream-enabled-section archive-section">
          <div class="section-heading"><div><p class="eyebrow">STORED SAFELY · NOT ON ROKU</p><h2>Archive</h2><p class="section-copy">Keep items out of the Roku feed without deleting them. Restore them whenever you need.</p></div><span class="section-count accent-count">{{ archivedItems.length }}</span></div>
          <div v-if="archivedItems.length" class="archive-summary"><span v-for="value in ['series','movie','channel']" :key="value"><b>{{archiveCounts[value] || 0}}</b> {{typeLabel(value)}}</span></div>
          <div v-if="archivedItems.length" class="xtream-enabled-table"><div v-for="item in archivedItems" :key="item.key" class="xtream-enabled-row"><div class="xtream-enabled-name"><span class="item-poster small"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(item.kind) }}</span></span><strong>{{item.title}}</strong></div><span class="xtream-kind-badge">{{typeLabel(item.kind)}}</span><code>{{item.id}}</code><div class="xtream-row-actions"><button type="button" class="xtream-save" :disabled="busy" @click="restoreArchived(item)">Restore to Roku</button></div></div></div>
          <div v-else class="empty xtream-enabled-empty"><strong>Your archive is empty.</strong><span>Archive an enabled item to keep it available without showing it on Roku.</span></div>
        </section>
      </template>
      <p v-if="message" role="status" aria-live="polite" :class="['xtream-message', `is-${messageType}`]"><span v-if="messageType==='success'">✓</span>{{message}}</p>
    </section>
    <section v-if="!androidApp && androidNowPlaying" class="android-player web-player" :class="{'is-fullscreen': androidFullscreen}" role="dialog" aria-label="Movie player">
      <header class="android-player-header"><button type="button" class="android-player-back" aria-label="Close player" @click="closeAndroidPlayer">‹</button><div class="android-player-title"><p class="eyebrow">NOW PLAYING</p><h2>{{ androidNowPlaying.title }}</h2><p>Movie · {{ androidQuality }}</p></div><button type="button" class="android-player-close" aria-label="More options">⋮</button></header>
      <div class="android-video-frame" @click="toggleAndroidControls"><video ref="androidVideo" :src="androidPlayerSrc" playsinline preload="metadata" @loadedmetadata="handleAndroidMetadata" @timeupdate="androidCurrentTime = androidPlaybackOffset + $event.target.currentTime" @play="onAndroidPlay" @pause="onAndroidPause" @playing="onAndroidReady" @waiting="onAndroidWaiting" @stalled="onAndroidWaiting" @canplay="onAndroidReady" @ended="androidPlaying = false" @error="androidPlayerError = 'Playback unavailable'; androidBuffering = false; showAndroidControls()"></video><div v-if="!androidMediaReady && !androidPlayerError" class="android-video-placeholder"><span class="android-placeholder-mark">RH</span><strong>Preparing your stream</strong><small>{{ androidNowPlaying.title }}</small></div><div v-if="androidBuffering && androidMediaReady && !androidPlayerError" class="android-buffering"><span></span></div><div class="android-player-overlay" :class="{visible: androidControlsVisible || !androidPlaying || androidBuffering || androidPlayerError}"><div class="android-center-controls"><button type="button" aria-label="Rewind 10 seconds" @click.stop="seekAndroidBy(-10)">↶<small>10</small></button><button type="button" class="android-center-play" aria-label="Play or pause" @click.stop="toggleAndroidPlayback">{{ androidPlaying ? 'Ⅱ' : '▶' }}</button><button type="button" aria-label="Forward 10 seconds" @click.stop="seekAndroidBy(10)">↷<small>10</small></button></div><div class="android-timeline"><span>{{ formatTime(androidCurrentTime) }}</span><input type="range" min="0" :max="androidDuration || 0" :value="androidCurrentTime" :style="androidTimelineStyle" aria-label="Movie progress" @pointerdown="showAndroidControls" @input="seekAndroidMovie"><span>-{{ formatTime(androidRemainingTime) }}</span></div></div><div v-if="androidPlayerError" class="android-player-error"><strong>Playback unavailable</strong><button type="button" @click.stop="playWebMovie(androidNowPlaying)">Retry</button></div></div>
      <div class="android-player-utility"><button type="button"><span>4K</span><small>Quality</small></button><button type="button" @click="fullscreenAndroidMovie"><span>□</span><small>Fullscreen</small></button></div>
      <article v-if="androidUpNext" class="android-up-next"><div class="android-up-next-icon"><img v-if="androidUpNext.logo" :src="imageUrl(androidUpNext.logo)" :alt="androidUpNext.title"><span v-else>▶</span></div><div><p>UP NEXT</p><strong>{{ androidUpNext.title }}</strong><small>Continue watching</small></div><button type="button" aria-label="Play next movie" @click="playWebMovie(androidUpNext)">▶</button></article>
    </section>
    </template>
  </main>
</template>
