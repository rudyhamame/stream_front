<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import HomeIcon from "./components/icons/HomeIcon.vue";
import FilmRollAltIcon from "./components/icons/FilmRollAltIcon.vue";
import MovieIcon from "./components/icons/MovieIcon.vue";
import GlobeAlt2Icon from "./components/icons/GlobeAlt2Icon.vue";
import CogIcon from "./components/icons/CogIcon.vue";
import MaximizeIcon from "./components/icons/MaximizeIcon.vue";
import PauseIcon from "./components/icons/PauseIcon.vue";
import PlayIcon from "./components/icons/PlayIcon.vue";
import RotateCcw10Icon from "./components/icons/RotateCcw10Icon.vue";
import RotateCw10Icon from "./components/icons/RotateCw10Icon.vue";

const canonicalBackend = "https://rh-library-backend.onrender.com";
const configuredBackend = (import.meta.env.VITE_API_BASE_URL || canonicalBackend).replace(/\/$/, "");
// Render still has the retired backend URL in one frontend environment. That
// service lacks the Library category routes loaded immediately after login,
// causing a misleading "Request failed (404)" despite successful auth.
const base = configuredBackend === "https://rh-stream-backend.onrender.com" ? canonicalBackend : configuredBackend;
const browserStreamer = (import.meta.env.VITE_PLAYBACK_BASE_URL || "https://rh-stream-backend-tbm7.onrender.com").replace(/\/$/, "");
const api = path => `${base}${path}`;

function browserPlaybackUrl(raw) {
  const target = new URL(raw, base);
  if (target.pathname.startsWith("/api/xtream/hls/") || target.pathname.startsWith("/api/xtream/play/")) {
    target.protocol = new URL(browserStreamer).protocol;
    target.host = new URL(browserStreamer).host;
  }
  return target.toString();
}
const browserApp = ref(true);
const pageStorageKey = "rh-safari-page";
const allowedPages = ["welcome", "playlist", "library", "series", "movies", "channels", "settings"];
const storedPage = window.localStorage.getItem(pageStorageKey);
const safariPage = ref(storedPage === "library" ? "series" : (allowedPages.includes(storedPage) ? storedPage : "welcome"));
const storedLibraryTab = window.localStorage.getItem("rh-safari-library-tab");
const safariLibraryTab = ref(["series", "movie", "channel"].includes(storedLibraryTab) ? storedLibraryTab : "series");
const safariRailMotion = ref({});
const safariRailPositions = new Map();
const safariRailMotionTimers = new Map();
const safariMenuItems = [
  { id: "welcome", label: "Welcome", icon: HomeIcon },
  { id: "playlist", label: "Playlist", icon: GlobeAlt2Icon },
  { id: "series", label: "Series", icon: FilmRollAltIcon },
  { id: "movies", label: "Movies", icon: MovieIcon },
  { id: "channels", label: "Live TV", icon: GlobeAlt2Icon },
  { id: "settings", label: "Settings", icon: CogIcon }
];
function openSafariPage(page) {
  const tab = { series: "series", movies: "movie", channels: "channel" }[page];
  if (tab) safariLibraryTab.value = tab;
  safariPage.value = page;
}
function openBrowserLibrary(tab) {
  openSafariPage({ series: "series", movie: "movies", channel: "channels" }[tab] || "series");
}
function openAddPageForItem(item) {
  const targetKind = ["series", "movie", "channel"].includes(item?.kind) ? item.kind : safariLibraryTab.value;
  if (item?.sourceId) sourceId.value = item.sourceId;
  kind.value = targetKind;
  category.value = "all";
  titleLanguage.value = "all";
  query.value = "";
  openSafariPage("playlist");
  loadCatalog().catch(error => {
    messageType.value = "error";
    message.value = error.message;
  });
}
function focusMainMenu() {
  const menu = document.querySelector(".browser-sidebar nav");
  const active = menu?.querySelector("button.active") || menu?.querySelector("button");
  active?.focus({ preventScroll: true });
}
function handleNavigationKeydown(event) {
  if (event.key !== "ArrowLeft" || pairing.value || webNowPlaying.value) return;
  const page = safariPage.value;
  if (page !== "welcome") return;
  event.preventDefault();
  focusMainMenu();
}
function handleSafariRailScroll(event, railKey) {
  const track = event.currentTarget;
  const currentPosition = track.scrollLeft;
  const previousPosition = safariRailPositions.get(railKey);
  safariRailPositions.set(railKey, currentPosition);
  if (previousPosition === undefined || currentPosition === previousPosition) return;
  const direction = currentPosition < previousPosition ? "left" : "right";
  const nextMotion = { ...safariRailMotion.value, [railKey]: "" };
  safariRailMotion.value = nextMotion;
  requestAnimationFrame(() => { safariRailMotion.value = { ...safariRailMotion.value, [railKey]: direction }; });
  if (safariRailMotionTimers.has(railKey)) clearTimeout(safariRailMotionTimers.get(railKey));
  safariRailMotionTimers.set(railKey, setTimeout(() => {
    safariRailMotion.value = { ...safariRailMotion.value, [railKey]: "" };
    safariRailMotionTimers.delete(railKey);
  }, 180));
}
const webVideo = ref(null);
const liveTvVideo = ref(null);
const liveTvSelected = ref(null);
const liveTvLoading = ref(false);
const liveTvError = ref("");
const liveTvVisibleCount = ref(20);
const playlistPreviewVideo = ref(null);
const playlistPreviewSelected = ref(null);
const playlistPreviewLoading = ref(false);
const playlistPreviewError = ref("");
const webNowPlaying = ref(null);
const webPlaying = ref(false);
const webMuted = ref(false);
const webCurrentTime = ref(0);
const webDuration = ref(0);
const webPlaybackOffset = ref(0);
const webPendingSeek = ref(-1);
const webMediaReady = ref(false);
const webPlaybackRetryCount = ref(0);
const webBuffering = ref(false);
const webControlsVisible = ref(true);
const webQuality = ref("Auto");
const webPlayerError = ref("");
const webStreamTicket = ref("");
const webForceHls = ref(false);
const webFullscreen = ref(false);
let webHls = null;
let liveTvHls = null;
let liveTvRequestId = 0;
let playlistPreviewHls = null;
let playlistPreviewRequestId = 0;
let hlsConstructorPromise = null;
let webRecoveryTimer = null;
let webBufferingTimer = null;
let webSeekTimer = null;
let webControlsTimer = null;
async function loadHlsConstructor() {
  if (!hlsConstructorPromise) hlsConstructorPromise = import("hls.js").then(module => module.default);
  return hlsConstructorPromise;
}
const storedToken = () => window.localStorage.getItem("rh-device-token") || "";
const profileSelectionKey = "rh-profile-selection-pending";
const pairCode = new URLSearchParams(window.location.search).get("pair") || "";
// A Roku QR is an explicit request to authenticate for that Roku. Never let
// an existing Library browser token silently approve or bypass this flow.
// Clear it before deviceToken is initialized and before pairing info is
// requested, while leaving the short-lived pair code in the URL intact.
if (pairCode) window.localStorage.removeItem("rh-device-token");
const deviceToken = ref(pairCode ? "" : storedToken());
const appReady = ref(!deviceToken.value);
const pairingDeviceId = ref("");
const pairing = ref(Boolean(pairCode) || !deviceToken.value);
const pairingReady = ref(false);
const pairingNeedsSignup = ref(false);
const pairingMode = ref(pairCode ? "signup" : "login");
const pairingEmail = ref("");
const pairingPassword = ref("");
const pairingPasswordConfirmation = ref("");
const loginDevices = ref([]);
const selectedLoginDevice = ref("");
const authBusy = ref(false);
const profiles = ref([]);
const activeProfileId = ref(window.localStorage.getItem("rh-profile-id") || "");
const profileChooser = ref(false);
const profileBusy = ref(false);
const profileError = ref("");
const changePasswordOpen = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const newPasswordConfirmation = ref("");
const passwordMessage = ref("");
const passwordMessageType = ref("info");
const scannerOpen = ref(false);
const scannerError = ref("");
const failedLogoUrls = ref(new Set());
let qrScanner = null;
const imageUrl = value => {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? api(`/api/xtream/logo?url=${encodeURIComponent(url)}`) : url;
};
function markLogoFailed(value) {
  const url = String(value || '').trim();
  if (!url || failedLogoUrls.value.has(url)) return;
  failedLogoUrls.value = new Set([...failedLogoUrls.value, url]);
}
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (deviceToken.value) headers.set("x-device-token", deviceToken.value);
  const response = await fetch(api(path), { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadPairingInfo() {
  if (!pairCode) return;
  const data = await request("/api/device-session/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode }) });
  pairingNeedsSignup.value = Boolean(data.needsSignup);
  pairingDeviceId.value = data.deviceId || "";
  pairingMode.value = pairingNeedsSignup.value ? "signup" : "login";
  pairingReady.value = true;
  // A trusted QR is created only by a Roku that already holds a locally saved
  // device token from a previous successful login. Exchange its one-time,
  // short-lived code for a browser token; no credentials are present in the QR.
  if (data.canAutoLogin) {
    const claimed = await request("/api/device-session/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode }) });
    deviceToken.value = claimed.token;
    appReady.value = false;
    window.localStorage.setItem("rh-device-token", claimed.token);
    pairing.value = false;
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(sourceId.value, { loadPlaylist: false }), loadLinkedDevices(), loadWeatherSettings()]);
    profiles.value = (await request("/api/account/profiles")).items || [];
    if (!activeProfileId.value && activeProfile.value) { activeProfileId.value = activeProfile.value.id; window.localStorage.setItem("rh-profile-id", activeProfileId.value); }
    await loadHomeData();
    appReady.value = true;
    return;
  }
  if (data.authenticated) {
    appReady.value = false;
    pairing.value = false;
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(sourceId.value, { loadPlaylist: false }), loadLinkedDevices(), loadWeatherSettings()]);
    profiles.value = (await request("/api/account/profiles")).items || [];
    if (!activeProfileId.value && activeProfile.value) { activeProfileId.value = activeProfile.value.id; window.localStorage.setItem("rh-profile-id", activeProfileId.value); }
    await loadHomeData();
    appReady.value = true;
  }
}

async function claimPairing() {
  authBusy.value = true;
  try {
    if (!pairCode) return;
    if (isPairingSignup.value && pairingPassword.value !== pairingPasswordConfirmation.value) throw new Error("Passwords do not match");
    const path = isPairingSignup.value ? "/api/device-session/setup" : "/api/device-session/login";
    const data = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode, email: pairingEmail.value, password: pairingPassword.value }) });
    deviceToken.value = data.token;
    appReady.value = false;
    window.localStorage.setItem("rh-device-token", data.token);
    pairing.value = false;
    window.history.replaceState({}, "", window.location.pathname);
    await request("/api/health"); online.value = true; await Promise.all([loadSources(sourceId.value, { loadPlaylist: false }), loadLinkedDevices(), loadWeatherSettings()]);
    await loadHomeData();
    appReady.value = true;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { authBusy.value = false; }
}

async function chooseProfile(profile) {
  if (!profile?.id || profileBusy.value) return;
  appReady.value = false;
  profileBusy.value = true;
  profileError.value = "";
  try {
    const data = await request(`/api/account/profiles/${encodeURIComponent(profile.id)}/select`, { method: "POST" });
    deviceToken.value = data.token;
    window.localStorage.setItem("rh-device-token", data.token);
    activeProfileId.value = profile.id;
    window.localStorage.setItem("rh-profile-id", profile.id);
    await request("/api/health");
    online.value = true;
    await Promise.all([loadSources(sourceId.value, { loadPlaylist: false }), loadLinkedDevices(), loadWeatherSettings()]);
    await loadManagedLibrary();
    await loadHomeData();
    window.sessionStorage.removeItem(profileSelectionKey);
    profileChooser.value = false;
    safariPage.value = "welcome";
    appReady.value = true;
  } catch (error) {
    profileError.value = error.message || "Could not open this profile.";
  } finally {
    profileBusy.value = false;
  }
}

const activeProfile = computed(() => profiles.value.find(profile => profile.id === activeProfileId.value) || profiles.value.find(profile => profile.isDefault) || null);
const activeProfileFirstName = computed(() => String(activeProfile.value?.name || "Profile").trim().split(/\s+/)[0]);
async function setProfileAvatar(avatar) {
  if (!activeProfile.value?.id || profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    const data = await request(`/api/account/profiles/${encodeURIComponent(activeProfile.value.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ avatar }) });
    profiles.value = profiles.value.map(profile => profile.id === data.profile.id ? data.profile : profile);
  } catch (error) { profileError.value = error.message || "Could not update the profile picture."; }
  finally { profileBusy.value = false; }
}

async function signIn() {
  authBusy.value = true;
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
    profiles.value = (await request("/api/account/profiles")).items || [];
    profileError.value = "";
    window.sessionStorage.setItem(profileSelectionKey, "1");
    pairing.value = false;
    window.history.replaceState({}, "", window.location.pathname);
    profileChooser.value = true;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { authBusy.value = false; }
}

async function signUp() {
  authBusy.value = true;
  try {
    if (pairingPassword.value !== pairingPasswordConfirmation.value) throw new Error("Passwords do not match");
    await request("/api/account/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pairingEmail.value, password: pairingPassword.value }) });
    pairingPassword.value = "";
    pairingPasswordConfirmation.value = "";
    pairingMode.value = "login";
    messageType.value = "success";
    message.value = "Account created. Sign in, then scan a Roku QR code to link your device.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { authBusy.value = false; }
}

function logout() {
  deviceToken.value = "";
  appReady.value = true;
  window.localStorage.removeItem("rh-device-token");
  window.sessionStorage.removeItem(profileSelectionKey);
  pairing.value = true;
  pairingReady.value = false;
  pairingMode.value = "login";
  pairingEmail.value = "";
  pairingPassword.value = "";
  pairingPasswordConfirmation.value = "";
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
  } catch { /* Camera may already have been released by Web. */ }
  qrScanner = null;
  scannerOpen.value = false;
}

function blurRestoredLoginFocus() {
  if (!pairing.value) return;
  const active = document.activeElement;
  if (active?.matches?.(".login-card input, .login-card select")) active.blur();
}

function enforceProfileSelection() {
  if (deviceToken.value && window.sessionStorage.getItem(profileSelectionKey)) {
    profileChooser.value = true;
    pairing.value = false;
  }
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
    const { Html5Qrcode } = await import("html5-qrcode");
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

onBeforeUnmount(stopQrScanner);
onBeforeUnmount(() => window.removeEventListener("popstate", enforceProfileSelection));
onBeforeUnmount(() => window.removeEventListener("pageshow", blurRestoredLoginFocus));
onBeforeUnmount(() => safariRailMotionTimers.forEach(timer => clearTimeout(timer)));
onBeforeUnmount(() => document.removeEventListener("keydown", handleNavigationKeydown));
onBeforeUnmount(() => {
  if (deviceStatusTimer) clearInterval(deviceStatusTimer);
  if (libraryRevisionController) libraryRevisionController.abort();
  if (libraryRevisionRetryTimer) clearTimeout(libraryRevisionRetryTimer);
});

const online = ref(false), sources = ref([]), sourceId = ref(""), linkedDevices = ref([]);
const weatherLocations = ref([null]);
const weatherQueries = ref([""]);
const weatherResults = ref([[]]);
const weatherSearching = ref([false]);
const weatherMessage = ref("");
const weatherMessageType = ref("info");
const weatherSearchTimers = [null];
const name = ref(""), url = ref(""), sourceType = ref("xtream"), sourceUsername = ref(""), sourcePassword = ref(""), editing = ref(null), busy = ref(false), loading = ref(false), message = ref(""), messageType = ref("info");
const kind = ref("channel"), items = ref([]), categories = ref([]), languages = ref([]), category = ref("all"), titleLanguage = ref("all"), query = ref("");
const selectedKeys = ref([]), savedItems = ref([]), archivedItems = ref([]), knownItems = ref({}), view = ref("library"), page = ref(1), pages = ref(1), total = ref(0), loadingMore = ref(false);
const sortBy = ref("name"), selectionFilter = ref("all");
const managedLibraryCategories = ref([]), managedLibraryItems = ref([]), categoryManagerOpen = ref(false), categoryEditorId = ref("");
const selectedSeries = ref(null), seriesEpisodes = ref([]), selectedSeasonNumber = ref(null), seriesEpisodesLoading = ref(false), seriesEpisodesError = ref("");
const categoryEditorKeys = ref([]), categoryNameDrafts = ref({}), newCategoryName = ref(""), categoryBusy = ref(false);
const homeRecommendations = ref([]);
const homeLoading = ref(false);
const homeError = ref("");
let homeRequestId = 0;
let libraryRevision = 0, libraryRevisionController = null, libraryRevisionRetryTimer = null;
const selectedCount = computed(() => selectedKeys.value.length);
const isPairingSignup = computed(() => pairingMode.value === "signup");
const savedKeys = computed(() => new Set(savedItems.value.map(item => item.key)));
const savedCount = computed(() => savedItems.value.length);
function normalizeSearchText(value) {
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
function compareCatalogTitles(a, b) {
  return String(a?.title || '').trim().localeCompare(String(b?.title || '').trim(), undefined, { numeric: true, sensitivity: 'base' })
    || String(a?.key || '').localeCompare(String(b?.key || ''));
}
const visibleItems = computed(() => {
  const filtered = items.value.filter(item => selectionFilter.value === "all"
    || (selectionFilter.value === "selected" && selectedKeys.value.includes(item.key))
    || (selectionFilter.value === "available" && !selectedKeys.value.includes(item.key) && !savedKeys.value.has(item.key)));
  return [...filtered].sort((a, b) => {
    if (sortBy.value === "recent") return String(b.added || "").localeCompare(String(a.added || ""));
    if (sortBy.value === "category") return String(a.categoryId || "").localeCompare(String(b.categoryId || "")) || a.title.localeCompare(b.title);
    return compareCatalogTitles(a, b);
  });
});
const typeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, savedItems.value.filter(item => item?.kind === value).length])));
const savedTypeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, savedItems.value.filter(item => item?.kind === value).length])));
const archiveCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, archivedItems.value.filter(item => item?.kind === value).length])));
const savedItemsForTab = computed(() => savedItems.value.filter(item => item?.kind === kind.value));
const hasMoreCatalog = computed(() => page.value < pages.value);
// Managed category assignments are the single Library shown by Roku, Web,
// and Browser. Source enabledItems remain an import pool for Playlist only.
const rokuLibraryItems = computed(() => {
  const unique = new Map();
  for (const category of managedLibraryCategories.value) {
    for (const item of category?.items || []) {
      if (!item) continue;
      const key = item.libraryKey || `${item.sourceId || "source"}:${item.kind}:${item.id || item.key}`;
      if (!unique.has(key)) unique.set(key, item);
    }
  }
  return [...unique.values()];
});
const homeRecent = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value,
  rokuLibraryItems.value
    .filter(item => item?.kind === value)
    .sort((a, b) => Number(b.added || 0) - Number(a.added || 0) || compareCatalogTitles(a, b))
    .slice(0, 10),
])));
const rokuTypeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value, rokuLibraryItems.value.filter(item => item?.kind === value).length])));
function rokuItemsForTab(value) { return rokuLibraryItems.value.filter(item => item?.kind === value); }
const managedCategoriesForTab = computed(() => managedLibraryCategories.value.filter(entry => entry?.kind === safariLibraryTab.value));
const managedItemsForTab = computed(() => managedLibraryItems.value.filter(item => item?.kind === safariLibraryTab.value));
const managedTypeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value,
  managedLibraryCategories.value.filter(category => category?.kind === value).reduce((count, category) => count + (category.items || []).filter(Boolean).length, 0),
])));
const libraryRails = computed(() => {
  return managedCategoriesForTab.value.filter(category => category.items.length).map(category => ({ id: category.id, name: category.name, items: category.items }));
});
const liveTvChannels = computed(() => {
  const channels = new Map();
  for (const category of managedLibraryCategories.value.filter(entry => entry?.kind === "channel")) {
    for (const item of category?.items || []) {
      if (!item) continue;
      const key = item.libraryKey || `${item.sourceId || "source"}:${item.id}`;
      if (!channels.has(key)) channels.set(key, { ...item, categoryName: category.name });
    }
  }
  return [...channels.values()];
});
const visibleLiveTvChannels = computed(() => liveTvChannels.value.slice(0, liveTvVisibleCount.value));
const seriesEpisodeSeasons = computed(() => {
  const seasons = new Map();
  for (const episode of seriesEpisodes.value) {
    const seasonNumber = Number(episode.seasonNumber) || 1;
    if (!seasons.has(seasonNumber)) seasons.set(seasonNumber, { number: seasonNumber, title: episode.seasonTitle || `Season ${seasonNumber}`, episodes: [] });
    seasons.get(seasonNumber).episodes.push(episode);
  }
  return [...seasons.values()]
    .sort((a, b) => a.number - b.number)
    .map(season => ({ ...season, episodes: season.episodes.sort((a, b) => (Number(a.episodeNumber) || 0) - (Number(b.episodeNumber) || 0)) }));
});
const displayedSeriesEpisodeSeasons = computed(() => seriesEpisodeSeasons.value.filter(season => season.number === selectedSeasonNumber.value));

const webPlayerSrc = computed(() => {
  const item = webNowPlaying.value;
  if (!item) return "";
  const playableSourceId = item.sourceId || sourceId.value;
  const extension = item.extension ? `?ext=${encodeURIComponent(item.extension)}` : "";
  const playableKind = ['movie', 'series', 'channel'].includes(item.kind) ? item.kind : 'movie';
  const streamFormat = String(item.streamFormat || '').trim().toLowerCase();
  const originalFormat = String(item.originalFormat || item.extension || '').trim().toLowerCase();
  const directVods = new Set(['mp4', 'm4v', 'mov']);
  const shouldUseDirect = !webForceHls.value && playableKind !== 'channel'
    && (streamFormat === 'mp4' || (!streamFormat && directVods.has(originalFormat)));
  const generated = playableSourceId && item.id
    ? (shouldUseDirect
      ? `/api/xtream/play/${encodeURIComponent(playableSourceId)}/${playableKind}/${encodeURIComponent(item.id)}${extension}`
      : `/api/xtream/hls/${encodeURIComponent(playableSourceId)}/${playableKind}/${encodeURIComponent(item.id)}/master.m3u8${extension}`)
    : "";
  // Match Roku: preserve the backend's transport decision and only generate
  // a route for older catalog items that do not carry one.
  const raw = webForceHls.value ? generated : (item.playbackUrl || item.url || generated);
  if (!raw) return "";
  const target = new URL(browserPlaybackUrl(raw));
  if (target.origin === new URL(browserStreamer).origin && webStreamTicket.value) target.searchParams.set("streamTicket", webStreamTicket.value);
  else if (deviceToken.value) target.searchParams.set("deviceToken", deviceToken.value);
  return target.toString();
});

async function loadStreamTicket(item) {
  if (!item?.sourceId || !item?.id) throw new Error("This movie does not have a playable stream.");
  let playable = item;
  if (item.kind === "series" && !item.isEpisode) {
    const details = await request(`/api/xtream/series/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}`);
    const episode = details.episodes?.[0];
    if (!episode?.id) throw new Error("This series has no playable episodes.");
    playable = { ...item, id: episode.id, title: `${item.title} · ${episode.title}`, extension: episode.extension || item.extension || "mp4", duration: episode.duration || item.duration || "" };
    webNowPlaying.value = playable;
  }
  const data = await request(`/api/xtream/stream-ticket/${encodeURIComponent(playable.sourceId)}/${encodeURIComponent(playable.kind || "movie")}/${encodeURIComponent(playable.id)}`);
  webStreamTicket.value = data.ticket || "";
  if (!webStreamTicket.value) throw new Error("Could not authorize this stream.");
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${tail}` : tail;
}

function parseDuration(value) {
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

function handleWebMetadata(event) {
  const duration = Number(event.target.duration) || 0;
  // Movie playback is delivered through a deliberately rolling HLS manifest.
  // Safari reports that short window as media duration, so it must never be
  // used as the movie's timeline length.
  if (webNowPlaying.value?.kind === "movie") return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const absoluteDuration = webPlaybackOffset.value + duration;
  // Safari can expose only the currently buffered HLS window here. Never let
  // that shorter value replace the full duration returned by Xtream.
  if (absoluteDuration > webDuration.value) webDuration.value = absoluteDuration;
}

async function loadMovieDuration(item) {
  if (!item?.sourceId || !item?.id || !['movie', 'series'].includes(item.kind)) return;
  const catalogDuration = parseDuration(item.duration);
  if (catalogDuration > 0) webDuration.value = Math.max(webDuration.value, catalogDuration);
  if (item.kind !== "movie") return;
  try {
    const params = item.extension ? `?ext=${encodeURIComponent(item.extension)}` : "";
    const data = await request(`/api/xtream/movie/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}/duration${params}`);
    if (webNowPlaying.value?.key !== item.key) return;
    const seconds = Number(data.seconds) || parseDuration(data.duration);
    if (seconds > 0) webDuration.value = Math.max(webDuration.value, seconds);
  } catch { /* The media element can still provide duration when available. */ }
}

const webRemainingTime = computed(() => Math.max(0, webDuration.value - webCurrentTime.value));
const webTimelineStyle = computed(() => {
  const percent = webDuration.value ? Math.min(100, Math.max(0, (webCurrentTime.value / webDuration.value) * 100)) : 0;
  return { "--web-progress": `${percent}%` };
});
const webUpNext = computed(() => null);

function clearWebControlsTimer() {
  if (webControlsTimer) clearTimeout(webControlsTimer);
  webControlsTimer = null;
}

function scheduleWebControlsHide() {
  clearWebControlsTimer();
  if (!webPlaying.value || webBuffering.value || webPlayerError.value) return;
  webControlsTimer = setTimeout(() => { webControlsVisible.value = false; }, 3600);
}

function showWebControls() {
  webControlsVisible.value = true;
  scheduleWebControlsHide();
}

function handleWebPlayerPointerMove(event) {
  if (!webNowPlaying.value || !event.target?.closest?.(".web-video-frame")) return;
  showWebControls();
}

function toggleWebControls(event) {
  if (event?.target?.closest?.("button, input")) return;
  // A tap on the video means playback is interactive again; clear any
  // transient buffering state so the spinner cannot remain stuck over it.
  webBuffering.value = false;
  webControlsVisible.value = !webControlsVisible.value;
  if (webControlsVisible.value) scheduleWebControlsHide(); else clearWebControlsTimer();
}

function onWebPlay() {
  webPlaying.value = true;
  webBuffering.value = false;
  scheduleWebControlsHide();
}

function onWebPause() {
  webPlaying.value = false;
  showWebControls();
}

function onWebWaiting() {
  clearTimeout(webBufferingTimer);
  webBufferingTimer = setTimeout(() => {
    const video = webVideo.value;
    if (video && !video.paused && video.readyState < 3) {
      webBuffering.value = true;
      showWebControls();
    }
  }, 300);
}

function onWebTimeUpdate(event) {
  clearTimeout(webBufferingTimer);
  webCurrentTime.value = webPlaybackOffset.value + event.target.currentTime;
  if (!event.target.paused && event.target.readyState >= 3) webBuffering.value = false;
}

function clearWebRecoveryTimer() {
  if (webRecoveryTimer) clearTimeout(webRecoveryTimer);
  webRecoveryTimer = null;
}

function handleWebVideoError() {
  if (!webNowPlaying.value) return;
  const failedSource = webPlayerSrc.value;
  if (failedSource && !isHlsPlaybackUrl(failedSource) && !webForceHls.value) {
    webForceHls.value = true;
    webPlaybackRetryCount.value = 0;
    webBuffering.value = true;
    showWebControls();
    configureMoviePlayback(webCurrentTime.value);
    return;
  }
  // A WebView can emit a media error while HLS.js is recovering a segment.
  // Keep the player alive and show the final error only after retries fail.
  if (webPlaybackRetryCount.value < 3) {
    webPlaybackRetryCount.value += 1;
    webBuffering.value = true;
    showWebControls();
    clearWebRecoveryTimer();
    webRecoveryTimer = setTimeout(() => {
      webRecoveryTimer = null;
      if (webHls) webHls.startLoad();
      else configureMoviePlayback(webPlaybackOffset.value);
    }, 900 * webPlaybackRetryCount.value);
    return;
  }
  webPlayerError.value = "Playback unavailable";
  webBuffering.value = false;
  showWebControls();
}

function onWebReady(event) {
  clearTimeout(webBufferingTimer);
  if (event?.type === "playing") webPlaying.value = true;
  webBuffering.value = false;
  webPlaybackRetryCount.value = 0;
  if (event?.type === "playing" && !webMediaReady.value) {
    const video = event.target;
    const reveal = () => {
      if (video !== webVideo.value || webMediaReady.value) return;
      video.style.opacity = "1";
      webMediaReady.value = true;
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
    else setTimeout(reveal, 500);
  }
  scheduleWebControlsHide();
}

function onWebFirstFrame() {
  webMediaReady.value = true;
  onWebReady();
}

function movieStreamUrl(startSeconds = 0) {
  const source = webPlayerSrc.value;
  if (!source) return "";
  const target = new URL(source);
  if (startSeconds > 0 && isHlsPlaybackUrl(target.toString())) target.searchParams.set("start", String(Math.floor(startSeconds)));
  return target.toString();
}

function isHlsPlaybackUrl(source) {
  try {
    const target = new URL(source);
    return target.pathname.includes('/api/xtream/hls/') || target.pathname.endsWith('.m3u8');
  } catch { return String(source || '').includes('/api/xtream/hls/'); }
}

async function configureMoviePlayback(startSeconds = 0) {
  await nextTick();
  const video = webVideo.value;
  const source = movieStreamUrl(startSeconds);
  if (!video || !source) {
    webPlayerError.value = "This movie does not have a playable stream.";
    return;
  }
  if (webHls) {
    webHls.destroy();
    webHls = null;
  }
  clearWebRecoveryTimer();
  clearTimeout(webBufferingTimer);
  video.removeAttribute("src");
  video.style.opacity = "0";
  video.load();
  try {
    const directPlayback = !isHlsPlaybackUrl(source);
    if (directPlayback) {
      video.src = source;
      await video.play();
      webPlaying.value = true;
    } else {
      const Hls = await loadHlsConstructor();
      if (Hls.isSupported()) {
        webHls = new Hls({ enableWorker: true, lowLatencyMode: false });
        webHls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (webPlaybackRetryCount.value < 3) {
            webPlaybackRetryCount.value += 1;
            webBuffering.value = true;
            showWebControls();
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) webHls.recoverMediaError();
            else {
              clearWebRecoveryTimer();
              webRecoveryTimer = setTimeout(() => webHls?.startLoad(), 900 * webPlaybackRetryCount.value);
            }
          } else {
            webPlayerError.value = "This movie could not be played right now.";
            webBuffering.value = false;
          }
        });
        webHls.on(Hls.Events.MEDIA_ATTACHED, async () => {
          try { await video.play(); webPlaying.value = true; } catch { /* The user can press Play. */ }
        });
        webHls.loadSource(source);
        webHls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source;
        await video.play();
        webPlaying.value = true;
      } else webPlayerError.value = "HLS playback is not supported on this device.";
    }
  } catch { webPlayerError.value = "This movie could not be played right now."; }
}

async function playWebMovie(item) {
  webStreamTicket.value = "";
  webForceHls.value = false;
  webNowPlaying.value = item;
  webPlaying.value = false;
  webMuted.value = false;
  webCurrentTime.value = 0;
  webDuration.value = 0;
  webPlaybackOffset.value = 0;
  webPendingSeek.value = -1;
  webMediaReady.value = false;
  webBuffering.value = true;
  webControlsVisible.value = true;
  webQuality.value = item.quality || "Auto";
  webPlayerError.value = "";
  webPlaybackRetryCount.value = 0;
  await loadStreamTicket(item);
  await loadMovieDuration(webNowPlaying.value);
  await configureMoviePlayback(0);
}

async function playLibraryItem(item) {
  stopLiveTvPreview({ clearSelection: true });
  if (item?.kind === "series" && !item.isEpisode) {
    await openSeriesEpisodes(item);
    return;
  }
  try {
    await playWebMovie(item);
  } catch (error) {
    webBuffering.value = false;
    webPlayerError.value = error?.message || "This item could not be played right now.";
    showWebControls();
  }
}

async function openSeriesEpisodes(item) {
  const requestSeriesKey = `${item?.sourceId || ""}:${item?.id || ""}`;
  selectedSeries.value = item;
  seriesEpisodes.value = [];
  selectedSeasonNumber.value = null;
  seriesEpisodesError.value = "";
  seriesEpisodesLoading.value = true;
  safariPage.value = "episodes";
  try {
    if (!item?.sourceId || !item?.id) throw new Error("This series does not have episode information.");
    const details = await request(`/api/xtream/series/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}`);
    if (`${selectedSeries.value?.sourceId || ""}:${selectedSeries.value?.id || ""}` !== requestSeriesKey) return;
    seriesEpisodes.value = (Array.isArray(details?.episodes) ? details.episodes : []).map(episode => ({
      ...episode,
      sourceId: item.sourceId,
      kind: "series",
      isEpisode: true,
      seriesId: item.id,
      seriesTitle: details.title || item.title,
      title: episode.title || `Episode ${episode.episodeNumber || ""}`.trim(),
      logo: episode.thumbnail || item.logo,
      key: `${item.sourceId}:series:${item.id}:episode:${episode.id}`,
    }));
    selectedSeasonNumber.value = seriesEpisodeSeasons.value[0]?.number ?? null;
  } catch (error) {
    if (`${selectedSeries.value?.sourceId || ""}:${selectedSeries.value?.id || ""}` === requestSeriesKey) seriesEpisodesError.value = error?.message || "The episodes could not be loaded.";
  } finally {
    if (`${selectedSeries.value?.sourceId || ""}:${selectedSeries.value?.id || ""}` === requestSeriesKey) seriesEpisodesLoading.value = false;
  }
}

function playSeriesEpisode(episode) {
  return playLibraryItem({ ...episode, title: `${episode.seriesTitle || selectedSeries.value?.title} · ${episode.title}` });
}

function stopLiveTvPreview({ clearSelection = false } = {}) {
  liveTvRequestId += 1;
  if (liveTvHls) {
    liveTvHls.destroy();
    liveTvHls = null;
  }
  const video = liveTvVideo.value;
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  liveTvLoading.value = false;
  if (clearSelection) {
    liveTvSelected.value = null;
    liveTvError.value = "";
  }
}

function stopPlaylistPreview({ clearSelection = false } = {}) {
  playlistPreviewRequestId += 1;
  if (playlistPreviewHls) {
    playlistPreviewHls.destroy();
    playlistPreviewHls = null;
  }
  const video = playlistPreviewVideo.value;
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  playlistPreviewLoading.value = false;
  if (clearSelection) {
    playlistPreviewSelected.value = null;
    playlistPreviewError.value = "";
  }
}

async function selectPlaylistPreview(item) {
  stopPlaylistPreview();
  const requestId = playlistPreviewRequestId;
  playlistPreviewSelected.value = item;
  playlistPreviewLoading.value = true;
  playlistPreviewError.value = "";
  try {
    if (!item?.sourceId || !item?.id) throw new Error("This item does not have a playable stream.");
    let playable = item;
    if (item.kind === "series") {
      const details = await request(`/api/xtream/series/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}`);
      const episode = details.episodes?.[0];
      if (!episode?.id) throw new Error("This series has no playable episodes.");
      playable = { ...item, id: episode.id, title: `${item.title} · ${episode.title}`, extension: episode.extension || item.extension || "mp4" };
    }
    const authorization = await request(`/api/xtream/stream-ticket/${encodeURIComponent(playable.sourceId)}/${encodeURIComponent(playable.kind)}/${encodeURIComponent(playable.id)}`);
    if (requestId !== playlistPreviewRequestId) return;
    if (!authorization.ticket) throw new Error("Could not authorize this item.");
    const extension = playable.extension ? `?ext=${encodeURIComponent(playable.extension)}` : "";
    const target = new URL(browserPlaybackUrl(`/api/xtream/hls/${encodeURIComponent(playable.sourceId)}/${encodeURIComponent(playable.kind)}/${encodeURIComponent(playable.id)}/master.m3u8${extension}`));
    target.searchParams.set("streamTicket", authorization.ticket);
    await nextTick();
    if (requestId !== playlistPreviewRequestId) return;
    const video = playlistPreviewVideo.value;
    if (!video) throw new Error("The preview player is unavailable.");
    const startPlayback = async () => {
      playlistPreviewLoading.value = false;
      try { await video.play(); } catch { /* Native controls remain available when autoplay is blocked. */ }
    };
    const Hls = await loadHlsConstructor();
    if (Hls.isSupported()) {
      playlistPreviewHls = new Hls({ enableWorker: true, lowLatencyMode: playable.kind === "channel", liveSyncDurationCount: 3 });
      playlistPreviewHls.on(Hls.Events.MEDIA_ATTACHED, () => playlistPreviewHls?.loadSource(target.toString()));
      playlistPreviewHls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      playlistPreviewHls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        playlistPreviewLoading.value = false;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) playlistPreviewHls?.recoverMediaError();
        else playlistPreviewError.value = "This item is unavailable right now.";
      });
      playlistPreviewHls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = target.toString();
      await startPlayback();
    } else throw new Error("Preview playback is not supported in this browser.");
  } catch (error) {
    if (requestId !== playlistPreviewRequestId) return;
    playlistPreviewLoading.value = false;
    playlistPreviewError.value = error.message || "This item is unavailable right now.";
  }
}

function handleLiveTvScroll(event) {
  const element = event.currentTarget;
  if (element.scrollTop + element.clientHeight < element.scrollHeight - 32) return;
  if (liveTvVisibleCount.value < liveTvChannels.value.length) liveTvVisibleCount.value += 20;
}

async function selectLiveTvChannel(item) {
  stopLiveTvPreview();
  const requestId = liveTvRequestId;
  liveTvSelected.value = item;
  liveTvLoading.value = true;
  liveTvError.value = "";
  try {
    if (!item?.sourceId || !item?.id) throw new Error("This channel does not have a playable stream.");
    const authorization = await request(`/api/xtream/stream-ticket/${encodeURIComponent(item.sourceId)}/channel/${encodeURIComponent(item.id)}`);
    if (requestId !== liveTvRequestId) return;
    if (!authorization.ticket) throw new Error("Could not authorize this channel.");
    const extension = item.extension ? `?ext=${encodeURIComponent(item.extension)}` : "";
    const target = new URL(browserPlaybackUrl(`/api/xtream/hls/${encodeURIComponent(item.sourceId)}/channel/${encodeURIComponent(item.id)}/master.m3u8${extension}`));
    target.searchParams.set("streamTicket", authorization.ticket);
    await nextTick();
    if (requestId !== liveTvRequestId) return;
    const video = liveTvVideo.value;
    if (!video) throw new Error("The TV preview is unavailable.");
    const startPlayback = async () => {
      try { await video.play(); } catch { /* Native controls remain available when autoplay is blocked. */ }
    };
    const Hls = await loadHlsConstructor();
    if (Hls.isSupported()) {
      liveTvHls = new Hls({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 3 });
      liveTvHls.on(Hls.Events.MEDIA_ATTACHED, () => liveTvHls?.loadSource(target.toString()));
      liveTvHls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      liveTvHls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        liveTvLoading.value = false;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) liveTvHls?.recoverMediaError();
        else liveTvError.value = "This channel is unavailable right now.";
      });
      liveTvHls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = target.toString();
      await startPlayback();
    } else throw new Error("Live TV playback is not supported in this browser.");
  } catch (error) {
    if (requestId !== liveTvRequestId) return;
    liveTvLoading.value = false;
    liveTvError.value = error.message || "This channel is unavailable right now.";
  }
}

watch([safariPage, safariLibraryTab], ([pageName, tab]) => {
  liveTvVisibleCount.value = 20;
  if (pageName !== "channels" || tab !== "channel") stopLiveTvPreview({ clearSelection: true });
  if (pageName !== "playlist") stopPlaylistPreview({ clearSelection: true });
});

watch([kind, sourceId], () => stopPlaylistPreview({ clearSelection: true }));

async function closeWebPlayer() {
  clearWebControlsTimer();
  clearWebRecoveryTimer();
  clearTimeout(webBufferingTimer);
  if (webSeekTimer) {
    clearTimeout(webSeekTimer);
    webSeekTimer = null;
  }
  if (webHls) {
    webHls.destroy();
    webHls = null;
  }
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* Fullscreen may already be closing. */ }
  }
  webVideo.value?.pause();
  webVideo.value?.removeAttribute("src");
  webVideo.value?.load();
  webNowPlaying.value = null;
  webPlaying.value = false;
  webPlayerError.value = "";
  webFullscreen.value = false;
  webPendingSeek.value = -1;
  webMediaReady.value = false;
  webBuffering.value = false;
}

async function toggleWebPlayback() {
  if (!webVideo.value) return;
  if (webVideo.value.paused) {
    try { await webVideo.value.play(); } catch { webPlayerError.value = "Playback could not start."; }
  } else webVideo.value.pause();
}

function seekWebMovie(event) {
  if (!webVideo.value) return;
  seekWebTo(Number(event.target.value));
}

function seekWebTo(target) {
  const duration = webDuration.value || Infinity;
  const next = Math.max(0, Math.min(Number(target) || 0, duration));
  webPendingSeek.value = next;
  webCurrentTime.value = next;
  showWebControls();
  if (webSeekTimer) clearTimeout(webSeekTimer);
  webSeekTimer = setTimeout(() => restartWebAt(next), 650);
}

function seekWebBy(seconds) {
  const basePosition = webPendingSeek.value >= 0 ? webPendingSeek.value : webCurrentTime.value;
  seekWebTo(basePosition + seconds);
}

async function restartWebAt(target) {
  webSeekTimer = null;
  if (!webNowPlaying.value) return;
  webPendingSeek.value = -1;
  const directSource = webPlayerSrc.value;
  if (directSource && !isHlsPlaybackUrl(directSource) && webVideo.value) {
    webPlaybackOffset.value = 0;
    webCurrentTime.value = target;
    webPlayerError.value = "";
    webBuffering.value = true;
    showWebControls();
    try {
      webVideo.value.currentTime = target;
      await webVideo.value.play();
    } catch { handleWebVideoError(); }
    return;
  }
  webPlaybackOffset.value = target;
  webCurrentTime.value = target;
  webPlayerError.value = "";
  webBuffering.value = true;
  webMediaReady.value = false;
  showWebControls();
  await configureMoviePlayback(target);
}

function toggleWebMute() {
  if (!webVideo.value) return;
  webVideo.value.muted = !webVideo.value.muted;
  webMuted.value = webVideo.value.muted;
}

async function fullscreenWebMovie(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const video = webVideo.value;
  if (!video) return;

  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  if (fullscreenElement || webFullscreen.value) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch { /* CSS fullscreen can still be closed below. */ }
    webFullscreen.value = false;
    return;
  }
  webFullscreen.value = true;
  const frame = video.closest(".web-video-frame") || video;
  try {
    if (frame.requestFullscreen) await frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch { /* Keep the CSS fullscreen layout as a usable fallback. */ }
  showWebControls();
}

onBeforeUnmount(() => {
  if (webHls) webHls.destroy();
  stopLiveTvPreview({ clearSelection: true });
  stopPlaylistPreview({ clearSelection: true });
  clearWebRecoveryTimer();
  clearTimeout(webBufferingTimer);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  document.removeEventListener("pointermove", handleWebPlayerPointerMove);
});

function handleFullscreenChange() {
  if (document.fullscreenElement || !webFullscreen.value) return;
  webFullscreen.value = false;
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("pointermove", handleWebPlayerPointerMove, { passive: true });

function typeLabel(value) { return value === "series" ? "Series" : value === "movie" ? "Movies" : "Channels"; }
function typeIcon(value) { return value === "series" ? "▦" : value === "movie" ? "▶" : "◉"; }
function streamFormatLabel(item) { return String(item?.extension || item?.streamFormat || "mp4").toUpperCase(); }

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

function applyManagedLibrary(data) {
  managedLibraryCategories.value = (Array.isArray(data?.categories) ? data.categories : []).filter(Boolean).map(category => ({ ...category, items: Array.isArray(category.items) ? category.items.filter(Boolean) : [] }));
  managedLibraryItems.value = (Array.isArray(data?.items) ? data.items : []).filter(Boolean);
  categoryNameDrafts.value = Object.fromEntries(managedLibraryCategories.value.map(category => [category.id, category.name]));
  if (categoryEditorId.value && !managedLibraryCategories.value.some(category => category.id === categoryEditorId.value)) {
    categoryEditorId.value = "";
    categoryEditorKeys.value = [];
  }
}

async function loadManagedLibrary() {
  applyManagedLibrary(await request(`/api/library/categories?refresh=${Date.now()}`, { cache: "no-store" }));
}

function homeItemKey(item) {
  return item?.libraryKey || `${item?.sourceId || "source"}:${item?.kind || item?.type || "item"}:${item?.id || item?.key || "unknown"}`;
}

function homeItem(item, kind) {
  if (!item || typeof item !== "object" || !item.id || !item.sourceId) return null;
  const resolvedKind = item.kind || item.type || kind;
  if (!["series", "movie", "channel"].includes(resolvedKind)) return null;
  const normalized = { ...item, kind: resolvedKind };
  return { ...normalized, key: homeItemKey(normalized) };
}

async function loadHomeData() {
  if (!deviceToken.value || homeLoading.value) return;
  const requestId = ++homeRequestId;
  homeLoading.value = true;
  homeError.value = "";
  try {
    const language = document.documentElement.lang === "ar" ? "arabic" : "both";
    const recommendations = await request("/api/recommendations/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language }) });
    if (requestId === homeRequestId) homeRecommendations.value = (recommendations.items || []).map(item => homeItem(item, item?.kind || item?.type)).filter(Boolean);
  } catch (error) {
    if (requestId === homeRequestId) homeRecommendations.value = [];
    if (requestId === homeRequestId && error?.status !== 404) homeError.value = "Some recommendations are temporarily unavailable.";
  } finally {
    if (requestId === homeRequestId) homeLoading.value = false;
  }
}

function playHomeItem(item) {
  if (!item?.id || !item?.sourceId) return;
  playWebMovie(item).catch(error => { homeError.value = error.message || "This item could not be played."; });
}

async function watchLibraryRevision() {
  if (!deviceToken.value || libraryRevisionController) return;
  libraryRevisionController = new AbortController();
  const controller = libraryRevisionController;
  try {
    const data = await request(`/api/library/revision?since=${libraryRevision}`, { cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted) return;
    const nextRevision = Number(data.revision) || 1;
    const changed = libraryRevision > 0 && nextRevision !== libraryRevision;
    libraryRevision = nextRevision;
    libraryRevisionController = null;
    if (changed) await loadManagedLibrary();
    watchLibraryRevision();
  } catch (error) {
    if (libraryRevisionController === controller) libraryRevisionController = null;
    if (error.name !== "AbortError") libraryRevisionRetryTimer = window.setTimeout(watchLibraryRevision, 1500);
  }
}

function openCategoryItems(category) {
  if (categoryEditorId.value === category.id) {
    categoryEditorId.value = "";
    categoryEditorKeys.value = [];
    return;
  }
  categoryEditorId.value = category.id;
  categoryEditorKeys.value = category.items.map(item => item.libraryKey);
}

function toggleCategoryItem(itemKey) {
  categoryEditorKeys.value = categoryEditorKeys.value.includes(itemKey)
    ? categoryEditorKeys.value.filter(key => key !== itemKey)
    : [...categoryEditorKeys.value, itemKey];
}

async function createManagedCategory() {
  const categoryName = newCategoryName.value.trim();
  if (!categoryName) return;
  categoryBusy.value = true;
  try {
    applyManagedLibrary(await request("/api/library/categories", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: safariLibraryTab.value, name: categoryName }),
    }));
    newCategoryName.value = "";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { categoryBusy.value = false; }
}

async function renameManagedCategory(category) {
  const categoryName = String(categoryNameDrafts.value[category.id] || "").trim();
  if (!categoryName || categoryName === category.name) return;
  categoryBusy.value = true;
  try {
    applyManagedLibrary(await request(`/api/library/categories/${encodeURIComponent(category.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: categoryName }),
    }));
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { categoryBusy.value = false; }
}

async function saveManagedCategoryItems(category) {
  categoryBusy.value = true;
  try {
    applyManagedLibrary(await request(`/api/library/categories/${encodeURIComponent(category.id)}/items`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKeys: categoryEditorKeys.value }),
    }));
    categoryEditorId.value = "";
    categoryEditorKeys.value = [];
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { categoryBusy.value = false; }
}

async function deleteManagedCategory(category) {
  if (!confirm(`Delete category “${category.name}”? Its items will remain in the Library but will not appear on Roku until assigned to another category.`)) return;
  categoryBusy.value = true;
  try {
    applyManagedLibrary(await request(`/api/library/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" }));
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { categoryBusy.value = false; }
}

async function loadSources(preferred = sourceId.value, { loadPlaylist = safariPage.value === "playlist" } = {}) {
  const data = await request("/api/xtream/sources");
  sources.value = data.items || [];
  sourceId.value = sources.value.some(item => item.id === preferred) ? preferred : (sources.value[0]?.id || "");
  const source = sources.value.find(item => item.id === sourceId.value);
  selectedKeys.value = [];
  savedItems.value = [...(source?.enabledItems || [])];
  archivedItems.value = [...(source?.archivedItems || [])];
  rememberItems([...savedItems.value, ...archivedItems.value]);
  // Provider catalogs can contain tens of thousands of rows and may take up
  // to a minute to arrive. Only request one while the Playlist page is open;
  // the Welcome and Library pages use the persisted account library instead.
  if (source) {
    if (loadPlaylist) await loadCatalog();
  } else { items.value = []; savedItems.value = []; archivedItems.value = []; }
  // Playlist only needs the provider catalog. The managed-library payload is
  // required by Series/Movies/Live TV pages and can be loaded lazily there.
  if (safariPage.value !== "playlist") await loadManagedLibrary();
}

async function loadLinkedDevices() {
  const data = await request(`/api/account/devices?refresh=${Date.now()}`, { cache: "no-store" });
  linkedDevices.value = data.items || [];
}

async function loadWeatherSettings() {
  if (!deviceToken.value) return;
  const data = await request("/api/account/weather-locations");
  const locations = Array.isArray(data.locations) ? data.locations.slice(0, 1) : [];
  while (locations.length < 1) locations.push(null);
  weatherLocations.value = locations;
  weatherQueries.value = locations.map(location => location?.label || "");
}

function searchWeatherLocations(slot) {
  const index = slot - 1;
  window.clearTimeout(weatherSearchTimers[index]);
  weatherResults.value[index] = [];
  const query = String(weatherQueries.value[index] || "").trim();
  if (query.length < 2) {
    weatherSearching.value[index] = false;
    return;
  }
  weatherSearching.value[index] = true;
  weatherSearchTimers[index] = window.setTimeout(async () => {
    try {
      const language = document.documentElement.lang === "ar" ? "ar" : "en";
      const data = await request(`/api/roku/weather-locations/search?q=${encodeURIComponent(query)}&language=${language}`);
      weatherResults.value[index] = data.locations || [];
    } catch (error) {
      weatherMessageType.value = "error";
      weatherMessage.value = error.message;
    } finally {
      weatherSearching.value[index] = false;
    }
  }, 350);
}

async function selectWeatherLocation(slot, selectedIndex) {
  const index = slot - 1;
  const location = weatherResults.value[index][Number(selectedIndex)];
  if (!location) return;
  const locations = [...weatherLocations.value];
  locations[index] = location;
  weatherLocations.value = locations;
  weatherQueries.value[index] = location.label;
  weatherResults.value[index] = [];
  try {
    const data = await request("/api/account/weather-locations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locations }),
    });
    weatherLocations.value = data.locations;
    weatherMessageType.value = "success";
    weatherMessage.value = `${location.label} saved for weather location ${slot}.`;
  } catch (error) {
    weatherMessageType.value = "error";
    weatherMessage.value = error.message;
  }
}

let catalogRequestId = 0;
let catalogController = null;
const playlistRequestSize = 20;
async function loadCatalog(reset = true) {
  if (!sourceId.value) return;
  if (!reset && (loading.value || loadingMore.value || !hasMoreCatalog.value)) return;
  if (reset) {
    page.value = 1;
    items.value = [];
    loadingMore.value = false;
    if (catalogController) catalogController.abort();
  }
  const requestId = ++catalogRequestId;
  catalogController = new AbortController();
  const requestedSourceId = sourceId.value;
  const requestedKind = kind.value;
  const normalizedQuery = normalizeSearchText(query.value);
  const requestedPage = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  message.value = "";
  try {
  const params = new URLSearchParams({ sourceId: requestedSourceId, kind: requestedKind, category: category.value, titleLanguage: titleLanguage.value, q: normalizedQuery, page: String(requestedPage), limit: String(playlistRequestSize) });
    const data = await request(`/api/xtream/catalog?${params}`, { signal: catalogController.signal });
    if (requestId !== catalogRequestId || requestedSourceId !== sourceId.value || requestedKind !== kind.value) return;
    const nextItems = data.items || [];
    const mergedItems = reset ? nextItems : [...items.value, ...nextItems.filter(item => !items.value.some(existing => existing.key === item.key))];
    items.value = mergedItems.sort(compareCatalogTitles);
    rememberItems(nextItems);
    categories.value = data.categories || [];
    languages.value = data.languages || [];
    page.value = data.pagination?.page || requestedPage;
    pages.value = data.pagination?.pageCount || 1;
    total.value = data.pagination?.total || 0;
  } catch (error) {
    if (error.name !== "AbortError" && requestId === catalogRequestId) { message.value = error.message; messageType.value = "error"; }
  }
  finally {
    if (requestId === catalogRequestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function handlePlaylistScroll(event) {
  const element = event.currentTarget;
  const distanceFromLastItem = element.scrollHeight - element.clientHeight - element.scrollTop;
  if (distanceFromLastItem <= 32) loadCatalog(false);
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
      body: JSON.stringify({ name: name.value, type: sourceType.value, url: url.value, username: sourceUsername.value, password: sourcePassword.value }),
    });
    name.value = ""; url.value = ""; sourceType.value = "xtream"; sourceUsername.value = ""; sourcePassword.value = ""; editing.value = null;
    await loadSources(data.id);
    messageType.value = "success";
    message.value = "Source saved.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}

function editSource(source) { editing.value = source.id; name.value = source.name; sourceType.value = source.type || "xtream"; url.value = source.endpoint || ""; sourceUsername.value = ""; sourcePassword.value = ""; }
function cancelEdit() { editing.value = null; name.value = ""; url.value = ""; sourceType.value = "xtream"; sourceUsername.value = ""; sourcePassword.value = ""; }
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
async function addPlaylistItem(item) {
  if (busy.value || savedKeys.value.has(item.key)) return;
  busy.value = true;
  try {
    rememberItems([item]);
    const enabledItems = [...new Map([...savedItems.value, item].map(entry => [entry.key, entry])).values()];
    const data = await request(`/api/xtream/sources/${sourceId.value}/selection`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabledKeys: enabledItems.map(entry => entry.key), enabledItems }),
    });
    applySource(data);
    await loadManagedLibrary();
    selectedKeys.value = selectedKeys.value.filter(key => key !== item.key);
    messageType.value = "success";
    message.value = `Added “${item.title}” to the library.`;
  } catch (error) {
    messageType.value = "error";
    message.value = error.message;
  } finally {
    busy.value = false;
  }
}
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
    await loadManagedLibrary();
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
    await loadManagedLibrary();
    messageType.value = "success";
    message.value = `Removed “${item.title}” from Roku.`;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}
async function archiveSaved(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}`, { method: "POST" }));
    await loadManagedLibrary();
    messageType.value = "success";
    message.value = "Item archived and removed from Roku.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}
async function restoreArchived(item) {
  busy.value = true;
  try {
    applySource(await request(`/api/xtream/sources/${sourceId.value}/archive/${encodeURIComponent(item.key)}/restore`, { method: "POST" }));
    await loadManagedLibrary();
    messageType.value = "success";
    message.value = "Item restored to the Roku library.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { busy.value = false; }
}

let searchTimer;
let deviceStatusTimer;
watch(safariPage, value => window.localStorage.setItem("rh-safari-page", value === "episodes" ? "series" : value));
watch(safariLibraryTab, value => window.localStorage.setItem("rh-safari-library-tab", value));
watch(safariPage, value => {
  if (!deviceToken.value) return;
  const pageRequest = value === "playlist" ? loadSources() : loadManagedLibrary();
  pageRequest.catch(error => {
    messageType.value = "error";
    message.value = error.message;
  });
  if (value === "welcome") loadHomeData();
});
watch(query, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadCatalog(), 350); });
watch(category, () => loadCatalog());
watch(titleLanguage, () => loadCatalog());
onMounted(async () => {
  document.addEventListener("keydown", handleNavigationKeydown);
  window.addEventListener("popstate", enforceProfileSelection);
  window.addEventListener("pageshow", blurRestoredLoginFocus);
  if (pairing.value) {
    blurRestoredLoginFocus();
    window.setTimeout(blurRestoredLoginFocus, 0);
  }
  try {
    if (pairCode) {
      await loadPairingInfo();
      return;
    }
    if (!deviceToken.value) return;
    if (window.sessionStorage.getItem(profileSelectionKey)) {
      profiles.value = (await request("/api/account/profiles")).items || [];
      profileError.value = "";
      pairing.value = false;
      profileChooser.value = true;
      appReady.value = false;
      return;
    }
    const healthRequest = request("/api/health");
    await Promise.all([healthRequest, loadSources(sourceId.value, { loadPlaylist: false }), loadLinkedDevices(), loadWeatherSettings()]);
    profiles.value = (await request("/api/account/profiles")).items || [];
    if (!activeProfileId.value && activeProfile.value) { activeProfileId.value = activeProfile.value.id; window.localStorage.setItem("rh-profile-id", activeProfileId.value); }
    online.value = true;
    // Totals and recommendations enrich an already usable page and must not
    // delay startup when an IPTV provider is slow or unavailable.
    await loadHomeData();
    appReady.value = true;
    if (safariPage.value === "playlist") loadSources().catch(error => {
      messageType.value = "error";
      message.value = error.message;
    });
    watchLibraryRevision();
    deviceStatusTimer = window.setInterval(() => {
      if (!pairing.value && deviceToken.value) loadLinkedDevices().catch(() => {});
    }, 10_000);
  } catch (error) { online.value = false; messageType.value = "error"; message.value = error.message; appReady.value = true; }
});
</script>

<template>
  <main class="shell" :class="{ 'safari-app-mode': browserApp, 'login-shell': pairing }">
    <section v-if="pairing" class="pairing-gate login-gate">
      <div class="pairing-card login-card" :class="{ 'login-card-plain': !pairCode }">
        <div class="login-art">
          <img class="login-rh-art" src="/login/rh-login-art.png" alt="">
        </div>
        <div class="login-brand"><img class="login-brand-mark" src="/login/rh-login-mark.png" alt="RH"><span>IPTV PLAYER</span></div>
        <p v-if="pairCode" class="eyebrow">ROKU LIBRARY</p>
        <h1 v-if="pairCode && isPairingSignup">Create your account</h1>
        <h1 v-else-if="pairCode">Open your Roku library</h1>
        <h1 v-else-if="!isPairingSignup">Sign in to your library</h1>
        <h1 v-else>Create your account</h1>
        <p v-if="pairCode && !pairingReady">Checking the secure Roku link…</p>
        <template v-else-if="pairCode">
          <p>{{ isPairingSignup ? 'Create an account to activate this Roku and manage its library from your phone.' : 'Sign in to link this Roku and open its library. The TV will connect automatically.' }}</p>
          <p class="pairing-device-code">You are linking Roku device <code>{{ pairingDeviceId || pairCode }}</code>. This device identity is saved with your account; your email address and password are never stored in or shared through the QR code.</p>
          <form @submit.prevent="claimPairing">
            <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <label>Password<input v-model="pairingPassword" type="password" minlength="8" required :autocomplete="isPairingSignup ? 'new-password' : 'current-password'" placeholder="Your password"></label>
            <label v-if="isPairingSignup">Confirm password<input v-model="pairingPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password" placeholder="Repeat password"></label>
            <button type="submit" class="primary-action login-submit" :disabled="authBusy"><span v-if="authBusy" class="login-spinner" aria-hidden="true"></span><span>{{ isPairingSignup ? 'Create account & activate Roku' : 'Sign in & link Roku' }}</span></button>
            <button v-if="pairingNeedsSignup" type="button" class="source-action" @click="pairingMode = isPairingSignup ? 'login' : 'signup'">{{ isPairingSignup ? 'I already have an account' : 'Create a new account' }}</button>
          </form>
        </template>
        <template v-else-if="!isPairingSignup">
          <template v-if="!scannerOpen">
            <form @submit.prevent="signIn">
              <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
              <label>Password<input v-model="pairingPassword" type="password" minlength="8" required autocomplete="current-password" placeholder="Your password"></label>
              <label v-if="loginDevices.length">Roku device<select v-model="selectedLoginDevice" required><option v-for="device in loginDevices" :key="device.deviceId" :value="device.deviceId">{{ device.label }}</option></select></label>
              <button type="submit" class="primary-action login-submit" :disabled="authBusy"><span v-if="authBusy" class="login-spinner" aria-hidden="true"></span><span>Sign in</span></button>
            </form>
            <p class="login-scan-copy">To link a new Roku, scan its QR code.</p>
            <button type="button" class="source-action scan-action" @click="startQrScanner">Scan Roku QR code</button>
          </template>
          <div v-if="scannerOpen" class="scanner-panel"><div id="qr-reader"></div><button type="button" class="source-action" @click="stopQrScanner">Cancel scan</button></div>
          <p v-if="scannerError" class="xtream-message is-error">{{ scannerError }}</p>
        </template>
        <template v-else>
          <p>Create an account to manage your Roku library. You can link a Roku after signing up.</p>
          <form @submit.prevent="signUp">
            <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <label>Password<input v-model="pairingPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters"></label>
            <label>Confirm password<input v-model="pairingPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password" placeholder="Repeat password"></label>
            <button type="submit" class="primary-action login-submit" :disabled="authBusy"><span v-if="authBusy" class="login-spinner" aria-hidden="true"></span><span>Create account</span></button>
            <button type="button" class="source-action" @click="pairingMode = 'login'">I already have an account</button>
          </form>
        </template>
        <p v-if="message" :class="['xtream-message', `is-${messageType}`]">{{ message }}</p>
      </div>
    </section>
    <section v-else-if="profileChooser" class="profile-chooser-page">
      <div class="profile-chooser-inner">
        <p class="eyebrow">RH LIBRARY</p>
        <h1>Who's watching?</h1>
        <p class="profile-chooser-copy">Choose a profile to open your personalized library.</p>
        <div class="profile-grid">
          <button v-for="profile in profiles" :key="profile.id" type="button" class="profile-option" :disabled="profileBusy" @click="chooseProfile(profile)">
            <span class="profile-avatar" :class="`profile-avatar-${profile.avatar || 'lime'}`">{{ profile.name.slice(0, 1).toUpperCase() }}</span>
            <strong>{{ profile.name }}</strong>
            <small>{{ profile.isDefault ? 'Main profile' : 'Library profile' }}</small>
          </button>
        </div>
        <p v-if="profileError" class="profile-error" role="alert">{{ profileError }}</p>
      </div>
    </section>
    <template v-else>
    <template v-if="browserApp">
      <div class="home-background" aria-hidden="true"></div>
      <div class="home-aurora home-aurora-one" aria-hidden="true"></div>
      <div class="home-aurora home-aurora-two" aria-hidden="true"></div>
      <div class="home-overlay" aria-hidden="true"></div>
    </template>
    <nav class="topbar">
      <div class="brand"><img class="app-brand-mark" src="/login/rh-login-mark.png" alt="RH"><span>IPTV Player</span></div>
      <div class="topbar-actions"><span class="status"><i :class="{offline:!online}"></i>{{ online ? "Backend online" : "Backend offline" }}</span><button type="button" class="logout-button" @click="logout">Log out</button></div>
    </nav>
    <section v-if="browserApp" class="browser-app-shell" :class="{ 'is-loading': !appReady }">
      <div v-if="!appReady" class="safari-app-loading" role="status" aria-live="polite" aria-label="Loading library"><span class="safari-app-loading-spinner" aria-hidden="true"></span></div>
      <aside class="browser-sidebar">
        <div class="browser-sidebar-brand"><img class="app-brand-mark" src="/login/rh-login-mark.png" alt="RH"></div>
        <nav aria-label="Main menu"><button v-for="item in safariMenuItems" :key="item.id" type="button" :class="{active:safariPage === item.id}" :aria-label="item.label" :title="item.label" @click="openSafariPage(item.id)"><span class="browser-sidebar-icon"><img v-if="typeof item.icon === 'string'" :src="item.icon" alt=""><component v-else :is="item.icon" /></span></button></nav>
      </aside>
      <div class="browser-main"><div class="safari-page-shell">
      <article v-if="safariPage === 'welcome'" class="safari-page safari-welcome-page">
        <header class="home-hero">
          <div class="home-hero-copy">
            <button v-if="activeProfile" type="button" class="welcome-profile-button" aria-label="Change profile" title="Change profile" @click="profileChooser = true"><span class="profile-avatar" :class="`profile-avatar-${activeProfile.avatar || 'lime'}`">{{ activeProfileFirstName.slice(0, 1).toUpperCase() }}</span></button>
            <p class="eyebrow">WELCOME BACK</p>
            <h1>Your library,<br><em>ready to watch.</em></h1>
            <p>Pick up where you left off or discover something new from your connected library.</p>
          </div>
          <section class="home-saved-stats" aria-label="Saved library items"><div class="home-stat-card"><strong>{{ rokuTypeCounts.series || 0 }}</strong><span><b>SAVED</b> SERIES</span></div><div class="home-stat-card"><strong>{{ rokuTypeCounts.movie || 0 }}</strong><span><b>SAVED</b> MOVIES</span></div><div class="home-stat-card"><strong>{{ rokuTypeCounts.channel || 0 }}</strong><span><b>SAVED</b> LIVE CHANNELS</span></div></section>
        </header>

        <div v-if="homeLoading" class="home-loading" role="status"><span class="loading-ring"></span><span>Refreshing recommendations…</span></div>
        <p v-else-if="homeError" class="home-error" role="status">{{ homeError }}</p>

        <section v-if="homeRecommendations.length" class="home-rail home-ai-rail">
          <header><div><p class="eyebrow">AI CURATED</p><h2>Recommended for you</h2></div><span>{{ homeRecommendations.length }} picks</span></header>
          <div class="home-rail-track" @scroll="handleSafariRailScroll($event, 'ai')"><button v-for="item in homeRecommendations" :key="homeItemKey(item)" type="button" class="home-content-card" @click="openAddPageForItem(item)"><span class="home-card-art"><img v-if="item.logo && !failedLogoUrls.has(item.logo)" :src="imageUrl(item.logo)" :alt="item.title" @error="markLogoFailed(item.logo)"><span v-else>{{ typeIcon(item.kind) }}</span><b>{{ typeLabel(item.kind) }}</b></span><strong>{{ item.title }}</strong><small>{{ item.recommendationReason || item.category || typeLabel(item.kind) }}</small><em class="home-add-action">Add to library</em></button></div>
        </section>

        <template v-for="rail in [{kind:'series', title:'Saved series'}, {kind:'movie', title:'Saved movies'}, {kind:'channel', title:'Saved live channels'}]" :key="rail.kind">
          <section v-if="homeRecent[rail.kind]?.length" class="home-rail">
            <header><div><p class="eyebrow">RECENTLY SAVED</p><h2>{{ rail.title }}</h2></div><button type="button" class="home-see-all" @click="openBrowserLibrary(rail.kind)">See all <span>→</span></button></header>
            <div class="home-rail-track" @scroll="handleSafariRailScroll($event, `recent-${rail.kind}`)"><button v-for="item in homeRecent[rail.kind]" :key="homeItemKey(item)" type="button" class="home-content-card" @click="playLibraryItem(item)"><span class="home-card-art"><img v-if="item.logo && !failedLogoUrls.has(item.logo)" :src="imageUrl(item.logo)" :alt="item.title" @error="markLogoFailed(item.logo)"><span v-else>{{ typeIcon(item.kind) }}</span><b>{{ typeLabel(item.kind) }}</b></span><strong>{{ item.title }}</strong><small>{{ item.category || item.categoryId || 'Saved in your library' }}</small><em class="home-add-action">Play</em></button></div>
          </section>
        </template>
      </article>

      <article v-else-if="safariPage === 'playlist'" class="safari-page safari-playlist-page web-playlist-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>Manage playlist</h1></div></div>
        <form v-if="!sources.length" class="web-playlist-source-form" @submit.prevent="saveSource"><input v-model="name" required placeholder="Playlist name"><input v-model="url" required placeholder="Xtream playlist URL" spellcheck="false"><button type="submit" class="primary-action" :disabled="busy">Add playlist</button></form>
        <template v-else>
          <div class="web-playlist-source"><div class="playlist-control"><span>PLAYLIST SOURCE</span><select :value="sourceId" @change="chooseSource($event.target.value)"><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select></div><div class="playlist-control"><span>PLAYLIST SECTION</span><select :value="kind" @change="chooseKind($event.target.value)"><option value="series">Series</option><option value="movie">Movies</option><option value="channel">Live TV</option></select></div><label class="playlist-control playlist-search-control"><span class="playlist-control-eyebrow">SEARCH PLAYLIST</span><span class="playlist-search-input"><span aria-hidden="true">⌕</span><input v-model="query" placeholder="Search this playlist"></span></label></div>
          <div v-if="loading" class="browser-playlist-loading" role="status" aria-live="polite"><span class="loading-ring" aria-hidden="true"></span><span>Loading {{ typeLabel(kind).toLowerCase() }}…</span></div>
          <div v-else-if="visibleItems.length" class="browser-playlist-browser">
            <section class="browser-playlist-preview" aria-label="Playlist preview">
              <div class="live-tv-screen">
                <video ref="playlistPreviewVideo" playsinline @loadstart="playlistPreviewLoading = true" @playing="playlistPreviewLoading = false" @waiting="playlistPreviewLoading = true" @stalled="playlistPreviewLoading = true" @error="playlistPreviewLoading = false; playlistPreviewError = 'This item is unavailable right now.'"></video>
                <div v-if="!playlistPreviewSelected" class="live-tv-placeholder"><span>PREVIEW</span><strong>Select an item from the table</strong></div>
                <div v-else-if="playlistPreviewLoading" class="live-tv-loader" aria-label="Loading preview"></div>
                <p v-if="playlistPreviewError" class="live-tv-error">{{ playlistPreviewError }}</p>
              </div>
              <footer><span class="live-tv-on-air">{{ kind === 'channel' ? 'LIVE' : 'VOD' }}</span><div><strong>{{ playlistPreviewSelected?.title || 'Playlist preview' }}</strong><small>{{ playlistPreviewSelected ? (playlistPreviewSelected.categoryId || 'Uncategorized') : 'Choose an item from the table' }}</small></div></footer>
            </section>
            <div class="web-playlist-items browser-playlist-table" @scroll="handlePlaylistScroll">
              <div class="browser-playlist-header"><span>ITEM</span><span>ID</span><span>STATUS</span></div>
              <div v-for="item in visibleItems" :key="item.key" class="browser-playlist-row" :class="{enabled:savedKeys.has(item.key),previewing:playlistPreviewSelected?.key === item.key}" tabindex="0" role="button" @click="selectPlaylistPreview(item)" @keydown.enter="selectPlaylistPreview(item)">
                <span class="browser-playlist-item"><span class="web-playlist-icon browser-item-poster" :class="{'channel-logo':kind === 'channel'}"><img v-if="item.logo && !failedLogoUrls.has(item.logo)" :src="imageUrl(item.logo)" :alt="item.title" @error="markLogoFailed(item.logo)"><span v-else-if="kind === 'channel'" class="channel-name-fallback">{{ item.title }}</span><template v-else><img src="/home-background.png" alt=""><b>{{ typeIcon(kind) }}</b></template></span><span class="browser-playlist-copy"><strong>{{ item.title }}</strong><small>{{ item.categoryId || 'Uncategorized' }}</small></span></span>
                <code>{{ item.id }}</code>
                <button type="button" class="browser-playlist-status" :class="savedKeys.has(item.key) ? 'is-added' : 'is-available'" :disabled="busy || savedKeys.has(item.key)" @click.stop="addPlaylistItem(item)">{{ savedKeys.has(item.key) ? 'Added' : 'Add' }}</button>
              </div>
              <div v-if="loadingMore" class="browser-playlist-loading-more">Loading more…</div>
            </div>
          </div>
          <p v-else class="web-empty">No matching {{ typeLabel(kind).toLowerCase() }} found.</p>
        </template>
      </article>

      <article v-if="safariPage === 'episodes'" class="safari-page safari-episodes-page">
        <div class="safari-episodes-heading"><button type="button" class="web-player-back" aria-label="Back to Series" @click="openSafariPage('series')">‹</button><div><p class="eyebrow">EPISODES</p><h1>{{ selectedSeries?.title || 'Series' }}</h1><span v-if="seriesEpisodes.length">{{ seriesEpisodes.length }} episode{{ seriesEpisodes.length === 1 ? '' : 's' }}</span></div></div>
        <div v-if="seriesEpisodesLoading" class="home-loading" role="status"><span class="loading-ring"></span><span>Loading episodes…</span></div>
        <p v-else-if="seriesEpisodesError" class="home-error" role="status">{{ seriesEpisodesError }}</p>
        <div v-else-if="seriesEpisodeSeasons.length" class="series-episodes-content">
          <nav class="series-season-selector" aria-label="Select season">
            <button v-for="season in seriesEpisodeSeasons" :key="season.number" type="button" :class="{active:selectedSeasonNumber === season.number}" @click="selectedSeasonNumber = season.number">{{ season.title }}</button>
          </nav>
          <div class="series-seasons">
            <section v-for="season in displayedSeriesEpisodeSeasons" :key="season.number" class="series-season">
              <header><h2>{{ season.title }}</h2><span>{{ season.episodes.length }} episode{{ season.episodes.length === 1 ? '' : 's' }}</span></header>
              <div class="series-episode-list">
                <button v-for="episode in season.episodes" :key="episode.key" type="button" class="series-episode" :aria-label="`Play ${episode.title}`" @click="playSeriesEpisode(episode)">
                  <span class="series-episode-copy"><small>Episode {{ episode.episodeNumber }}</small><strong>{{ episode.title }}</strong><em v-if="episode.duration">{{ episode.duration }}</em></span><span class="series-episode-play" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6.51 18.87a1 1 0 0 0 1-.01l10-6c.3-.18.49-.51.49-.86s-.18-.68-.49-.86l-10-6a.99.99 0 0 0-1.01-.01c-.31.18-.51.51-.51.87v12c0 .36.19.69.51.87ZM8 7.77 15.06 12 8 16.23z"></path></svg></span>
                </button>
              </div>
            </section>
          </div>
        </div>
        <p v-else class="web-empty">No episodes are available for this series.</p>
      </article>

      <article v-if="['series', 'movies', 'channels'].includes(safariPage)" class="safari-page safari-library-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>{{ safariLibraryTab === 'channel' ? 'Live TV' : typeLabel(safariLibraryTab) }}</h1></div><div class="library-heading-actions"><span>{{ managedTypeCounts[safariLibraryTab] || 0 }} items</span></div></div>
        <section v-if="categoryManagerOpen" class="library-category-manager">
          <header><div><p class="eyebrow">ROKU RAILS</p><h2>Manage {{ safariLibraryTab === 'channel' ? 'Live TV' : typeLabel(safariLibraryTab) }} categories</h2></div><span>Playlist categories are imported automatically. Your changes control both this Library and Roku.</span></header>
          <form class="library-category-create" @submit.prevent="createManagedCategory"><input v-model="newCategoryName" required maxlength="120" placeholder="New category name"><button type="submit" class="primary-action" :disabled="categoryBusy">Add category</button></form>
          <div class="library-category-list">
            <article v-for="managedCategory in managedCategoriesForTab" :key="managedCategory.id" class="library-category-entry">
              <div class="library-category-row"><input v-model="categoryNameDrafts[managedCategory.id]" maxlength="120" aria-label="Category name"><span>{{ managedCategory.items.length }} items</span><button type="button" class="source-action" :disabled="categoryBusy" @click="renameManagedCategory(managedCategory)">Rename</button><button type="button" class="source-action" :disabled="categoryBusy" @click="openCategoryItems(managedCategory)">{{ categoryEditorId === managedCategory.id ? 'Close items' : 'Edit items' }}</button><button type="button" class="source-delete" :disabled="categoryBusy" @click="deleteManagedCategory(managedCategory)">Delete</button></div>
              <div v-if="categoryEditorId === managedCategory.id" class="library-category-items">
                <label v-for="managedItem in managedItemsForTab" :key="managedItem.libraryKey"><input type="checkbox" :checked="categoryEditorKeys.includes(managedItem.libraryKey)" @change="toggleCategoryItem(managedItem.libraryKey)"><span class="safari-library-art"><img v-if="managedItem.logo" :src="imageUrl(managedItem.logo)" :alt="managedItem.title"><b v-else>{{ typeIcon(safariLibraryTab) }}</b></span><strong>{{ managedItem.title }}</strong></label>
                <button type="button" class="primary-action" :disabled="categoryBusy" @click="saveManagedCategoryItems(managedCategory)">Save category items</button>
              </div>
            </article>
          </div>
        </section>
        <div v-if="safariLibraryTab === 'channel' && liveTvChannels.length" class="live-tv-browser live-tv-player-browser">
          <section class="live-tv-channel-list" aria-label="Live TV channels">
            <div class="live-tv-table-body" @scroll="handleLiveTvScroll">
              <header class="live-tv-table-row live-tv-table-header"><span>Channel</span><span>Key</span><span>ID</span><span>Category ID</span><span>Category</span><span>Format</span><span>Duration</span><span>Rating</span><span>Added</span><span>Status</span></header>
              <button v-for="channel in visibleLiveTvChannels" :key="channel.libraryKey || `${channel.sourceId}:${channel.id}`" type="button" class="live-tv-table-row" :aria-label="`Play ${channel.title}`" @click="playLibraryItem(channel)">
                <span class="live-tv-channel"><span class="live-tv-channel-logo"><img v-if="channel.logo && !failedLogoUrls.has(channel.logo)" :src="imageUrl(channel.logo)" :alt="channel.title" @error="markLogoFailed(channel.logo)"><span v-else class="channel-name-fallback">{{ channel.title }}</span></span><strong>{{ channel.title }}</strong></span>
                <code>{{ channel.key || channel.libraryKey || '—' }}</code><code>{{ channel.id || '—' }}</code><code>{{ channel.categoryId || '—' }}</code><span>{{ channel.categoryName || channel.category || '—' }}</span><span>{{ streamFormatLabel(channel) }}</span><span>{{ channel.duration || '—' }}</span><span>{{ channel.rating || '—' }}</span><span>{{ channel.added || '—' }}</span><span>Play</span>
              </button>
            </div>
          </section>
        </div>
        <div v-else-if="safariLibraryTab !== 'channel' && libraryRails.length" class="safari-library-rails">
          <section v-for="rail in libraryRails" :key="rail.id" class="safari-library-rail">
            <header><h2>{{ rail.name }}</h2><span>{{ rail.items.length }}</span></header>
            <div class="safari-library-rail-track" :class="{'is-scrolling-left': safariRailMotion[rail.name] === 'left', 'is-scrolling-right': safariRailMotion[rail.name] === 'right'}" @scroll="handleSafariRailScroll($event, rail.name)">
              <button v-for="item in rail.items" :key="item.libraryKey" type="button" class="is-add-item is-playable" :aria-label="`Play ${item.title}`" @click="playLibraryItem(item)"><span class="safari-library-art"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><template v-else><img class="safari-library-fallback" src="/home-background.png" alt=""><b>{{ typeIcon(safariLibraryTab) }}</b></template><span v-if="safariLibraryTab !== 'channel'" class="safari-library-format">{{ streamFormatLabel(item) }}</span></span><span><strong>{{ item.title }}</strong></span><em>Play</em></button>
            </div>
          </section>
        </div>
        <p v-else class="web-empty safari-library-empty">No {{ typeLabel(safariLibraryTab).toLowerCase() }} are enabled yet. Add them from Playlist.</p>
      </article>

      <article v-if="safariPage === 'settings'" class="safari-page safari-settings-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>Settings</h1></div></div>
        <div class="web-settings-card"><span>Account</span><strong>{{ linkedDevices.length }} linked Roku device{{ linkedDevices.length === 1 ? '' : 's' }}</strong></div>
        <section v-if="activeProfile" class="settings-profile-card">
          <div class="settings-section-heading"><div><p class="eyebrow">PROFILE</p><h2>Profile picture</h2></div><span>{{ activeProfile.name }}</span></div>
          <div class="profile-picture-options" role="radiogroup" aria-label="Choose profile picture">
            <button v-for="avatar in ['lime','teal','amber','violet','rose','blue']" :key="avatar" type="button" class="profile-picture-option" :class="[`profile-avatar-${avatar}`, {selected: activeProfile.avatar === avatar}]" :aria-checked="activeProfile.avatar === avatar" role="radio" :disabled="profileBusy" @click="setProfileAvatar(avatar)">{{ activeProfileFirstName.slice(0, 1).toUpperCase() }}</button>
          </div>
          <p v-if="profileError" class="profile-error" role="alert">{{ profileError }}</p>
        </section>
        <section class="weather-settings">
          <div class="settings-section-heading"><div><p class="eyebrow">WELCOME WEATHER</p><h2>Weather locations</h2></div><span>Shown on Roku</span></div>
          <div class="weather-location-grid">
            <label>
              <span>Location 1</span>
              <input v-model="weatherQueries[0]" type="search" autocomplete="off" placeholder="Search city or postal code" @input="searchWeatherLocations(1)">
              <small v-if="weatherSearching[0]">Searching…</small>
              <select v-if="weatherResults[0].length" value="" @change="selectWeatherLocation(1, $event.target.value)">
                <option value="" disabled>Select a location</option>
                <option v-for="(location, resultIndex) in weatherResults[0]" :key="`${location.id}-${resultIndex}`" :value="resultIndex">{{ location.label }}</option>
              </select>
              <small v-else-if="weatherLocations[0]">Saved: {{ weatherLocations[0].label }}</small>
            </label>
          </div>
          <p v-if="weatherMessage" :class="['weather-settings-message', `is-${weatherMessageType}`]">{{ weatherMessage }}</p>
        </section>
        <section class="settings-playlists">
          <div class="settings-section-heading"><div><p class="eyebrow">PLAYLISTS</p><h2>Manage playlists</h2></div><span>{{ sources.length }} total</span></div>
          <form class="settings-playlist-form" @submit.prevent="saveSource">
            <label>Playlist type<select v-model="sourceType"><option value="m3u">M3U</option><option value="xtream">Xtream</option></select></label>
            <label>Playlist name<input v-model="name" required placeholder="My playlist"></label>
            <label class="settings-playlist-link">Playlist link<input v-model="url" type="url" required :placeholder="sourceType === 'm3u' ? 'https://provider.com/playlist.m3u' : 'https://provider.com'" spellcheck="false"></label>
            <template v-if="sourceType === 'xtream'">
              <label>Username<input v-model="sourceUsername" :required="!editing" autocomplete="username" :placeholder="editing ? 'Leave blank to keep current' : 'Username'"></label>
              <label>Password<input v-model="sourcePassword" type="password" :required="!editing" autocomplete="new-password" :placeholder="editing ? 'Leave blank to keep current' : 'Password'"></label>
            </template>
            <div class="settings-playlist-form-actions"><button type="submit" class="primary-action" :disabled="busy">{{ editing ? 'Save changes' : 'Add playlist' }}</button><button v-if="editing" type="button" class="source-action" @click="cancelEdit">Cancel</button></div>
          </form>
          <p v-if="message" :class="['settings-playlist-message', `is-${messageType}`]">{{ message }}</p>
          <div v-if="sources.length" class="settings-playlist-list"><article v-for="source in sources" :key="source.id"><div class="settings-playlist-copy"><span>{{ (source.type || 'xtream').toUpperCase() }}</span><strong>{{ source.name }}</strong><small>{{ source.endpoint }}</small></div><div class="settings-playlist-actions"><button type="button" class="source-action" :disabled="busy" @click="editSource(source)">Edit</button><button type="button" class="source-delete" :disabled="busy" @click="deleteSource(source)">Delete</button></div></article></div>
          <p v-else class="web-empty">No playlists added yet.</p>
        </section>
        <section class="web-linked-settings"><p class="eyebrow">LINKED ROKUS</p><div v-if="linkedDevices.length" class="web-linked-settings-list"><article v-for="device in linkedDevices" :key="device.id"><div><strong>{{ device.label }}</strong><small>{{ device.deviceId }}</small></div><button type="button" class="web-unlink-button" :disabled="busy" @click="unlinkDevice(device)">Unlink</button></article></div><p v-else class="web-empty">No linked Roku devices.</p><button type="button" class="source-action web-scan-roku" @click="startQrScanner">Scan Roku QR code</button><div v-if="scannerOpen" class="scanner-panel"><div id="qr-reader"></div><button type="button" class="source-action" @click="stopQrScanner">Cancel scan</button></div></section>
        <button type="button" class="source-action web-change-password-toggle" @click="changePasswordOpen = !changePasswordOpen">{{ changePasswordOpen ? 'Cancel password change' : 'Change password' }}</button>
        <form v-if="changePasswordOpen" class="web-password-form" @submit.prevent="changePassword"><label>Current password<input v-model="currentPassword" type="password" minlength="8" required autocomplete="current-password"></label><label>New password<input v-model="newPassword" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirm new password<input v-model="newPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password"></label><button type="submit" class="primary-action" :disabled="busy">Change password</button><p v-if="passwordMessage" :class="['web-password-message', `is-${passwordMessageType}`]">{{ passwordMessage }}</p></form>
        <button type="button" class="logout-button web-logout" @click="logout">Log out</button>
      </article>

      <nav class="safari-bottom-menu" aria-label="Main menu"><button v-for="item in safariMenuItems" :key="item.id" type="button" :class="{active:safariPage === item.id}" @click="openSafariPage(item.id)"><span><img v-if="typeof item.icon === 'string'" :src="item.icon" alt=""><component v-else :is="item.icon" /></span><small>{{ item.label }}</small></button></nav>
      </div></div>
    </section>
    <template v-else>
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
            <div v-if="savedItemsForTab.length" class="xtream-enabled-table"><div v-for="item in savedItemsForTab" :key="item.key" class="xtream-enabled-row" :class="{'web-playable-row': true}" @click="playWebMovie(item)"><div class="xtream-enabled-name"><span class="item-poster small"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><span v-else>{{ typeIcon(item.kind) }}</span></span><strong>{{item.title}}</strong></div><span class="xtream-kind-badge">{{typeLabel(item.kind)}}</span><code>{{item.id}}</code><div class="xtream-row-actions"><button type="button" class="xtream-play-button" @click.stop="playWebMovie(item)">Play</button><button type="button" class="source-action" :disabled="busy" @click.stop="archiveSaved(item)">Archive</button><button type="button" class="source-delete" :disabled="busy" @click.stop="removeSaved(item)">Remove</button></div></div></div>
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
    </template>
      <section v-if="webNowPlaying" class="web-player" :class="{'is-fullscreen': webFullscreen}" role="dialog" aria-label="Media player">
      <header class="web-player-header"><button type="button" class="web-player-back" aria-label="Close player" @click="closeWebPlayer">‹</button><div class="web-player-title"><p class="eyebrow">NOW PLAYING</p><h2>{{ webNowPlaying.title }}</h2><p>{{ webNowPlaying.kind === 'channel' ? 'Live TV' : typeLabel(webNowPlaying.kind) }} · {{ webQuality }}</p></div></header>
      <div class="web-video-frame" @click="toggleWebControls"><video ref="webVideo" :src="webPlayerSrc" playsinline preload="metadata" @loadedmetadata="handleWebMetadata" @timeupdate="onWebTimeUpdate" @play="onWebPlay" @pause="onWebPause" @playing="onWebReady" @waiting="onWebWaiting" @canplay="onWebReady" @ended="webPlaying = false; showWebControls()" @error="handleWebVideoError"></video><div v-if="!webMediaReady && !webPlayerError" class="web-video-placeholder"></div><div class="web-player-overlay" :class="{visible: webControlsVisible || webBuffering || webPlayerError}"><button type="button" class="web-fullscreen-control" aria-label="Fullscreen" @click.stop="fullscreenWebMovie"><MaximizeIcon /></button><div class="web-center-controls"><button type="button" aria-label="Rewind 10 seconds" @click.stop="seekWebBy(-10)"><RotateCcw10Icon /></button><button type="button" class="web-center-play" aria-label="Play or pause" @click.stop="toggleWebPlayback"><span v-if="webBuffering && !webPlayerError" class="web-center-spinner"></span><PauseIcon v-else-if="webPlaying" /><PlayIcon v-else /></button><button type="button" aria-label="Forward 10 seconds" @click.stop="seekWebBy(10)"><RotateCw10Icon /></button></div><div class="web-timeline"><button type="button" class="web-timeline-play" aria-label="Play or pause" @click.stop="toggleWebPlayback"><PauseIcon v-if="webPlaying" /><PlayIcon v-else /></button><span>{{ formatTime(webCurrentTime) }}</span><input type="range" min="0" :max="webDuration || 0" :value="webCurrentTime" :style="webTimelineStyle" aria-label="Movie progress" @pointerdown="showWebControls" @input="seekWebMovie"><span>-{{ formatTime(webRemainingTime) }}</span></div></div><div v-if="webPlayerError" class="web-player-error"><strong>Playback unavailable</strong><button type="button" @click.stop="playWebMovie(webNowPlaying)">Retry</button></div></div>
      <article v-if="webUpNext" class="web-up-next"><div class="web-up-next-icon"><img v-if="webUpNext.logo" :src="imageUrl(webUpNext.logo)" :alt="webUpNext.title"><span v-else>▶</span></div><div><p>UP NEXT</p><strong>{{ webUpNext.title }}</strong><small>Continue watching</small></div><button type="button" aria-label="Play next movie" @click="playWebMovie(webUpNext)">▶</button></article>
    </section>
    </template>
  </main>
</template>
