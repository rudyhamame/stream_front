<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import HomeIcon from "./components/icons/HomeIcon.vue";
import FilmRollAltIcon from "./components/icons/FilmRollAltIcon.vue";
import MovieIcon from "./components/icons/MovieIcon.vue";
import GlobeAlt2Icon from "./components/icons/GlobeAlt2Icon.vue";
import RadioTowerIcon from "./components/icons/RadioTowerIcon.vue";
import CogIcon from "./components/icons/CogIcon.vue";
import MaximizeIcon from "./components/icons/MaximizeIcon.vue";
import PauseIcon from "./components/icons/PauseIcon.vue";
import PlayIcon from "./components/icons/PlayIcon.vue";
import RotateCcw10Icon from "./components/icons/RotateCcw10Icon.vue";
import RotateCw10Icon from "./components/icons/RotateCw10Icon.vue";
import LockKeyholeIcon from "./components/icons/LockKeyholeIcon.vue";
import CaretLeftIcon from "./components/icons/CaretLeftIcon.vue";
import DoorOpenAltIcon from "./components/icons/DoorOpenAltIcon.vue";
import LockKeyholeOpenAltIcon from "./components/icons/LockKeyholeOpenAltIcon.vue";
import BookmarkIcon from "./components/icons/BookmarkIcon.vue";
import EditIcon from "./components/icons/EditIcon.vue";
import TrashIcon from "./components/icons/TrashIcon.vue";

const browserOrigin = window.location.origin;
const legalPage = computed(() => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/privacy') return 'privacy';
  if (path === '/android/privacy') return 'android-privacy';
  if (path === '/terms') return 'terms';
  if (path === '/delete-account') return 'delete-account';
  return '';
});
const canonicalBackend = browserOrigin;
const configuredBackend = (import.meta.env.VITE_API_BASE_URL || canonicalBackend).replace(/\/$/, "");
const base = configuredBackend;
const browserStreamer = (import.meta.env.VITE_PLAYBACK_BASE_URL || browserOrigin).replace(/\/$/, "");
// One control identity per tab; account ownership remains in the signed token.
const browserPlaybackClientId = crypto.randomUUID();
const api = path => `${base}${path}`;

function browserPlaybackUrl(raw) {
  const target = new URL(raw, base);
  if (target.pathname.startsWith("/api/xtream/hls/") || target.pathname.startsWith("/api/xtream/play/")) {
    target.protocol = new URL(browserStreamer).protocol;
    target.host = new URL(browserStreamer).host;
    target.searchParams.set('client', 'browser');
    target.searchParams.set('playbackClientId', browserPlaybackClientId);
  }
  return target.toString();
}
const browserApp = ref(true);
const navOpen = ref(false);
const openCardKey = ref("");
const toggleCardActions = key => { openCardKey.value = openCardKey.value === key ? "" : key; };
const closeCardActionsOnOutsideClick = event => {
  if (!event.target.closest?.(".home-content-card, .playlist-card")) openCardKey.value = "";
};
const pageStorageKey = "rh-safari-page";
const allowedPages = ["welcome", "playlist", "library", "series", "movies", "channels", "settings"];
const pagePaths = { welcome: "/home", playlist: "/playlist", series: "/series", movies: "/movies", channels: "/live-tv", settings: "/settings" };
const pathPages = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page]));
function routeFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const episodeMatch = path.match(/^\/series\/([^/]+)\/episodes$/);
  if (episodeMatch) return { page: "episodes", sourceId: new URLSearchParams(window.location.search).get("sourceId") || "", seriesId: decodeURIComponent(episodeMatch[1]) };
  return { page: pathPages[path] || (path === "/" ? "welcome" : "welcome") };
}
const initialRoute = routeFromLocation();
const safariPage = ref(initialRoute.page === "episodes" ? "episodes" : initialRoute.page);
const storedLibraryTab = window.localStorage.getItem("rh-safari-library-tab");
const safariLibraryTab = ref(["series", "movie", "channel"].includes(storedLibraryTab) ? storedLibraryTab : "series");
const safariMenuItems = [
  { id: "welcome", label: "Welcome", icon: HomeIcon },
  { id: "playlist", label: "Playlist", icon: GlobeAlt2Icon },
  { id: "series", label: "Series", icon: FilmRollAltIcon },
  { id: "movies", label: "Movies", icon: MovieIcon },
  { id: "channels", label: "Live TV", icon: RadioTowerIcon },
  { id: "settings", label: "Settings", icon: CogIcon }
];
function openSafariPage(page) {
  const tab = { series: "series", movies: "movie", channels: "channel" }[page];
  if (tab) safariLibraryTab.value = tab;
  safariPage.value = page;
  const path = pagePaths[page] || pagePaths.welcome;
  if (window.location.pathname !== path || window.location.search) window.history.pushState({ appPage: page }, "", path);
  navOpen.value = false;
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
// Set when the browser's autoplay policy forced a muted start (the common case
// for a Watch-with-Partner joiner, whose click gesture has expired by the time
// HLS.js is ready). Drives the "Tap to unmute" pill.
const webAutoplayBlocked = ref(false);
const webCurrentTime = ref(0);
const webDuration = ref(0);
const webPlaybackOffset = ref(0);
const webBufferedTime = ref(0);
const webPendingSeek = ref(-1);
const webBufferRecoveryPosition = ref(-1);
const webMediaReady = ref(false);
const webPlaybackRetryCount = ref(0);
const webBuffering = ref(false);
const webStartupPercent = ref(0);
const webStartupHint = ref("Starting");
const webControlsVisible = ref(true);
const webPlayerError = ref("");
const webEncodeStrategy = ref("");
// A strategy is selected before it is proven playable. Keep that selection
// private until the media element emits `playing` for this exact attempt.
const webPendingEncodeStrategy = ref("");
const webStreamTicket = ref("");
const webForceHls = ref(false);
const webWwpSessionId = ref("");
// True only for the INVITED partner (joined via an invite's stream ticket, no
// ownership of the host's source). The host keeps false and authenticates with
// its own device token. Governs which credential every playback request sends.
const webIsWwpGuest = ref(false);
const webPartnerMenuOpen = ref(false);
const pendingPartnerInvite = ref(null);
// Watch with Partner voice call (WebRTC, runs inside an <iframe> served by the
// streamer). webCall* only ever matter while a WWP session is live.
const webCallActive = ref(false);
const webCallRole = ref("caller");
const webCallIncoming = ref(false);
const webCallFrame = ref(null);
const webCallUrl = computed(() => {
  if (!webWwpSessionId.value) return "";
  const token = webStreamTicket.value || deviceToken.value || "";
  const p = new URLSearchParams({
    s: webWwpSessionId.value, t: token, role: webCallRole.value,
    name: partnerName.value || "Partner",
  });
  return `${browserStreamer}/api/xtream/wwp-call/${encodeURIComponent(webWwpSessionId.value)}/page?${p.toString()}`;
});
const webFullscreen = ref(false);
const webMini = ref(false);
// Mini-player drag: {left,top} in px once the user has moved it, else null =
// the default bottom-right corner from CSS.
const webMiniPos = ref(null);
let miniDrag = null, webMiniJustDragged = false;
let webHls = null;
let liveTvHls = null;
let liveTvRequestId = 0;
let playlistPreviewHls = null;
let playlistPreviewRequestId = 0;
let hlsConstructorPromise = null;
let webRecoveryTimer = null;
let webStallTimer = null;
let webBufferingTimer = null;
let webDirectStartupTimer = null;
let webPlaybackToken = 0;
let liveTvRecoveryTimer = null;
let liveTvRecoveryAttempts = 0;
let playlistPreviewRecoveryTimer = null;
let playlistPreviewRecoveryAttempts = 0;
let webSeekTimer = null;
let webControlsTimer = null;
function setWebStartupProgress(percent, hint) {
  webStartupPercent.value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  webStartupHint.value = String(hint || "Starting");
}
async function loadHlsConstructor() {
  if (!hlsConstructorPromise) hlsConstructorPromise = import("hls.js").then(module => module.default);
  return hlsConstructorPromise;
}
const storedToken = () => window.localStorage.getItem("rh-device-token") || "";
const profileSelectionKey = "rh-profile-selection-pending";
const deviceToken = ref(storedToken());
function tokenRealm(token) {
  try {
    const encoded = String(token || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0)))).realm === 'roku' ? 'roku' : 'general';
  } catch { return 'general'; }
}
const browserRealm = ref(window.localStorage.getItem("rh-browser-realm") === "roku" ? "roku" : tokenRealm(deviceToken.value));
function chooseBrowserRealm(realm) {
  browserRealm.value = realm === "roku" ? "roku" : "general";
  window.localStorage.setItem("rh-browser-realm", browserRealm.value);
  message.value = "";
}
const appReady = ref(!deviceToken.value);
const pairing = ref(!deviceToken.value);
const pairingMode = ref("login");
const loginStarted = ref(true);
const pairingEmail = ref("");
const pairingPassword = ref("");
const pairingPasswordConfirmation = ref("");
const signupVerificationId = ref("");
const signupVerificationCode = ref("");
const authBusy = ref(false);
const profiles = ref([]);
const activeProfileId = ref(window.localStorage.getItem("rh-profile-id") || "");
const profileChooser = ref(false);
const profileBusy = ref(false);
const profileError = ref("");
const newProfileName = ref("");
const profileCreateOpen = ref(false);
const profileNameInput = ref(null);
const profilePinOpen = ref(false);
const profilePin = ref("");
const profilePinConfirmation = ref("");
const profilePinMessage = ref("");
const profileImageInput = ref(null);
const profileCropOpen = ref(false);
const profileCropSource = ref("");
const profileCropZoom = ref(1);
const profileCropX = ref(50);
const profileCropY = ref(50);
const profileCropImage = ref(null);
const changePasswordOpen = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const newPasswordConfirmation = ref("");
const passwordMessage = ref("");
const passwordMessageType = ref("info");
const deleteAccountOpen = ref(false);
const deleteAccountPassword = ref("");
const deleteAccountMessage = ref("");
const partnerEmailOpen = ref(false);
const partnerEmail = ref("");
const partnerEmailInput = ref("");
const partnerProfileCode = ref("");
const partnerProfileCodeInput = ref("");
const partnerMessage = ref("");
const partnerMessageType = ref("info");
const partnerLinked = ref(false);
const partnerOnline = ref(false);
const partnerName = ref("");
const partnerAvatar = ref("");
const failedLogoUrls = ref(new Set());
const brandLogoReady = ref(false);
{
  const brandLogo = new Image();
  brandLogo.src = "/login/rh-snow-logo.png";
  const reveal = () => { brandLogoReady.value = true; };
  if (brandLogo.decode) brandLogo.decode().then(reveal).catch(reveal);
  else brandLogo.onload = brandLogo.onerror = reveal;
}
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
  const data = response.status === 204 ? null : normalizeBrowserText(await response.json().catch(() => ({})));
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// Some older catalog snapshots contain Arabic presentation forms (the shaped
// glyphs used by Roku) or UTF-8 decoded as Latin-1. Normalize those values at
// the Browser boundary so titles render as normal Arabic text again.
function repairBrowserString(value) {
  let text = String(value ?? '');
  const wasRokuShaped = /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  text = text.normalize('NFKC');
  if (wasRokuShaped) {
    // shapeArabicForRoku reverses each Arabic phrase for Roku's renderer.
    // Reverse only those runs here; Latin suffixes such as "- AR" stay put.
    text = text.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]*/g, run => [...run].reverse().join(''));
  }
  if (/[ÃÂØÙ]/.test(text)) {
    try {
      const bytes = Uint8Array.from([...text].map(char => char.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (repaired && repaired !== text && !/[ÃÂØÙ]/.test(repaired)) text = repaired.normalize('NFKC');
    } catch { /* Keep the original when it is not valid UTF-8 mojibake. */ }
  }
  return text;
}
function normalizeBrowserText(value) {
  if (typeof value === 'string') return repairBrowserString(value);
  if (Array.isArray(value)) return value.map(normalizeBrowserText);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeBrowserText(entry)]));
  return value;
}

// Password managers and mobile autofill set the <input> value without always
// firing an event v-model can hear, so the Vue refs stay empty and the login
// request goes out with no email. Read the real DOM values on submit.
function syncCredentialsFromForm(event) {
  const form = event?.target?.closest?.("form") || event?.target;
  if (!form || typeof form.querySelector !== "function") return;
  const email = form.querySelector('input[type="email"]');
  const password = form.querySelector('input[type="password"]');
  const confirm = form.querySelectorAll('input[type="password"]')[1];
  if (email && email.value.trim()) pairingEmail.value = email.value.trim();
  if (password && password.value) pairingPassword.value = password.value;
  if (confirm && confirm.value) pairingPasswordConfirmation.value = confirm.value;
}

async function chooseProfile(profile) {
  if (!profile?.id || profileBusy.value) return;
  appReady.value = false;
  profileBusy.value = true;
  profileError.value = "";
  try {
    let pin = "";
    if (profile.hasPin) {
      pin = String(window.prompt(`Enter the 4-digit PIN for ${profile.name}`) || "");
      if (!pin) { appReady.value = true; return; }
      if (!/^\d{4}$/.test(pin)) throw new Error("Enter the 4-digit profile PIN.");
    }
    const data = await request(`/api/account/profiles/${encodeURIComponent(profile.id)}/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    deviceToken.value = data.token;
    window.localStorage.setItem("rh-device-token", data.token);
    activeProfileId.value = profile.id;
    window.localStorage.setItem("rh-profile-id", profile.id);
    online.value = true;
    window.sessionStorage.removeItem(profileSelectionKey);
    profileChooser.value = false;
    safariPage.value = "welcome";
    window.history.replaceState({ appPage: "welcome" }, "", "/home");
    appReady.value = true;
    // The profile is active as soon as the server returns its token. Show
    // Welcome immediately; provider and weather requests must not hold the
    // chooser open or leave the user on the profile screen.
    void Promise.all([
      loadSources(sourceId.value, { loadPlaylist: false }),
      loadWeatherSettings(),
    ]).then(() => loadHomeData()).catch(error => {
      messageType.value = "error";
      message.value = error?.message || "Your profile opened, but some Welcome data could not load.";
    });
  } catch (error) {
    profileError.value = error.message || "Could not open this profile.";
  } finally {
    profileBusy.value = false;
  }
}

async function createProfile() {
  const name = newProfileName.value.trim();
  if (!name || profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    const data = await request("/api/account/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    profiles.value = [...profiles.value, data.profile];
    newProfileName.value = "";
    profileCreateOpen.value = false;
  } catch (error) { profileError.value = error.message || "Could not create the profile."; }
  finally { profileBusy.value = false; }
}

async function openProfileCreation() {
  profileCreateOpen.value = true;
  profileError.value = "";
  await nextTick();
  profileNameInput.value?.focus();
  window.setTimeout(() => profileNameInput.value?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }), 80);
}

async function saveProfilePin() {
  if (!activeProfile.value?.id || profileBusy.value) return;
  profilePinMessage.value = "";
  if (!/^\d{4}$/.test(profilePin.value)) { profilePinMessage.value = "Enter exactly 4 digits."; return; }
  if (profilePin.value !== profilePinConfirmation.value) { profilePinMessage.value = "The PINs do not match."; return; }
  profileBusy.value = true;
  try {
    const data = await request(`/api/account/profiles/${encodeURIComponent(activeProfile.value.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: profilePin.value }) });
    profiles.value = profiles.value.map(profile => profile.id === data.profile.id ? data.profile : profile);
    profilePin.value = ""; profilePinConfirmation.value = ""; profilePinOpen.value = false;
    profilePinMessage.value = "Profile PIN saved.";
  } catch (error) { profilePinMessage.value = error.message || "Could not save the profile PIN."; }
  finally { profileBusy.value = false; }
}

async function removeProfilePin() {
  if (!activeProfile.value?.id || profileBusy.value) return;
  profileBusy.value = true; profilePinMessage.value = "";
  try {
    const data = await request(`/api/account/profiles/${encodeURIComponent(activeProfile.value.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: "" }) });
    profiles.value = profiles.value.map(profile => profile.id === data.profile.id ? data.profile : profile);
    profilePin.value = ""; profilePinConfirmation.value = ""; profilePinOpen.value = false;
    profilePinMessage.value = "Profile PIN removed.";
  } catch (error) { profilePinMessage.value = error.message || "Could not remove the profile PIN."; }
  finally { profileBusy.value = false; }
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

function openProfileImagePicker() { profileImageInput.value?.click(); }
function loadProfileImage(event) {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file || !file.type.startsWith("image/")) { profileError.value = "Choose an image file."; return; }
  if (file.size > 12 * 1024 * 1024) { profileError.value = "Profile pictures must be 12 MB or smaller."; return; }
  const reader = new FileReader();
  reader.onload = () => { profileCropSource.value = String(reader.result || ""); profileCropZoom.value = 1; profileCropX.value = 50; profileCropY.value = 50; profileCropOpen.value = true; profileError.value = ""; };
  reader.readAsDataURL(file);
}
function cropImageLoaded(event) { profileCropImage.value = event.target; }
async function saveProfileImage() {
  const image = profileCropImage.value;
  if (!image || !activeProfile.value?.id || profileBusy.value) return;
  const size = 720, canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d");
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * profileCropZoom.value;
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  const maxX = Math.max(0, width - size), maxY = Math.max(0, height - size);
  context.drawImage(image, -(maxX * profileCropX.value / 100), -(maxY * profileCropY.value / 100), width, height);
  const avatarImage = canvas.toDataURL("image/jpeg", .86);
  profileCropOpen.value = false; profileBusy.value = true; profileError.value = "";
  try {
    const data = await request(`/api/account/profiles/${encodeURIComponent(activeProfile.value.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ avatarImage }) });
    profiles.value = profiles.value.map(profile => profile.id === data.profile.id ? data.profile : profile);
  } catch (error) { profileError.value = error.message || "Could not update the profile picture."; }
  finally { profileBusy.value = false; }
}

async function signIn(event) {
  syncCredentialsFromForm(event);
  authBusy.value = true;
  try {
    if (!pairingEmail.value.trim()) throw new Error("Enter your email address");
    if (!pairingPassword.value) throw new Error("Enter your password");
    const data = await request("/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pairingEmail.value, password: pairingPassword.value, realm: browserRealm.value }) });
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

async function signUp(event) {
  syncCredentialsFromForm(event);
  authBusy.value = true;
  try {
    if (!pairingEmail.value.trim()) throw new Error("Enter your email address");
    if (!signupVerificationId.value) throw new Error("Send the verification code first");
    if (!signupVerificationCode.value.trim()) throw new Error("Enter the verification code");
    if (!pairingPassword.value) throw new Error("Enter a password");
    if (pairingPassword.value !== pairingPasswordConfirmation.value) throw new Error("Passwords do not match");
    const data = await request("/api/account/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pairingEmail.value, password: pairingPassword.value, verificationId: signupVerificationId.value, verificationCode: signupVerificationCode.value, realm: browserRealm.value }) });
    deviceToken.value = data.token;
    window.localStorage.setItem("rh-device-token", data.token);
    profiles.value = (await request("/api/account/profiles")).items || [];
    pairingPassword.value = "";
    pairingPasswordConfirmation.value = "";
    profileError.value = "";
    window.sessionStorage.setItem(profileSelectionKey, "1");
    pairing.value = false;
    window.history.replaceState({}, "", window.location.pathname);
    profileChooser.value = true;
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { authBusy.value = false; }
}

async function requestSignupCode(event) {
  syncCredentialsFromForm(event);
  authBusy.value = true;
  message.value = "";
  try {
    if (!pairingEmail.value.trim()) throw new Error("Enter your email address");
    const data = await request("/api/account/signup/request-verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pairingEmail.value, realm: browserRealm.value }) });
    if (data.verificationNotRequired) throw new Error("This email is already verified. Sign in instead.");
    signupVerificationId.value = data.verificationId || "";
    if (!signupVerificationId.value) throw new Error("Verification code was not created");
    messageType.value = "success";
    message.value = data.verificationAlreadyPending
      ? "A verification code is already pending. Enter the code you received, then create your password."
      : "Verification code sent. Enter it below, then create your password.";
  } catch (error) { messageType.value = "error"; message.value = error.message; }
  finally { authBusy.value = false; }
}

function showPlatformDevelopment(platform) {
  messageType.value = "info";
  message.value = `${platform} app is still in development.`;
}

function beginSignup() {
  pairingMode.value = "signup";
  loginStarted.value = false;
  signupVerificationId.value = "";
  signupVerificationCode.value = "";
  pairingPassword.value = "";
  pairingPasswordConfirmation.value = "";
  message.value = "";
}

function beginLogin() {
  pairingMode.value = "login";
  loginStarted.value = true;
  message.value = "";
}

function logout() {
  deviceToken.value = "";
  appReady.value = true;
  window.localStorage.removeItem("rh-device-token");
  window.sessionStorage.removeItem(profileSelectionKey);
  pairing.value = true;
    pairingMode.value = "login";
    loginStarted.value = false;
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

async function deleteAccount() {
  deleteAccountMessage.value = "";
  if (!window.confirm("Delete your account? This permanently removes your library, profiles, and settings. This cannot be undone.")) return;
  try {
    busy.value = true;
    await request("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: deleteAccountPassword.value }) });
    deviceToken.value = "";
    window.localStorage.removeItem("rh-device-token");
    window.location.reload();
  } catch (error) {
    deleteAccountMessage.value = error.message;
  } finally {
    busy.value = false;
  }
}

async function loadPartnerSettings() {
  if (!deviceToken.value) return;
  try {
    const data = await request("/api/account/partner");
    partnerEmail.value = data.partnerEmail || "";
    partnerEmailInput.value = partnerEmail.value;
    partnerProfileCode.value = data.partnerProfileCode || "";
    partnerProfileCodeInput.value = partnerProfileCode.value;
    partnerLinked.value = Boolean(data.linked);
    partnerOnline.value = Boolean(data.online);
    partnerName.value = data.name || "";
    partnerAvatar.value = data.avatarImage || "";
  } catch { /* Settings page just shows the field empty on a transient failure. */ }
}
async function savePartnerEmail() {
  partnerMessage.value = "";
  try {
    const data = await request("/api/account/partner", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ partnerEmail: partnerEmailInput.value.trim(), partnerProfileCode: partnerProfileCodeInput.value.trim() }) });
    partnerEmail.value = data.partnerEmail || "";
    partnerEmailInput.value = partnerEmail.value;
    partnerProfileCode.value = data.partnerProfileCode || "";
    partnerProfileCodeInput.value = partnerProfileCode.value;
    partnerEmailOpen.value = false;
    partnerMessageType.value = "success";
    partnerMessage.value = partnerEmail.value ? `Partner set to ${partnerEmail.value} (${partnerProfileCode.value}).` : "Partner cleared.";
  } catch (error) {
    partnerMessageType.value = "error";
    partnerMessage.value = error.message;
  }
}

function blurRestoredLoginFocus() {
  if (!pairing.value) return;
  const active = document.activeElement;
  if (active?.matches?.(".rh-auth input")) active.blur();
}

function enforceProfileSelection() {
  if (deviceToken.value && window.sessionStorage.getItem(profileSelectionKey)) {
    profileChooser.value = true;
    pairing.value = false;
    return;
  }
  void syncPageFromLocation();
}

async function syncPageFromLocation() {
  const route = routeFromLocation();
  if (route.page !== "episodes") {
    safariPage.value = route.page;
    const tab = { series: "series", movies: "movie", channels: "channel" }[route.page];
    if (tab) safariLibraryTab.value = tab;
    return;
  }
  const resolvedSourceId = route.sourceId || sourceId.value;
  if (!resolvedSourceId || !route.seriesId) {
    safariPage.value = "series";
    return;
  }
  const seriesItem = [
    ...(welcomeProviderItems.value.series || []),
    ...managedLibraryItems.value,
    ...items.value,
  ].find(item => String(item.id) === route.seriesId && String(item.sourceId || sourceId.value) === resolvedSourceId);
  await openSeriesEpisodes({
    ...(seriesItem || {}), id: route.seriesId, sourceId: resolvedSourceId,
    kind: "series", title: seriesItem?.title || route.seriesId,
  }, { updateHistory: false });
}

onBeforeUnmount(() => window.removeEventListener("message", onWwpCallMessage));
onBeforeUnmount(() => window.removeEventListener("popstate", enforceProfileSelection));
onBeforeUnmount(() => window.removeEventListener("pageshow", blurRestoredLoginFocus));
onBeforeUnmount(() => document.removeEventListener("keydown", handleNavigationKeydown));
onBeforeUnmount(() => document.removeEventListener("click", closeCardActionsOnOutsideClick));
onBeforeUnmount(() => {
  if (deviceStatusTimer) clearInterval(deviceStatusTimer);
  if (libraryRevisionController) libraryRevisionController.abort();
  if (libraryRevisionRetryTimer) clearTimeout(libraryRevisionRetryTimer);
});

const online = ref(false), sources = ref([]), sourceId = ref("");
const sourceListLoading = ref(Boolean(deviceToken.value));
let sourceListRequestCount = 0;
// A browser tab has no paired deviceId like a Roku does. Generate one once
// and keep it in localStorage so Connected Devices can tell this browser
// apart from others (and from itself across reloads) instead of treating
// every browser session as invisible.
function browserDeviceId() {
  const key = "rh-browser-device-id";
  let id = window.localStorage.getItem(key);
  if (!id) { id = `browser-${crypto.randomUUID()}`; window.localStorage.setItem(key, id); }
  return id;
}
function browserDeviceLabel() {
  const ua = navigator.userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
async function sendBrowserHeartbeat() {
  if (!deviceToken.value) return;
  try { await request("/api/account/heartbeat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: browserDeviceId(), streaming: webPlaying.value, label: browserDeviceLabel() }) }); }
  catch { /* Best effort — a missed heartbeat just leaves this tab looking briefly offline. */ }
}
const playlistHealthBySource = ref({});
let playlistHealthRequestId = 0;
const weatherLocations = ref([null]);
const weatherQueries = ref([""]);
const weatherResults = ref([[]]);
const weatherSearching = ref([false]);
const weatherMessage = ref("");
const weatherMessageType = ref("info");
const weatherSearchTimers = [null];
const name = ref(""), url = ref(""), sourceType = ref("xtream"), sourceUsername = ref(""), sourcePassword = ref(""), editing = ref(null), busy = ref(false), loading = ref(false), message = ref(""), messageType = ref("info");
const kind = ref("series"), items = ref([]), categories = ref([]), languages = ref([]), category = ref("all"), titleLanguage = ref("all"), query = ref("");
const selectedKeys = ref([]), savedItems = ref([]), archivedItems = ref([]), knownItems = ref({}), page = ref(1), pages = ref(1), total = ref(0), loadingMore = ref(false);
const sortBy = ref("name"), selectionFilter = ref("all");
const managedLibraryCategories = ref([]), managedLibraryItems = ref([]), categoryManagerOpen = ref(false), categoryEditorId = ref("");
const settingsTab = ref("profile");
const selectedSeries = ref(null), seriesEpisodes = ref([]), selectedSeasonNumber = ref(null), seriesEpisodesLoading = ref(false), seriesEpisodesError = ref("");
const episodesFrom = ref("series");
const categoryEditorKeys = ref([]), categoryNameDrafts = ref({}), newCategoryName = ref(""), categoryBusy = ref(false);
const homeLoading = ref(false);
const homeError = ref("");
const welcomeProviderItems = ref({ series: [], movie: [], channel: [] });
const homeFavorites = ref([]);
const homeContinueWatching = ref([]);
const homeFavoriteKeys = ref(new Set());
const homeBackdropUrl = ref("");
const backdropEnabled = ref((() => { try { return window.localStorage.getItem("rh-backdrop") !== "0"; } catch { return true; } })());
function setBackdropEnabled(on) {
  backdropEnabled.value = on;
  try { window.localStorage.setItem("rh-backdrop", on ? "1" : "0"); } catch { /* private mode */ }
  if (!on) { homeBackdropUrl.value = ""; window.clearTimeout(homeBackdropTimer); }
}
const welcomeProviderCounts = ref({ series: 0, movie: 0, channel: 0 });
const welcomeProviderLoading = ref(false);
const welcomeCatalogBusy = computed(() => sourceListLoading.value || welcomeProviderLoading.value);
const welcomeProviderError = ref("");
let welcomeProviderRequestId = 0;
let homeRequestId = 0;
let libraryRevision = 0, libraryRevisionController = null, libraryRevisionRetryTimer = null;
let partnerInviteRevision = 0, partnerInviteController = null, partnerInviteRetryTimer = null;
let wwpSyncToken = "", wwpKnownRevision = 0, wwpKnownControlRevision = 0, wwpLastSeenStart = -1;
let wwpSyncController = null, wwpSyncRetryTimer = null, wwpApplyingRemote = false, wwpRemoteEnded = false;
// Leader-follower frame-lock: the host broadcasts its position; the guest keeps
// converging onto it. No negotiation, so no way to deadlock.
let wwpHostBeatTimer = null, wwpFollowTimer = null, wwpClockOffset = 0;
let wwpHostState = null, wwpUserPaused = false, wwpLastFollowSeek = 0;
const selectedCount = computed(() => selectedKeys.value.length);
const isPairingSignup = computed(() => pairingMode.value === "signup");
const savedKeys = computed(() => new Set(savedItems.value.map(item => item.key)));
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
    || (selectionFilter.value === "selected" && savedKeys.value.has(item.key))
    || (selectionFilter.value === "available" && !savedKeys.value.has(item.key)));
  return [...filtered].sort((a, b) => {
    if (sortBy.value === "recent") return String(b.added || "").localeCompare(String(a.added || ""));
    if (sortBy.value === "category") return String(a.category || "").localeCompare(String(b.category || ""), undefined, { numeric: true, sensitivity: "base" }) || a.title.localeCompare(b.title);
    return compareCatalogTitles(a, b);
  });
});
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
// Library / Live TV are scoped to the selected provider too (account + profile
// scoping is already done server-side by the device token).
const inSelectedProvider = entry => { const cur = String(sourceId.value || ""); return !cur || String(entry?.sourceId || "") === cur; };
const managedCategoriesForTab = computed(() => managedLibraryCategories.value.filter(entry => entry?.kind === safariLibraryTab.value));
const managedItemsForTab = computed(() => managedLibraryItems.value.filter(item => item?.kind === safariLibraryTab.value && inSelectedProvider(item)));
const browseCategoryId = ref("all");
const browseFocusIndex = ref(0);
const browseCategories = computed(() => [{ id: "all", name: "All" }, ...managedCategoriesForTab.value.filter(category => category.items?.length).map(category => ({ id: category.id, name: category.name }))]);
const browseItems = computed(() => {
  const category = browseCategoryId.value === "all" ? null : managedCategoriesForTab.value.find(entry => entry.id === browseCategoryId.value);
  const entries = category ? category.items || [] : managedItemsForTab.value;
  const unique = new Map();
  for (const item of entries) {
    if (!item) continue;
    const key = item.libraryKey || `${item.sourceId || "source"}:${item.kind}:${item.id}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
});
const browseSelectedItem = computed(() => browseItems.value[browseFocusIndex.value] || browseItems.value[0] || null);
function selectBrowseCategory(id) { browseCategoryId.value = id || "all"; browseFocusIndex.value = 0; }
function focusBrowseItem(event, index) {
  browseFocusIndex.value = index;
  event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}
const managedTypeCounts = computed(() => Object.fromEntries(["series", "movie", "channel"].map(value => [value,
  managedLibraryCategories.value.filter(category => category?.kind === value).reduce((count, category) => count + (category.items || []).filter(item => item && inSelectedProvider(item)).length, 0),
])));
const libraryRails = computed(() => {
  return managedCategoriesForTab.value
    .map(category => ({ id: category.id, name: category.name, items: (category.items || []).filter(item => item && inSelectedProvider(item)) }))
    .filter(category => category.items.length);
});
const liveTvChannels = computed(() => {
  const channels = new Map();
  for (const category of managedLibraryCategories.value.filter(entry => entry?.kind === "channel")) {
    for (const item of category?.items || []) {
      if (!item || !inSelectedProvider(item)) continue;
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
const firstDisplayedEpisode = computed(() => displayedSeriesEpisodeSeasons.value[0]?.episodes[0] || null);

const webPlayerSrc = computed(() => {
  const item = webNowPlaying.value;
  if (!item) return "";
  const playableSourceId = item.sourceId || sourceId.value;
  const extension = item.extension ? `?ext=${encodeURIComponent(item.extension)}` : "";
  const playableKind = ['movie', 'series', 'channel'].includes(item.kind) ? item.kind : 'movie';
  // Let the browser test the actual provider stream. A catalog extension
  // alone does not describe the codecs/container returned by the provider.
  // Watch-with-Partner must remain on its shared HLS generation.
  const shouldUseDirect = !webForceHls.value && !webWwpSessionId.value;
  const generated = playableSourceId && item.id
    ? (shouldUseDirect
      ? `/api/xtream/play/${encodeURIComponent(playableSourceId)}/${playableKind}/${encodeURIComponent(item.id)}${extension}`
      : `/api/xtream/hls/${encodeURIComponent(playableSourceId)}/${playableKind}/${encodeURIComponent(item.id)}/master.m3u8${extension}`)
    : "";
  const providerURL = typeof item.providerURL === 'string' ? item.providerURL : typeof item.providerUrl === 'string' ? item.providerUrl : '';
  // Direct uses the original provider URL verbatim. The resolver redirect is
  // only for older catalog records that do not yet carry it.
  const raw = shouldUseDirect
    ? (/^https?:\/\//i.test(providerURL) ? providerURL : '')
    : (generated || '');
  if (!raw) return "";
  const target = new URL(browserPlaybackUrl(raw));
  if (target.pathname.includes('/api/xtream/hls/')) {
    target.searchParams.set("client", "browser");
  }
  // The invited partner does not own this source, so every media request must
  // carry the host's stream ticket and NOTHING else - sending the partner's own
  // device token would make the server resolve the source (and the job owner)
  // under the wrong account and 404. The host authenticates with its own
  // long-lived device token; its 5-minute stream ticket is not the media key.
  const onStreamer = target.origin === new URL(browserStreamer).origin;
  if (webIsWwpGuest.value) {
    if (onStreamer && webStreamTicket.value) target.searchParams.set("streamTicket", webStreamTicket.value);
  } else if (onStreamer && deviceToken.value) {
    target.searchParams.set("deviceToken", deviceToken.value);
  } else if (onStreamer && webStreamTicket.value) {
    target.searchParams.set("streamTicket", webStreamTicket.value);
  }
  if (webWwpSessionId.value) target.searchParams.set("wwpSessionId", webWwpSessionId.value);
  return target.toString();
});

const webStrategyTier = computed(() => {
  const label = webEncodeStrategy.value;
  if (label === "DIRECT") return "direct";
  if (label.includes("FULL")) return "full";
  if (label.includes("VIDEO")) return "video";
  if (label.includes("AUDIO")) return "audio";
  return "remux";
});
const webStreamFormatLabel = computed(() => {
  const item = webNowPlaying.value;
  if (!item) return "";
  const source = webPlayerSrc.value;
  if (webForceHls.value || isHlsPlaybackUrl(source)) return "HLS";
  if (/\.mpd(?:$|\?)/i.test(source) || String(item.streamFormat || "").toLowerCase() === "dash") return "DASH";
  const streamFormat = String(item.streamFormat || "").toLowerCase();
  if (streamFormat === "ism" || streamFormat === "smooth" || /\.ism(?:$|\?)/i.test(source)) return "Smooth";
  return "Original";
});

async function resolveWebPlayableItem(item) {
  if (!item?.sourceId || !item?.id) throw new Error("This movie does not have a playable stream.");
  let playable = item;
  if (item.kind === "series" && !item.isEpisode) {
    const details = await request(`/api/xtream/series/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}`);
    const episode = details.episodes?.[0];
    if (!episode?.id) throw new Error("This series has no playable episodes.");
    playable = { ...item, id: episode.id, seriesId: item.id, isEpisode: true, providerUrl: episode.providerUrl || episode.providerURL || '', seriesTitle: details.title || item.title, title: `${details.title || item.title} (${episode.episodeNumber || ""})`, extension: episode.extension || item.extension || "mp4", duration: episode.duration || item.duration || "" };
    webNowPlaying.value = playable;
  }
  return playable;
}

async function loadStreamTicket(item) {
  const playable = await resolveWebPlayableItem(item);
  const data = await request(`/api/xtream/stream-ticket/${encodeURIComponent(playable.sourceId)}/${encodeURIComponent(playable.kind || "movie")}/${encodeURIComponent(playable.id)}`);
  webStreamTicket.value = data.ticket || "";
  if (!webStreamTicket.value) throw new Error("Could not authorize this stream.");
}

async function decideWebPlayback(item) {
  const providerURL = item?.providerURL || item?.providerUrl || '';
  if (!/^https?:\/\//i.test(providerURL)) throw new Error('This item is missing its original provider URL.');
  const url = new URL(`${browserStreamer}/api/xtream/playback-decision/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.kind || 'movie')}/${encodeURIComponent(item.id)}`);
  url.searchParams.set('client', 'browser');
  url.searchParams.set('providerURL', providerURL);
  if (item.extension) url.searchParams.set('ext', item.extension);
  if (deviceToken.value) url.searchParams.set('deviceToken', deviceToken.value);
  if (webStreamTicket.value) url.searchParams.set('streamTicket', webStreamTicket.value);
  const headers = deviceToken.value ? { 'x-device-token': deviceToken.value } : {};
  const response = await fetch(url, { cache: 'no-store', headers, signal: AbortSignal.timeout(30_000) });
  const decision = await response.json().catch(() => ({}));
  if (!response.ok || !decision.ok) throw new Error(decision.error || 'Could not determine browser playback compatibility.');
  if (decision.providerURL !== providerURL) throw new Error('The playback provider URL changed during compatibility checking.');
  webNowPlaying.value = { ...webNowPlaying.value, providerURL: decision.providerURL, playbackStrategy: decision.playbackStrategy };
  // An http:// provider URL cannot be loaded by an https page (mixed content),
  // so skip Direct and start at the compatibility-selected HLS strategy.
  const directBlocked = window.location.protocol === 'https:' && /^http:/i.test(providerURL);
  const useDirect = decision.directCompatible === true && !directBlocked;
  webForceHls.value = !useDirect;
  webPendingEncodeStrategy.value = useDirect
    ? 'DIRECT'
    : (decision.directCompatible ? '' : describeEncodeStrategy(decision.playbackStrategy || '', decision.videoMode || ''));
  if (Number(decision.durationSeconds) > 0) webDuration.value = Number(decision.durationSeconds);
  return decision;
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
  // HLS movie playback is delivered through a deliberately rolling manifest.
  // Safari reports that short window as media duration, so it must never be
  // used as the movie's timeline length. A native MP4 element, by contrast,
  // reports the real full duration and should be trusted.
  // The rolling HLS window (movie, series episode, or any WWP stream) never
  // carries the real timeline length - only a native MP4 element does.
  const rollingHls = webForceHls.value || webWwpSessionId.value || isHlsPlaybackUrl(webPlayerSrc.value);
  if (webNowPlaying.value?.kind !== "channel" && rollingHls) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const absoluteDuration = webPlaybackOffset.value + duration;
  // Safari can expose only the currently buffered HLS window here. Never let
  // that shorter value replace the full duration returned by Xtream.
  if (absoluteDuration > webDuration.value) webDuration.value = absoluteDuration;
}

async function loadMovieDuration(item) {
  if (!item?.sourceId || !item?.id || !['movie', 'series'].includes(item.kind)) return false;
  try {
    const params = new URLSearchParams();
    if (item.extension) params.set("ext", item.extension);
    if (item.kind === "series" && item.seriesId) params.set("seriesId", String(item.seriesId));
    const query = params.toString() ? `?${params}` : "";
    // Movies resolve via get_vod_info, series episodes via the series JSON -
    // both are metadata calls, no provider stream / lease involved.
    const path = item.kind === "movie"
      ? `/api/xtream/movie/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}/duration${query}`
      : `/api/xtream/media-duration/${encodeURIComponent(item.sourceId)}/series/${encodeURIComponent(item.id)}${query}`;
    const data = await request(path, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (webNowPlaying.value !== item) return false;
    const seconds = Number(data.seconds) || parseDuration(data.duration);
    if (seconds > 0) {
      webDuration.value = seconds;
      return true;
    }
  } catch { /* Surface the bounded lookup failure in playWebMovie. */ }
  return false;
}

// Watch with Partner guest: resolve the VOD length via the host's stream
// ticket (the guest cannot query the host's source with its own token).
async function loadWwpGuestDuration(invite) {
  if (!invite?.sourceId || !invite?.id || !invite?.streamTicket) return;
  try {
    const url = new URL(api(`/api/xtream/media-duration/${encodeURIComponent(invite.sourceId)}/${encodeURIComponent(invite.kind)}/${encodeURIComponent(invite.id)}`), base);
    url.searchParams.set("streamTicket", invite.streamTicket);
    if (invite.extension) url.searchParams.set("ext", invite.extension);
    if (deviceToken.value) url.searchParams.set("deviceToken", deviceToken.value);
    const res = await fetch(url, { cache: "no-store", headers: deviceToken.value ? { "x-device-token": deviceToken.value } : {} });
    const data = await res.json().catch(() => ({}));
    const seconds = Number(data.seconds) || 0;
    if (seconds > 0 && webWwpSessionId.value === invite.wwpSessionId) webDuration.value = Math.max(webDuration.value, seconds);
  } catch { /* the scrubber just stays open-ended */ }
}

const webRemainingTime = computed(() => Math.max(0, webDuration.value - webCurrentTime.value));
const webTimelineStyle = computed(() => {
  const total = webDuration.value || 0;
  const clamp = value => Math.min(100, Math.max(0, value));
  const percent = total ? clamp((webCurrentTime.value / total) * 100) : 0;
  // The lighter portion of the bar: media already downloaded ahead of the
  // playhead. Never let it read behind the played portion.
  const buffered = total ? clamp((Math.max(webBufferedTime.value, webCurrentTime.value) / total) * 100) : 0;
  return { "--web-progress": `${percent}%`, "--web-buffered": `${Math.max(percent, buffered)}%` };
});

// How far the media element has buffered, expressed on the movie's absolute
// timeline (currentTime is relative to the rolling manifest's re-based origin).
function refreshWebBuffered() {
  const video = webVideo.value;
  if (!video || !video.buffered || !video.buffered.length) { webBufferedTime.value = webCurrentTime.value; return; }
  const now = video.currentTime;
  let ahead = now;
  for (let i = 0; i < video.buffered.length; i += 1) {
    if (video.buffered.start(i) - 0.25 <= now && now <= video.buffered.end(i) + 0.25) { ahead = video.buffered.end(i); break; }
  }
  webBufferedTime.value = webPlaybackOffset.value + ahead;
}
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

function startMiniDrag(event) {
  if (!webMini.value || event.button !== 0 || event.target?.closest?.("button")) return;
  const section = event.currentTarget;
  const rect = section.getBoundingClientRect();
  miniDrag = { grabX: event.clientX - rect.left, grabY: event.clientY - rect.top, w: rect.width, h: rect.height, startX: event.clientX, startY: event.clientY, moved: false };
  section.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", onMiniDrag);
  window.addEventListener("pointerup", endMiniDrag, { once: true });
}
function onMiniDrag(event) {
  if (!miniDrag) return;
  if (!miniDrag.moved && Math.hypot(event.clientX - miniDrag.startX, event.clientY - miniDrag.startY) < 4) return;
  miniDrag.moved = true;
  const maxX = Math.max(4, window.innerWidth - miniDrag.w - 4);
  const maxY = Math.max(4, window.innerHeight - miniDrag.h - 4);
  webMiniPos.value = {
    left: Math.min(Math.max(4, event.clientX - miniDrag.grabX), maxX),
    top: Math.min(Math.max(4, event.clientY - miniDrag.grabY), maxY),
  };
}
function endMiniDrag() {
  window.removeEventListener("pointermove", onMiniDrag);
  webMiniJustDragged = Boolean(miniDrag?.moved);
  miniDrag = null;
  if (webMiniJustDragged) setTimeout(() => { webMiniJustDragged = false; }, 0);
}
function webFrameClick(event) {
  if (webMini.value) return; // the minimized player only expands via its Expand button
  toggleWebControls(event);
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
  // The WWP resume path (toggleWebPlayback / applyRemoteWwpControl) always does
  // a full restartWebAt because the shared job was torn down on pause, and it
  // sends its own control ping - so nothing to relay from here.
  // The media element is playing, so any earlier "Playback unavailable" was
  // a transient stall that has since recovered. Clear it so the error card
  // cannot sit on top of a working stream and pin the controls open.
  webPlayerError.value = "";
  scheduleWebControlsHide();
}

function onWebPause() {
  webPlaying.value = false;
  showWebControls();
  // NB: no WWP relay here - the element pauses for buffering stalls, stream
  // truncation and error recovery too, which would spam the partner. Only the
  // explicit play/pause button (toggleWebPlayback) relays.
}

// Watch with Partner: relay our own play/pause (and the exact spot) to the
// partner. The long-poll in watchWwpSync() carries the reverse direction.
async function sendWwpControl(paused) {
  const sessionId = webWwpSessionId.value;
  if (!sessionId) return;
  const positionMs = Math.round(Math.max(0, webPlaybackOffset.value + (webVideo.value?.currentTime || 0)) * 1000);
  try {
    const url = new URL(`${browserStreamer}/api/xtream/wwp-control/${encodeURIComponent(sessionId)}`);
    url.searchParams.set("paused", paused ? "1" : "0");
    url.searchParams.set("positionMs", String(positionMs));
    // Send BOTH credentials: the host's own stream ticket is short-lived (5 min)
    // and would otherwise silently 401 mid-session, but their device token does
    // not expire. The server accepts whichever resolves.
    if (deviceToken.value) url.searchParams.set("deviceToken", deviceToken.value);
    if (webStreamTicket.value) url.searchParams.set("streamTicket", webStreamTicket.value);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) console.warn(`[WWP] control relay ${response.status}`);
  } catch (error) { console.warn("[WWP] control relay failed", error?.message || error); }
}

// Apply the partner's play/pause locally - this is what makes our own play
// button toggle (webPlaying drives its icon) and the controls flash up.
async function applyRemoteWwpControl(data) {
  const video = webVideo.value;
  if (!video || typeof data.paused !== "boolean" || data.paused === video.paused) return;
  wwpApplyingRemote = true;
  wwpUserPaused = data.paused === true;   // mirror the host's intent
  try {
    if (data.paused) {
      video.pause();
      webPlaying.value = false;
    } else {
      // Following the partner's "play" is not a user gesture - a muted retry
      // (inside startWebPlayback) is what keeps the follower from silently
      // staying paused while the other side plays on.
      await startWebPlayback(video);
    }
    showWebControls();
  } finally {
    // Hold the guard briefly so the resulting element pause/play event does not
    // echo back out (it would not relay anyway now, but keep it tidy).
    setTimeout(() => { wwpApplyingRemote = false; }, 300);
  }
}

function onWebWaiting() {
  if (webNowPlaying.value?.kind !== "channel") webBufferRecoveryPosition.value = Math.max(webBufferRecoveryPosition.value, webCurrentTime.value);
  clearTimeout(webBufferingTimer);
  webBufferingTimer = setTimeout(() => {
    const video = webVideo.value;
    if (video && !video.paused && video.readyState < 3) {
      webBuffering.value = true;
      showWebControls();
    }
  }, 300);
  clearTimeout(webStallTimer);
  const resumeAt = webAbsolutePosition();
  webStallTimer = setTimeout(() => {
    webStallTimer = null;
    const video = webVideo.value;
    if (!webNowPlaying.value || !video || video.readyState >= 3) return;
    if (!webForceHls.value && !webWwpSessionId.value) fallBackToHlsFromDirect(webAbsolutePosition());
    else scheduleWebReconnect(Math.max(resumeAt, webAbsolutePosition()));
  }, 20_000);
}

function onWebTimeUpdate(event) {
  clearTimeout(webBufferingTimer);
  clearTimeout(webStallTimer);
  webStallTimer = null;
  const absolutePosition = webPlaybackOffset.value + event.target.currentTime;
  // A rebuffer must never drop the viewer back to the start of a segment.
  // Restore even a ~1s rewind: a small one with a native seek inside the
  // buffered window, a large one by re-basing the stream.
  if (webBufferRecoveryPosition.value >= 2 && absolutePosition + 1 < webBufferRecoveryPosition.value) {
    const recoveryPosition = webBufferRecoveryPosition.value;
    webBufferRecoveryPosition.value = -1;
    const rewind = recoveryPosition - absolutePosition;
    if (rewind <= 30 && webVideo.value) {
      webVideo.value.currentTime = recoveryPosition - webPlaybackOffset.value;
      webCurrentTime.value = recoveryPosition;
    } else {
      webPlaybackOffset.value = recoveryPosition;
      webCurrentTime.value = recoveryPosition;
      configureMoviePlayback(recoveryPosition);
    }
    return;
  }
  webCurrentTime.value = absolutePosition;
  refreshWebBuffered();
  if (webBufferRecoveryPosition.value >= 0 && absolutePosition + 1 >= webBufferRecoveryPosition.value) webBufferRecoveryPosition.value = -1;
  if (!event.target.paused && event.target.readyState >= 3) {
    webBuffering.value = false;
    // The timeline is advancing with buffered media: the stream is working.
    // Retire any lingering error card and let the controls fade.
    if (webPlayerError.value) {
      webPlayerError.value = "";
      scheduleWebControlsHide();
    }
  }
}

function clearWebRecoveryTimer() {
  if (webRecoveryTimer) clearTimeout(webRecoveryTimer);
  webRecoveryTimer = null;
}

function scheduleWebReconnect(resumeAt = webAbsolutePosition()) {
  if (!webNowPlaying.value) return;
  const vodLadder = webForceHls.value && !webWwpSessionId.value && webNowPlaying.value.kind !== "channel";
  if (vodLadder) {
    // A long healthy stretch since the last recovery starts a fresh budget.
    if (webHlsRecoveryAt >= 0 && Math.abs(resumeAt - webHlsRecoveryAt) > 120) { webHlsAttempts = 0; webHlsRecoveries = 0; }
    webHlsRecoveryAt = resumeAt;
    const exhausted = webHlsRecoveries >= WEB_HLS_RECOVERY_LIMIT;
    if (exhausted || webHlsAttempts >= WEB_HLS_REINIT_LIMIT) {
      if (!exhausted && advanceWebHlsFallback(resumeAt)) return;
      clearWebRecoveryTimer();
      clearTimeout(webStallTimer);
      webStallTimer = null;
      webBuffering.value = false;
      webPlayerError.value = "This title could not be played on this browser.";
      return;
    }
    webHlsAttempts += 1;
    webHlsRecoveries += 1;
  }
  webPlaybackRetryCount.value += 1;
  webBuffering.value = true;
  webPlayerError.value = "";
  showWebControls();
  clearWebRecoveryTimer();
  clearTimeout(webStallTimer);
  webStallTimer = null;
  const delay = Math.min(15_000, 750 * (2 ** Math.min(4, webPlaybackRetryCount.value - 1)));
  webRecoveryTimer = setTimeout(() => {
    webRecoveryTimer = null;
    if (webNowPlaying.value) restartWebAt(resumeAt);
  }, delay);
}

function webAbsolutePosition() {
  return Math.max(0, webPlaybackOffset.value + (webVideo.value?.currentTime || 0));
}

// HLS recovery ladder, same order as the Roku client: reinitialise the current
// strategy a bounded number of times at the last confirmed position, then step
// REMUX -> AUDIO transcode -> FULL transcode. FULL is terminal (never endless).
const webHlsFallback = ref("");
let webHlsStrategy = "", webHlsAttempts = 0, webHlsRecoveries = 0, webHlsRecoveryAt = -1;
const WEB_HLS_REINIT_LIMIT = 2, WEB_HLS_RECOVERY_LIMIT = 12;
function resetWebHlsLadder() {
  webHlsFallback.value = "";
  webHlsStrategy = ""; webHlsAttempts = 0; webHlsRecoveries = 0; webHlsRecoveryAt = -1;
}
function nextWebHlsFallback() {
  if (webHlsFallback.value === "full" || webHlsStrategy === "HLS_FULL_TRANSCODE") return "";
  if (webHlsFallback.value === "audio" || /^HLS_(AUDIO|VIDEO|PARTIAL)_TRANSCODE$/.test(webHlsStrategy)) return "full";
  return "audio";
}
function advanceWebHlsFallback(resumeAt) {
  const next = nextWebHlsFallback();
  if (!next) return false;
  webHlsFallback.value = next;
  webHlsStrategy = ""; webHlsAttempts = 0;
  webEncodeStrategy.value = ""; webPendingEncodeStrategy.value = "";
  webPlaybackRetryCount.value = 0;
  webPlaybackOffset.value = resumeAt; webCurrentTime.value = resumeAt;
  webBuffering.value = true; webMediaReady.value = false;
  setWebStartupProgress(55, next === "full" ? "Full transcode" : "Audio transcode");
  showWebControls();
  configureMoviePlayback(resumeAt);
  return true;
}

// Original quality always tries the direct file first (no HLS at all - the
// cheapest, most seek-friendly path when the browser can just play the source
// natively) and falls back to the HLS pipeline (Copy, then the server's own
// Copy -> transcode cascade) the moment that direct attempt fails or stalls.
function fallBackToHlsFromDirect(resumeAt) {
  clearTimeout(webDirectStartupTimer);
  const target = webNowPlaying.value?.kind === "channel" ? 0 : Math.max(0, Number(resumeAt) || 0);
  webForceHls.value = true;
  // HLS is a transport transition, not a final strategy badge.
  webEncodeStrategy.value = "";
  webPendingEncodeStrategy.value = "";
  webPlaybackRetryCount.value = 0;
  webPlaybackOffset.value = target;
  webCurrentTime.value = target;
  webBuffering.value = true;
  resetWebHlsLadder();
  setWebStartupProgress(55, "Switching to HLS");
  webMediaReady.value = false;
  showWebControls();
  configureMoviePlayback(target);
}

function handleWebVideoError() {
  if (!webNowPlaying.value) return;
  if (!webForceHls.value && !webWwpSessionId.value) {
    // Native transport failed for this item - fall back to the HLS pipeline,
    // re-based at the exact spot playback stopped.
    fallBackToHlsFromDirect(webAbsolutePosition());
    return;
  }
  // Keep retrying with capped backoff while the player remains open. This
  // survives a streamer restart of any length and resumes VOD at the last
  // absolute position (Live TV naturally rejoins the live edge).
  scheduleWebReconnect(webAbsolutePosition());
}

function onWebReady(event) {
  // A Direct -> HLS (or fallback-rung) switch reloads the element, which leaves
  // it paused; resume unless the viewer paused on purpose.
  if ((event?.type === "canplay" || event?.type === "loadeddata") && webNowPlaying.value && !wwpUserPaused && event.target?.paused) startWebPlayback(event.target);
  if (!webForceHls.value && event?.type === 'playing') clearTimeout(webDirectStartupTimer);
  clearTimeout(webBufferingTimer);
  clearTimeout(webStallTimer);
  webStallTimer = null;
  if (event?.type === "playing") {
    webPlaying.value = true;
  }
  webBuffering.value = false;
  setWebStartupProgress(100, "Ready");
  webPlaybackRetryCount.value = 0;
  // A "playing"/"canplay"/first-frame signal means the stream is viable again;
  // drop any stale playback error so it does not block the auto-hide.
  webPlayerError.value = "";
  if (event?.type === "playing" && !webMediaReady.value) {
    const video = event.target;
    const readyPlaybackToken = webPlaybackToken;
    const reveal = () => {
      if (video !== webVideo.value || readyPlaybackToken !== webPlaybackToken || webMediaReady.value) return;
      video.style.opacity = "1";
      webMediaReady.value = true;
      // A strategy badge is a final playback state. Commit it only after a
      // decoded video frame is available, never on `playing`/`canplay` alone.
      if (webPendingEncodeStrategy.value) webEncodeStrategy.value = webPendingEncodeStrategy.value;
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
    // rVFC never fires while the decoder is wedged (audio plays, frame is
    // black). A timeout may reveal a frame only when the element reports real
    // video dimensions; otherwise the badge and frame remain unconfirmed.
    setTimeout(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) reveal();
    }, 1200);
    startWebVideoWedgeWatchdog(video);
  }
  scheduleWebControlsHide();
}

// After an error-recovery restart the MSE video decoder can stay wedged: audio
// advances but no frame is ever painted (videoWidth stays 0). Nudge it, then
// fall back to a full stream reload.
let webWedgeWatchdog = null;
let webWedgeStage = 0;
let webWedgeRestarts = 0;
function clearWebVideoWedgeWatchdog() {
  if (webWedgeWatchdog) clearInterval(webWedgeWatchdog);
  webWedgeWatchdog = null;
  webWedgeStage = 0;
}
function startWebVideoWedgeWatchdog(video) {
  clearWebVideoWedgeWatchdog();
  let lastTime = -1;
  let stalls = 0;
  webWedgeWatchdog = setInterval(() => {
    if (video !== webVideo.value || video.paused) { clearWebVideoWedgeWatchdog(); return; }
    const advancing = video.currentTime > lastTime + 0.05;
    lastTime = video.currentTime;
    // Audio advancing + a real frame painted => healthy, we are done.
    if (advancing && video.videoWidth > 0) { clearWebVideoWedgeWatchdog(); return; }
    if (!advancing) { stalls = 0; return; }
    stalls += 1;
    if (stalls === 2 && webWedgeStage < 1) {
      webWedgeStage = 1;
      try { video.currentTime = video.currentTime + 0.12; } catch { /* not seekable yet */ }
    } else if (stalls >= 4 && webWedgeStage < 2) {
      webWedgeStage = 2;
      clearWebVideoWedgeWatchdog();
      if (webWedgeRestarts >= 2) { webMediaReady.value = true; webVideo.value.style.opacity = "1"; return; }
      webWedgeRestarts += 1;
      const resumeAt = webAbsolutePosition();
      webMediaReady.value = false;
      restartWebAt(resumeAt);
    }
  }, 1000);
}

function onWebFirstFrame() {
  webMediaReady.value = true;
  if (webPendingEncodeStrategy.value) webEncodeStrategy.value = webPendingEncodeStrategy.value;
  onWebReady();
}

// Set by restartWebAt when the reload is a deliberate user seek/quality change;
// consumed (once) here so the server treats it as a real seek and moves the
// partner. A recovery/join/follow reload leaves it false.
let wwpSeekIntent = false;
function movieStreamUrl(startSeconds = 0) {
  const source = webPlayerSrc.value;
  if (!source) return "";
  const target = new URL(source);
  const hls = target.pathname.includes('/api/xtream/hls/');
  const item = webNowPlaying.value;
  const providerURL = typeof item?.providerURL === 'string' ? item.providerURL : typeof item?.providerUrl === 'string' ? item.providerUrl : '';
  if (hls && providerURL) target.searchParams.set('providerURL', providerURL);
  if (startSeconds > 0 && hls) target.searchParams.set("start", String(Math.floor(startSeconds)));
  if (hls && wwpSeekIntent && webWwpSessionId.value) target.searchParams.set("wwpSeek", "1");
  if (hls && webHlsFallback.value && !webWwpSessionId.value) target.searchParams.set("hlsFallback", webHlsFallback.value);
  wwpSeekIntent = false;
  return target.toString();
}

function isHlsPlaybackUrl(source) {
  try {
    const target = new URL(source);
    return target.pathname.includes('/api/xtream/hls/') || target.pathname.endsWith('.m3u8');
  } catch { return String(source || '').includes('/api/xtream/hls/'); }
}

// A Direct -> HLS switch happens after the original click has expired. When
// autoplay blocks that delayed play(), start muted and let the viewer restore
// sound with an explicit tap. Keep genuine media errors on the recovery path.
async function startWebPlayback(video, retries = 3) {
  if (!video) return false;
  const playbackToken = webPlaybackToken;
  try {
    await video.play();
    webPlaying.value = true;
    if (!video.muted) { webMuted.value = false; webAutoplayBlocked.value = false; }
    return true;
  } catch (error) {
    if (error?.name !== "NotAllowedError") {
      // play() is aborted when the source is (re)attached right after it, e.g.
      // hls.js finishing MSE setup. Playback must still start on its own after
      // preflight, so retry a few times while this attempt is still current.
      if (retries > 0 && playbackToken === webPlaybackToken && !wwpUserPaused) {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (playbackToken === webPlaybackToken && !wwpUserPaused) return startWebPlayback(video, retries - 1);
      }
      webPlaying.value = false;
      return false;
    }
  }
  try {
    video.muted = true;
    webMuted.value = true;
    webAutoplayBlocked.value = true;
    await video.play();
    webPlaying.value = true;
    return true;
  } catch {
    webPlaying.value = false;
    webBuffering.value = false;
    showWebControls();
    return false;
  }
}

function unmuteWebPlayback() {
  const video = webVideo.value;
  if (!video) return;
  video.muted = false;
  webMuted.value = false;
  webAutoplayBlocked.value = false;
  if (video.paused) startWebPlayback(video);
}

// The server picks copy vs. transcode per file (a probe decision, not the
// viewer's quality rung) and reports it as response headers on the manifest.
// A plain independent fetch is the simplest way to read them without hooking
// hls.js's own loader - the manifest is tiny, so the extra request is cheap.
function describeEncodeStrategy(strategy, videoMode) {
  if (strategy === "DIRECT") return "DIRECT";
  if (strategy === "HLS_REMUX") return "HLS REMUX";
  if (strategy === "HLS_AUDIO_TRANSCODE") return "HLS AUDIO TRANSCODE";
  if (strategy === "HLS_VIDEO_TRANSCODE") return "HLS VIDEO TRANSCODE";
  if (strategy === "HLS_FULL_TRANSCODE") return "HLS FULL TRANSCODE";
  if (strategy === "HLS_PARTIAL_TRANSCODE") return videoMode === "transcode" ? "HLS VIDEO TRANSCODE" : "HLS AUDIO TRANSCODE";
  return "";
}
async function fetchWebEncodeStrategy(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const label = describeEncodeStrategy(response.headers.get("X-RH-Strategy") || "", response.headers.get("X-RH-Video-Mode") || "");
    if (label) {
      webPendingEncodeStrategy.value = label;
      if (webMediaReady.value && webVideo.value && !webVideo.value.paused) webEncodeStrategy.value = label;
    }
  } catch { /* Keep the final badge hidden until a strategy is confirmed. */ }
}

async function configureMoviePlayback(startSeconds = 0) {
  await nextTick();
  const video = webVideo.value;
  const source = movieStreamUrl(startSeconds);
  webEncodeStrategy.value = "";
  const playbackToken = ++webPlaybackToken;
  clearTimeout(webDirectStartupTimer);
  if (!video || !source) {
    webPlayerError.value = "This movie does not have a playable stream.";
    return;
  }
  if (webHls) {
    webHls.destroy();
    webHls = null;
  }
  clearWebRecoveryTimer();
  clearWebVideoWedgeWatchdog();
  clearTimeout(webBufferingTimer);
  video.removeAttribute("src");
  // Drop any object source and force a full element reset so the previous
  // decoder never carries over (the cause of a black frame with live audio
  // after an error-recovery reload).
  try { video.srcObject = null; } catch { /* not all browsers */ }
  video.style.opacity = "0";
  // Carry the current mute choice onto the (re)loaded element so a pre-muted
  // auto-play start (WWP joiner) is not fighting an un-muted element.
  video.muted = webMuted.value;
  // Let the browser itself start playback as soon as data is ready, unless the
  // viewer paused on purpose; startWebPlayback below is only the backstop.
  video.autoplay = !wwpUserPaused;
  video.load();
  try {
    const directPlayback = !webForceHls.value && !webWwpSessionId.value;
    if (directPlayback) {
      webPendingEncodeStrategy.value = "DIRECT";
      setWebStartupProgress(45, "Direct");
      // Native MP4 carries the whole timeline, so a resume point is a real
      // element seek once metadata is in (not a re-based manifest request).
      const seekTarget = webPendingSeek.value > 0 ? webPendingSeek.value : startSeconds;
      if (seekTarget > 0) {
        video.addEventListener("loadedmetadata", () => {
          try { video.currentTime = seekTarget; } catch { /* not seekable yet */ }
          webPendingSeek.value = -1;
        }, { once: true });
      }
      // A container the browser cannot actually decode often never fires
      // `error` at all - it just sits there. Match Android/Roku's safe Direct
      // startup window so slow remote files do not switch prematurely.
      webDirectStartupTimer = setTimeout(() => {
        if (playbackToken !== webPlaybackToken || webForceHls.value || webMediaReady.value) return;
        fallBackToHlsFromDirect(webNowPlaying.value?.kind === "channel" ? 0 : Math.max(startSeconds, webAbsolutePosition()));
      }, 30_000);
      // Chrome/Firefox need hls.js to consume a provider's live m3u8. Loading
      // the /play URL through hls.js still follows the 302 and streams directly
      // from the provider; it does not invoke RH HLS/transcoding.
      if (webNowPlaying.value?.kind === "channel" || isHlsPlaybackUrl(source)) {
        const Hls = await loadHlsConstructor();
        if (playbackToken !== webPlaybackToken) return;
        if (Hls.isSupported()) {
          webHls = new Hls({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 3 });
          webHls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && playbackToken === webPlaybackToken && !webForceHls.value) fallBackToHlsFromDirect(0);
          });
          webHls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (playbackToken === webPlaybackToken) startWebPlayback(video);
          });
          webHls.loadSource(source);
          webHls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = source;
          await startWebPlayback(video);
        } else fallBackToHlsFromDirect(0);
      } else {
        video.src = source;
        await startWebPlayback(video);
      }
    } else {
      setWebStartupProgress(60, webPendingEncodeStrategy.value.replace(/^HLS /, "") || "Preparing stream");
      const Hls = await loadHlsConstructor();
      if (playbackToken !== webPlaybackToken) return;
      if (Hls.isSupported()) {
        webHls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Normally start at segment 0 - the ffmpeg job's -ss offset IS the
          // resume point. A Watch-with-Partner participant instead rides the
          // live edge of the shared, already-running job so it lands where the
          // partner is, not ~20-30s back at the start of the rolling window.
          startPosition: webWwpSessionId.value ? -1 : 0,
          testBandwidth: false,
          startFragPrefetch: true,
          // Buffer far ahead so a provider hiccup mid-stream rides out on the
          // cushion instead of stalling; keep a longer back-buffer for rewinds.
          // (The server keeps ~HLS_VOD_LIST_SIZE*2s of segments on disk.)
          maxBufferLength: 240,
          maxMaxBufferLength: 300,
          backBufferLength: 90,
          // Recover from a stall faster instead of waiting out the default.
          nudgeMaxRetry: 10,
          fragLoadingMaxRetry: 8,
          manifestLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
        });
        webHls.on(Hls.Events.ERROR, (_event, data) => {
          if (playbackToken !== webPlaybackToken) return;
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && webPlaybackRetryCount.value < 2) {
            webPlaybackRetryCount.value += 1;
            webHls.recoverMediaError();
            return;
          }
          scheduleWebReconnect(webAbsolutePosition());
        });
        webHls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => {
          if (playbackToken !== webPlaybackToken) return;
          const response = data.networkDetails;
          const header = name => response?.getResponseHeader?.(name) || response?.headers?.get?.(name) || '';
          webHlsStrategy = header('X-RH-Strategy');
          const label = describeEncodeStrategy(webHlsStrategy, header('X-RH-Video-Mode'));
          if (label) {
            webPendingEncodeStrategy.value = label;
            // Headers can arrive just after the first decoded frame. In that
            // ordering, commit now because playback has already been proven.
            if (webMediaReady.value && !video.paused) webEncodeStrategy.value = label;
          }
          const duration = Number(header('X-RH-Duration'));
          if (duration > 0) webDuration.value = duration;
        });
        // Wait for a usable playlist before asking the media element to play.
        // MEDIA_ATTACHED only means MSE is connected; FFmpeg may still be
        // creating its first segments. Ignore callbacks from a retired source.
        webHls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (playbackToken !== webPlaybackToken) return;
          setWebStartupProgress(80, webPendingEncodeStrategy.value.replace(/^HLS /, "") || "Buffering");
          startWebPlayback(video);
        });
        webHls.loadSource(source);
        webHls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source;
        await startWebPlayback(video);
      } else webPlayerError.value = "HLS playback is not supported on this device.";
    }
  } catch { scheduleWebReconnect(Math.max(0, startSeconds)); }
}

async function playWebMovie(item) {
  webStreamTicket.value = "";
  // Starting a normal playback ends any WWP guest role from a previous session.
  if (webWwpSessionId.value) stopWwpSync();
  webIsWwpGuest.value = false;
  webMuted.value = false;
  webAutoplayBlocked.value = false;
  // A bounded server probe selects Direct or the exact HLS codec matrix before
  // assigning a source to the browser media element.
  webForceHls.value = false;
  resetWebHlsLadder();
  wwpUserPaused = false;
  webEncodeStrategy.value = "";
  webPendingEncodeStrategy.value = "";
  webNowPlaying.value = item;
  webMini.value = false;
  webPlaying.value = false;
  webMuted.value = false;
  webCurrentTime.value = 0;
  webDuration.value = 0;
  webPlaybackOffset.value = 0;
  webBufferedTime.value = 0;
  webPendingSeek.value = -1;
  webBufferRecoveryPosition.value = -1;
  webMediaReady.value = false;
  webBuffering.value = true;
  setWebStartupProgress(5, "Starting");
  await new Promise(resolve => setTimeout(resolve, 0));
  setWebStartupProgress(12, "Checking media");
  webControlsVisible.value = true;
  webPlayerError.value = "";
  webPlaybackRetryCount.value = 0;
  webWedgeRestarts = 0;
  clearWebVideoWedgeWatchdog();
  await resolveWebPlayableItem(item);
  const providerURL = webNowPlaying.value?.providerURL || webNowPlaying.value?.providerUrl;
  if (typeof providerURL !== 'string' || !/^https?:\/\//i.test(providerURL)) {
    throw new Error('This item is missing its original provider URL. Refresh the playlist and try again.');
  }
  if (!webNowPlaying.value.providerURL) webNowPlaying.value = { ...webNowPlaying.value, providerURL };
  // Native metadata or the HLS response supplies the runtime. A separate
  // provider probe before Play added up to 30s and competed for its stream slot.
  webDuration.value = parseDuration(webNowPlaying.value?.duration);
  if (!deviceToken.value) await loadStreamTicket(webNowPlaying.value);
  setWebStartupProgress(30, "Choosing path");
  if (webNowPlaying.value.kind === "channel") {
    // Live TV has no codec matrix (the streamer only serves the decision for
    // movie/series): play the provider stream directly, or RH HLS when the page
    // is https and the provider URL is plain http (mixed content).
    const mixedContent = window.location.protocol === "https:" && /^http:/i.test(providerURL);
    webForceHls.value = mixedContent;
    webPendingEncodeStrategy.value = mixedContent ? "" : "DIRECT";
  } else {
    await decideWebPlayback(webNowPlaying.value);
  }
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

async function openSeriesEpisodes(item, { updateHistory = true } = {}) {
  const requestSeriesKey = `${item?.sourceId || ""}:${item?.id || ""}`;
  episodesFrom.value = ["welcome", "series", "movies", "channels"].includes(safariPage.value) ? safariPage.value : "series";
  selectedSeries.value = item;
  seriesEpisodes.value = [];
  selectedSeasonNumber.value = null;
  seriesEpisodesError.value = "";
  seriesEpisodesLoading.value = true;
  safariPage.value = "episodes";
  if (updateHistory && item?.id && item?.sourceId) {
    const path = `/series/${encodeURIComponent(item.id)}/episodes?sourceId=${encodeURIComponent(item.sourceId)}`;
    window.history.pushState({ appPage: "episodes", sourceId: item.sourceId, seriesId: String(item.id) }, "", path);
  }
  try {
    if (!item?.sourceId || !item?.id) throw new Error("This series does not have episode information.");
    const details = await request(`/api/xtream/series/${encodeURIComponent(item.sourceId)}/${encodeURIComponent(item.id)}`);
    if (`${selectedSeries.value?.sourceId || ""}:${selectedSeries.value?.id || ""}` !== requestSeriesKey) return;
    selectedSeries.value = { ...selectedSeries.value, title: details.title || item.title };
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
  const seriesTitle = episode.seriesTitle || selectedSeries.value?.title || "";
  return playLibraryItem({ ...episode, title: `${seriesTitle} (${episode.episodeNumber || ""})` });
}

function stopLiveTvPreview({ clearSelection = false } = {}) {
  liveTvRequestId += 1;
  clearTimeout(liveTvRecoveryTimer);
  liveTvRecoveryTimer = null;
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
    liveTvRecoveryAttempts = 0;
    liveTvSelected.value = null;
    liveTvError.value = "";
  }
}

function stopPlaylistPreview({ clearSelection = false } = {}) {
  playlistPreviewRequestId += 1;
  clearTimeout(playlistPreviewRecoveryTimer);
  playlistPreviewRecoveryTimer = null;
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
    playlistPreviewRecoveryAttempts = 0;
    playlistPreviewSelected.value = null;
    playlistPreviewError.value = "";
  }
}

async function selectPlaylistPreview(item, { recovery = false } = {}) {
  if (!recovery) playlistPreviewRecoveryAttempts = 0;
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
    target.searchParams.set("client", "browser");
    target.searchParams.set("streamTicket", authorization.ticket);
    await nextTick();
    if (requestId !== playlistPreviewRequestId) return;
    const video = playlistPreviewVideo.value;
    if (!video) throw new Error("The preview player is unavailable.");
    const startPlayback = async () => {
      playlistPreviewRecoveryAttempts = 0;
      playlistPreviewError.value = "";
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
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && playlistPreviewRecoveryAttempts < 2) {
          playlistPreviewRecoveryAttempts += 1;
          playlistPreviewHls?.recoverMediaError();
          return;
        }
        playlistPreviewLoading.value = true;
        playlistPreviewError.value = "Reconnecting…";
        playlistPreviewRecoveryAttempts += 1;
        const delay = Math.min(15_000, 750 * (2 ** Math.min(4, playlistPreviewRecoveryAttempts - 1)));
        clearTimeout(playlistPreviewRecoveryTimer);
        playlistPreviewRecoveryTimer = setTimeout(() => {
          if (playlistPreviewSelected.value === item) selectPlaylistPreview(item, { recovery: true });
        }, delay);
      });
      playlistPreviewHls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = target.toString();
      await startPlayback();
    } else throw new Error("Preview playback is not supported in this browser.");
  } catch (error) {
    if (requestId !== playlistPreviewRequestId) return;
    playlistPreviewLoading.value = true;
    playlistPreviewError.value = "Reconnecting…";
    playlistPreviewRecoveryAttempts += 1;
    const delay = Math.min(15_000, 750 * (2 ** Math.min(4, playlistPreviewRecoveryAttempts - 1)));
    playlistPreviewRecoveryTimer = setTimeout(() => {
      if (playlistPreviewSelected.value === item) selectPlaylistPreview(item, { recovery: true });
    }, delay);
  }
}

function handleLiveTvScroll(event) {
  const element = event.currentTarget;
  if (element.scrollTop + element.clientHeight < element.scrollHeight - 32) return;
  if (liveTvVisibleCount.value < liveTvChannels.value.length) liveTvVisibleCount.value += 20;
}

async function selectLiveTvChannel(item, { recovery = false } = {}) {
  if (!recovery) liveTvRecoveryAttempts = 0;
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
    target.searchParams.set("client", "browser");
    target.searchParams.set("streamTicket", authorization.ticket);
    await nextTick();
    if (requestId !== liveTvRequestId) return;
    const video = liveTvVideo.value;
    if (!video) throw new Error("The TV preview is unavailable.");
    const startPlayback = async () => {
      liveTvRecoveryAttempts = 0;
      liveTvError.value = "";
      liveTvLoading.value = false;
      try { await video.play(); } catch { /* Native controls remain available when autoplay is blocked. */ }
    };
    const Hls = await loadHlsConstructor();
    if (Hls.isSupported()) {
      liveTvHls = new Hls({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 3 });
      liveTvHls.on(Hls.Events.MEDIA_ATTACHED, () => liveTvHls?.loadSource(target.toString()));
      liveTvHls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      liveTvHls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && liveTvRecoveryAttempts < 2) {
          liveTvRecoveryAttempts += 1;
          liveTvHls?.recoverMediaError();
          return;
        }
        liveTvLoading.value = true;
        liveTvError.value = "Reconnecting…";
        liveTvRecoveryAttempts += 1;
        const delay = Math.min(15_000, 750 * (2 ** Math.min(4, liveTvRecoveryAttempts - 1)));
        clearTimeout(liveTvRecoveryTimer);
        liveTvRecoveryTimer = setTimeout(() => {
          if (liveTvSelected.value === item) selectLiveTvChannel(item, { recovery: true });
        }, delay);
      });
      liveTvHls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = target.toString();
      await startPlayback();
    } else throw new Error("Live TV playback is not supported in this browser.");
  } catch (error) {
    if (requestId !== liveTvRequestId) return;
    liveTvLoading.value = true;
    liveTvError.value = "Reconnecting…";
    liveTvRecoveryAttempts += 1;
    const delay = Math.min(15_000, 750 * (2 ** Math.min(4, liveTvRecoveryAttempts - 1)));
    liveTvRecoveryTimer = setTimeout(() => {
      if (liveTvSelected.value === item) selectLiveTvChannel(item, { recovery: true });
    }, delay);
  }
}

watch([safariPage, safariLibraryTab], ([pageName, tab]) => {
  liveTvVisibleCount.value = 20;
  if (pageName !== "channels" || tab !== "channel") stopLiveTvPreview({ clearSelection: true });
  if (pageName !== "playlist") stopPlaylistPreview({ clearSelection: true });
});

watch([kind, sourceId], () => stopPlaylistPreview({ clearSelection: true }));

async function closeWebPlayer() {
  // Watch with Partner: tell the other participant to close too (unless it was
  // them closing that brought us here). sendBeacon so it survives a tab close.
  if (webWwpSessionId.value && !wwpRemoteEnded) {
    const q = new URLSearchParams();
    if (webStreamTicket.value) q.set("streamTicket", webStreamTicket.value);
    if (deviceToken.value) q.set("deviceToken", deviceToken.value);
    const endUrl = `${browserStreamer}/api/xtream/wwp-end/${encodeURIComponent(webWwpSessionId.value)}?${q}`;
    try { navigator.sendBeacon(endUrl); } catch { fetch(endUrl, { method: "POST", keepalive: true }).catch(() => {}); }
  }
  wwpRemoteEnded = false;
  stopWwpSync();
  clearWebControlsTimer();
  clearWebRecoveryTimer();
  clearTimeout(webStallTimer);
  clearTimeout(webDirectStartupTimer);
  webPlaybackToken += 1;
  webStallTimer = null;
  clearWebVideoWedgeWatchdog();
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
  webMini.value = false;
  webMiniPos.value = null;
  webPendingSeek.value = -1;
  webMediaReady.value = false;
  webBuffering.value = false;
}

async function toggleWebPlayback() {
  if (!webVideo.value) return;
  const wwp = webWwpSessionId.value && !wwpApplyingRemote;
  if (webVideo.value.paused) {
    wwpUserPaused = false;
    if (wwp) sendWwpControl(false);
    const playbackToken = webPlaybackToken;
    try { await webVideo.value.play(); }
    catch (error) {
      // The Direct attempt can be replaced by HLS while play() is pending.
      // That abort belongs to the old media source, not the new stream.
      if (playbackToken !== webPlaybackToken || error?.name === "AbortError") return;
      webBuffering.value = false;
      webPlayerError.value = "Playback could not start.";
    }
  } else {
    wwpUserPaused = true;
    clearWebRecoveryTimer();
    clearTimeout(webStallTimer);
    webStallTimer = null;
    webVideo.value.pause();
    if (wwp) sendWwpControl(true);
  }
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
  webSeekTimer = setTimeout(() => restartWebAt(next, { userSeek: true }), 650);
}

function seekWebBy(seconds) {
  const basePosition = webPendingSeek.value >= 0 ? webPendingSeek.value : webCurrentTime.value;
  seekWebTo(basePosition + seconds);
}

async function restartWebAt(target, opts = {}) {
  webSeekTimer = null;
  if (!webNowPlaying.value) return;
  webPendingSeek.value = -1;
  // Only a deliberate user seek / quality change should move the partner. A
  // reload from error-recovery or from following the partner must NOT, or a
  // flaky provider's constant restarts turn into a restart cascade between the
  // two players.
  wwpSeekIntent = Boolean(opts.userSeek) && Boolean(webWwpSessionId.value);
  wwpApplyingRemote = true;
  setTimeout(() => { wwpApplyingRemote = false; }, 1500);
  const nextSource = webPlayerSrc.value;
  const nextIsHls = isHlsPlaybackUrl(nextSource);
  // A bare element seek only works when the media element is already bound to
  // this exact native stream (no HLS.js instance in play). When the transport
  // kind is switching (rung <-> Auto), the element must be rebuilt instead.
  if (nextSource && !nextIsHls && !webHls && webVideo.value) {
    webPlaybackOffset.value = 0;
    webCurrentTime.value = target;
    webPlayerError.value = "";
    webBuffering.value = true;
    showWebControls();
    try {
      webVideo.value.currentTime = target;
      if (!await startWebPlayback(webVideo.value)) handleWebVideoError();
    } catch { handleWebVideoError(); }
    return;
  }
  webPlaybackOffset.value = nextIsHls ? target : 0;
  webCurrentTime.value = target;
  if (!nextIsHls) webPendingSeek.value = target;
  webPlayerError.value = "";
  webBuffering.value = true;
  webMediaReady.value = false;
  showWebControls();
  await configureMoviePlayback(target);
}

// Watch with Partner: invite the account set in Settings to watch the exact
// same HLS output - one provider connection shared by both accounts, not two.
async function sendPartnerInvite() {
  webPartnerMenuOpen.value = false;
  if (!webNowPlaying.value) return;
  try {
    const item = webNowPlaying.value;
    const start = Math.max(0, webPlaybackOffset.value + (webVideo.value?.currentTime || 0));
    const data = await request("/api/partner/invite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: item.sourceId, kind: item.kind, id: item.id, providerURL: item.providerURL || item.providerUrl || '', extension: item.extension || "", title: item.title || "", start, quality: "", durationSeconds: Math.round(webDuration.value) || 0, hostAvatar: activeProfile.value?.avatarImage || "" }),
    });
    webWwpSessionId.value = data.wwpSessionId;
    webIsWwpGuest.value = false; // we are the host - keep authenticating with our device token
    messageType.value = "success";
    message.value = `Invite sent to ${data.partnerEmail}.`;
    // Force our own playback onto the shared HLS job. A direct-play MP4 keeps a
    // second provider connection open that the partner's HLS job then can't get
    // (one connection per provider line), so the partner never buffers until we
    // close our player. Both sides must ride the identical HLS job.
    webForceHls.value = true;
    // Reload our own stream at the same spot, now tagged with the session id,
    // so the server has something to reconcile the partner's join against.
    await restartWebAt(start);
    watchWwpSync();
  } catch (error) {
    messageType.value = "error";
    message.value = error.message;
  }
}

async function joinPartnerInvite(invite) {
  if (!invite?.wwpSessionId) return;
  // A second tap on "Join" (or a re-delivered invite) must not spin up a
  // second HLS.js on the same element and a second sync long-poll.
  if (webWwpSessionId.value === invite.wwpSessionId && webNowPlaying.value) { pendingPartnerInvite.value = null; return; }
  pendingPartnerInvite.value = null;
  webStreamTicket.value = invite.streamTicket || "";
  webWwpSessionId.value = invite.wwpSessionId;
  webIsWwpGuest.value = true; // joined via the host's ticket; never send our own token on media requests
  webForceHls.value = true;
  webNowPlaying.value = { sourceId: invite.sourceId, kind: invite.kind, id: invite.id, providerURL: invite.providerURL || '', extension: invite.extension || "", title: invite.title || "Watch with partner" };
  webPlaying.value = false;
  // The Join click's user-gesture is spent by the time HLS.js is ready, so the
  // first play() will be an auto-play and must start muted; the unmute pill
  // (and any tap on the video) restores sound.
  webMuted.value = true;
  webAutoplayBlocked.value = true;
  const joinAt = Math.max(0, Number(invite.start) || 0);
  webCurrentTime.value = joinAt;
  // A WWP partner does not own the host's source. The invite carries the
  // host's duration; if the host had none either, try the duration endpoint
  // ourselves with the host's stream ticket (it resolves the snapshot / any
  // cached probe under the host's account).
  webDuration.value = Math.max(0, Number(invite.durationSeconds) || 0);
  if (!webDuration.value && invite.kind !== "channel") void loadWwpGuestDuration(invite);
  // The stream is served with -ss joinAt, so video.currentTime 0 maps to this
  // absolute position - the display anchor must be joinAt, not 0, or the timer
  // reads ~joinAt seconds behind the host. wwp-sync re-anchors it precisely to
  // the shared job's real -ss right after (the server may snap our start).
  webPlaybackOffset.value = joinAt;
  webBufferedTime.value = joinAt;
  webPendingSeek.value = -1;
  webBufferRecoveryPosition.value = -1;
  webMediaReady.value = false;
  webBuffering.value = true;
  webControlsVisible.value = true;
  webPlayerError.value = "";
  webPlaybackRetryCount.value = 0;
  await configureMoviePlayback(joinAt);
  watchWwpSync();
}

function toggleWebMute() {
  if (!webVideo.value) return;
  webVideo.value.muted = !webVideo.value.muted;
  webMuted.value = webVideo.value.muted;
  if (!webMuted.value) webAutoplayBlocked.value = false;
  if (!webMuted.value && webVideo.value.paused) startWebPlayback(webVideo.value);
}

async function fullscreenWebMovie(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!webVideo.value) return;

  // From the mini-player this just pops back to the full overlay.
  if (webMini.value) { webMini.value = false; return; }
  const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsElement || webFullscreen.value) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (webVideo.value.webkitExitFullscreen) webVideo.value.webkitExitFullscreen();
    } catch { /* CSS fullscreen still toggled off below */ }
    webFullscreen.value = false;
    webMini.value = true; // exit fullscreen -> float in the corner
    return;
  }
  // Real OS-level fullscreen. Prefer the player element / page (keeps our own
  // controls); on iPhone the element Fullscreen API does not exist, so fall
  // back to the native <video> fullscreen, which IS the only true fullscreen
  // there. The CSS .is-fullscreen layout rides along as a last resort.
  webMini.value = false;
  webFullscreen.value = true;
  const target = webVideo.value.closest(".web-player") || document.documentElement;
  try {
    if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: "hide" });
    else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    else if (webVideo.value.webkitEnterFullscreen) webVideo.value.webkitEnterFullscreen();
    else if (webVideo.value.webkitRequestFullscreen) webVideo.value.webkitRequestFullscreen();
  } catch {
    // Element API rejected (rare) - try the native video before giving up.
    try { webVideo.value.webkitEnterFullscreen?.(); } catch { /* CSS fallback */ }
  }
  showWebControls();
}

onBeforeUnmount(() => {
  if (webHls) webHls.destroy();
  stopLiveTvPreview({ clearSelection: true });
  stopPlaylistPreview({ clearSelection: true });
  clearWebRecoveryTimer();
  clearTimeout(webStallTimer);
  clearTimeout(liveTvRecoveryTimer);
  clearTimeout(playlistPreviewRecoveryTimer);
  clearTimeout(webBufferingTimer);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  document.removeEventListener("pointermove", handleWebPlayerPointerMove);
});

function handleFullscreenChange() {
  if (document.fullscreenElement || !webFullscreen.value) return;
  // Leaving fullscreen drops the player into the floating corner mini-player
  // rather than the full in-app overlay, so the app stays usable behind it.
  webFullscreen.value = false;
  if (webNowPlaying.value) webMini.value = true;
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("pointermove", handleWebPlayerPointerMove, { passive: true });

function typeLabel(value) { return value === "series" ? "Series" : value === "movie" ? "Movies" : "Channels"; }
function typeIcon(value) { return value === "series" ? "▦" : value === "movie" ? "▶" : "◉"; }
function streamFormatLabel(item) { return String(item?.extension || item?.streamFormat || "mp4").toUpperCase(); }

function applySource(source) {
  if (!source) return;
  savedItems.value = (source.enabledItems || []).map(hydrateCachedItem);
  archivedItems.value = (source.archivedItems || []).map(hydrateCachedItem);
  rememberItems([...savedItems.value, ...archivedItems.value]);
  sources.value = sources.value.map(item => item.id === source.id ? source : item);
}

function catalogItemCacheKey(item) {
  const source = String(item?.sourceId || item?.source || "");
  const kind = String(item?.kind || item?.type || "");
  const id = String(item?.id || item?.providerId || "");
  return source && kind && id ? `rh-catalog-item:v1:${encodeURIComponent(source)}:${encodeURIComponent(kind)}:${encodeURIComponent(id)}` : "";
}

function isWeakCachedTitle(value) {
  const title = String(value || '').trim();
  return !title || /^\d+$/.test(title) || /^(series|movie|channel)\s+\d+$/i.test(title);
}

function hydrateCachedItem(item) {
  if (!item || typeof item !== "object") return item;
  let cached = null;
  try {
    const direct = catalogItemCacheKey(item);
    if (direct) cached = JSON.parse(window.localStorage.getItem(direct) || "null");
    if (!cached || isWeakCachedTitle(cached.title)) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index) || "";
        if (!key.startsWith("rh-catalog:v3:") && !key.startsWith("rh-catalog:v4:") && !key.startsWith("rh-catalog:v5:")) continue;
        const page = JSON.parse(window.localStorage.getItem(key) || "null");
        const match = (page?.items || []).find(candidate => candidate.key === item.key
          || (String(candidate.sourceId) === String(item.sourceId) && String(candidate.kind) === String(item.kind) && String(candidate.id) === String(item.id))
          || (item.providerUrl && candidate.providerUrl && String(candidate.providerUrl) === String(item.providerUrl))
          || (String(candidate.sourceId) === String(item.sourceId) && String(candidate.kind) === String(item.kind) && String(candidate.id) === String(item.id || "")));
        if (match && (!cached || !isWeakCachedTitle(match.title) || isWeakCachedTitle(cached.title))) { cached = match; if (!isWeakCachedTitle(match.title)) break; }
      }
    }
  } catch { cached = null; }
  if (!cached) return item;
  return {
    ...cached,
    ...item,
    title: isWeakCachedTitle(item.title) ? (cached.title || item.title) : item.title,
    logo: item.logo || cached.logo,
    poster: item.poster || cached.poster || cached.logo,
    thumbnail: item.thumbnail || cached.thumbnail || cached.logo,
    category: item.category && item.category !== "Other" ? item.category : (cached.category || item.category),
    categoryId: item.categoryId || cached.categoryId,
    language: item.language || cached.language,
    extension: item.extension || cached.extension,
    providerUrl: item.providerUrl || cached.providerUrl,
  };
}

function rememberItems(entries = []) {
  const next = { ...knownItems.value };
  for (const item of entries) if (item?.key) {
    next[item.key] = item;
    const cacheKey = catalogItemCacheKey(item);
    if (cacheKey) {
      try { window.localStorage.setItem(cacheKey, JSON.stringify(item)); } catch { /* cache is optional */ }
    }
  }
  knownItems.value = next;
}

function applyManagedLibrary(data) {
  managedLibraryCategories.value = (Array.isArray(data?.categories) ? data.categories : []).filter(Boolean).map(category => ({ ...category, items: Array.isArray(category.items) ? category.items.filter(Boolean).map(hydrateCachedItem) : [] }));
  managedLibraryItems.value = (Array.isArray(data?.items) ? data.items : []).filter(Boolean).map(hydrateCachedItem);
  categoryNameDrafts.value = Object.fromEntries(managedLibraryCategories.value.map(category => [category.id, category.name]));
  if (categoryEditorId.value && !managedLibraryCategories.value.some(category => category.id === categoryEditorId.value)) {
    categoryEditorId.value = "";
    categoryEditorKeys.value = [];
  }
}

async function loadManagedLibrary() {
  // Library categories/assignments were removed. The profile library is the
  // saved provider-URL list exposed by the provider source response.
  const data = await request("/api/xtream/sources", { cache: "no-store" });
  const items = (data.items || []).flatMap(source => (source.enabledItems || []).map(item => hydrateCachedItem({ ...item, sourceId: item.sourceId || source.id })));
  applyManagedLibrary({ categories: [], items });
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

function welcomeProviderItem(item, source) {
  if (!item || !source?.id || !item.id) return null;
  const resolvedKind = item.kind || item.type;
  if (!["series", "movie", "channel"].includes(resolvedKind)) return null;
  // The selection API keys items as `kind:id`; keep the catalog's own key
  // rather than the 3-part home key so saves validate server-side.
  return { ...item, kind: resolvedKind, sourceId: source.id, key: item.key || `${resolvedKind}:${item.id}` };
}

async function loadWelcomeProvider(provider = sources.value.find(source => source.id === sourceId.value)) {
  if (!provider?.id || !["welcome", "playlist"].includes(safariPage.value)) return;
  const requestId = ++welcomeProviderRequestId;
  welcomeProviderLoading.value = true;
  welcomeProviderError.value = "";
  try {
    const encodedSource = encodeURIComponent(provider.id);
    const welcome = await request(`/api/catalog/welcome?sourceId=${encodedSource}`, { cache: "no-store" });
    if (requestId !== welcomeProviderRequestId) return;
    const byKind = [["series", { items: welcome.series || [] }], ["movie", { items: welcome.movie || [] }], ["channel", { items: welcome.channel || [] }]];
    welcomeProviderItems.value = Object.fromEntries(byKind.map(([kind, data]) => [
      kind, (data.items || []).map(item => welcomeProviderItem(item, provider)).filter(Boolean),
    ]));
    // Prefer the persisted provider-catalog table counts; fall back to the
    // live catalog page total when the source has not been synced yet.
    welcomeProviderCounts.value = Object.fromEntries(byKind.map(([kind, data]) => [
      kind, Number(welcome[`${kind}Count`]) || 0,
    ]));
  } catch (error) {
    if (requestId === welcomeProviderRequestId) {
      welcomeProviderItems.value = { series: [], movie: [], channel: [] };
      welcomeProviderCounts.value = { series: 0, movie: 0, channel: 0 };
      welcomeProviderError.value = error.message || "Could not load this playlist.";
    }
  } finally {
    if (requestId === welcomeProviderRequestId) welcomeProviderLoading.value = false;
  }
  // The backdrop montage is per playlist provider - refresh it for this one.
}

function scrollHomeRail(event, direction) {
  const track = event.currentTarget.closest(".home-rail-body")?.querySelector(".home-rail-track");
  if (track) track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: "smooth" });
}

function welcomeItemEnabled(item) {
  const source = sources.value.find(candidate => candidate.id === item?.sourceId);
  return (source?.enabledItems || []).some(candidate => candidate?.key === item?.key
    || (candidate?.id === item?.id && candidate?.kind === item?.kind));
}

async function toggleWelcomeItem(item) {
  if (!item?.sourceId || !item?.id || !["series", "movie", "channel"].includes(item.kind) || busy.value) return;
  busy.value = true;
  try {
    let source = sources.value.find(candidate => candidate.id === item.sourceId);
    if (!source || !Array.isArray(source.enabledItems)) {
      source = (await request(`/api/xtream/sources/${encodeURIComponent(item.sourceId)}/enabled`, { cache: "no-store" })).source;
    }
    if (!source) throw new Error("This playlist source is unavailable.");
    const existing = Array.isArray(source.enabledItems) ? source.enabledItems : [];
    const matches = candidate => candidate?.key === item.key || (candidate?.id === item.id && candidate?.kind === item.kind);
    const isEnabled = existing.some(matches);
    const nextItems = isEnabled ? existing.filter(candidate => !matches(candidate)) : [...existing, item];
    const updated = await request(`/api/xtream/sources/${encodeURIComponent(item.sourceId)}/selection`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabledKeys: nextItems.map(candidate => candidate.key || homeItemKey(candidate)), enabledItems: nextItems }),
    });
    applySource(updated);
    await loadManagedLibrary();
    messageType.value = "success";
    message.value = isEnabled ? `${item.title} removed from ${typeLabel(item.kind)}.` : `${item.title} added to ${typeLabel(item.kind)}.`;
  } catch (error) {
    messageType.value = "error";
    message.value = error.message || "Could not update this item.";
  } finally {
    busy.value = false;
  }
}

function homeExtraItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id || raw.itemId;
  const kind = raw.kind || raw.type;
  if (!id || !["series", "movie", "channel"].includes(kind)) return null;
  // A saved favourite / continue-watching entry can carry a stale sourceId -
  // the provider is recreated with a fresh _id per profile. When it no longer
  // resolves, fall back to a source we can actually reach (the only one, or
  // the currently selected provider) so its episodes/playback still work.
  const resolvedSourceId = sources.value.some(source => source.id === raw.sourceId)
    ? raw.sourceId
    : (sources.value.length === 1 ? sources.value[0].id : (sourceId.value || raw.sourceId || ""));
  if (!resolvedSourceId) return null;
  const seriesTitle = kind === "series"
    ? String(raw.seriesName || raw.seriesTitle || raw.title || "").trim()
    : String(raw.title || "").trim();
  const episodeParts = kind === "series" ? [
    Number(raw.seasonNumber) > 0 ? `Season ${Number(raw.seasonNumber)}` : "",
    Number(raw.episodeNumber) > 0 ? `Episode ${Number(raw.episodeNumber)}` : "",
  ].filter(Boolean) : [];
  // Continue Watching stores the last played episode together with its parent
  // series identity. Keep the card's series artwork/title, but mark that item
  // as an episode so clicking it resumes playback directly instead of treating
  // the episode id as a parent series id and opening an empty episode page.
  const isSavedEpisode = kind === "series" && Boolean(raw.seriesId) && String(id) !== String(raw.seriesId);
  return homeItem({
    ...raw,
    id: String(id),
    kind,
    isEpisode: isSavedEpisode,
    seriesId: isSavedEpisode ? String(raw.seriesId) : raw.seriesId,
    seriesTitle: isSavedEpisode ? seriesTitle : raw.seriesTitle,
    sourceId: resolvedSourceId,
    title: seriesTitle || raw.title,
    logo: raw.logo || raw.poster || "",
    category: episodeParts.join(" · ") || raw.category || raw.categoryId || "",
  }, kind);
}

function favoriteKeyOf(item) {
  return `${item?.sourceId || sourceId.value || ""}:${item?.kind || "item"}:${item?.id || item?.itemId || ""}`;
}

async function loadHomeExtras() {
  if (!deviceToken.value) { homeFavorites.value = []; homeContinueWatching.value = []; return; }
  const [favResult, contResult] = await Promise.allSettled([
    request("/api/favorites", { cache: "no-store" }),
    request("/api/streaming-history/continue-watching?limit=20", { cache: "no-store" }),
  ]);
  const favItems = favResult.status === "fulfilled" ? favResult.value.items || [] : [];
  homeFavoriteKeys.value = new Set(favItems.map(favoriteKeyOf));
  homeFavorites.value = favItems.map(homeExtraItem).filter(Boolean);
  const contItems = contResult.status === "fulfilled" ? contResult.value.items || [] : [];
  homeContinueWatching.value = contItems.map(homeExtraItem).filter(Boolean);
}

// The player's favourite button acts on a series episode's SERIES, never the
// single episode - the button just happens to live in the episode player.
function favoriteTargetOf(item) {
  if (item?.kind === "series" && item.isEpisode && item.seriesId) {
    return {
      id: String(item.seriesId),
      kind: "series",
      sourceId: item.sourceId || "",
      title: item.seriesTitle
        || (selectedSeries.value?.id === item.seriesId ? selectedSeries.value.title : "")
        || String(item.title || "").split(" · ")[0]
        || "",
      logo: selectedSeries.value?.logo || item.logo || "",
      category: item.category || "",
    };
  }
  return item;
}

function isHomeFavorite(item) {
  return homeFavoriteKeys.value.has(favoriteKeyOf(favoriteTargetOf(item)));
}

async function toggleHomeFavorite(rawItem) {
  const item = favoriteTargetOf(rawItem);
  if (!item?.id || !item?.kind) return;
  const key = favoriteKeyOf(item);
  const next = new Set(homeFavoriteKeys.value);
  const wasFavorite = next.has(key);
  if (wasFavorite) next.delete(key); else next.add(key);
  homeFavoriteKeys.value = next;
  if (wasFavorite) homeFavorites.value = homeFavorites.value.filter(entry => favoriteKeyOf(entry) !== key);
  else if (!homeFavorites.value.some(entry => favoriteKeyOf(entry) === key)) homeFavorites.value = [item, ...homeFavorites.value];
  try {
    await request("/api/favorites/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: item.id, title: item.title || "", kind: item.kind,
        sourceId: item.sourceId || "", logo: item.logo || "",
        category: item.category || item.categoryId || "", extension: item.extension || "",
        favorite: !wasFavorite,
      }),
    });
  } catch (error) {
    homeFavoriteKeys.value = wasFavorite ? new Set([...homeFavoriteKeys.value, key]) : (() => { const s = new Set(homeFavoriteKeys.value); s.delete(key); return s; })();
    messageType.value = "error";
    message.value = error.message || "Could not update favorites.";
    void loadHomeExtras();
  }
}

const homeRails = computed(() => {
  const rails = [];
  // Every rail on Welcome is scoped to the selected provider (the account +
  // profile scoping is already done server-side by the device token).
  const currentSource = String(sourceId.value || "");
  const forProvider = list => currentSource ? list.filter(entry => String(entry?.sourceId || "") === currentSource) : list;
  const favorites = forProvider(homeFavorites.value);
  const continueWatching = forProvider(homeContinueWatching.value);
  if (favorites.length) rails.push({ id: "favorites", eyebrow: "FAVORITES", title: "Your favorites", items: favorites });
  if (continueWatching.length) rails.push({ id: "continue", eyebrow: "CONTINUE WATCHING", title: "Jump back in", items: continueWatching });
  for (const rail of [{ kind: "series", label: "New series" }, { kind: "movie", label: "New movies" }, { kind: "channel", label: "New live channels" }]) {
    const items = welcomeProviderItems.value[rail.kind] || [];
    if (items.length) rails.push({ id: `new-${rail.kind}`, eyebrow: rail.label.toUpperCase(), title: rail.label, items });
  }
  return rails;
});
const homeHeroItem = computed(() => homeRails.value.flatMap(rail => rail.items || [])[0] || null);

async function loadHomeData(force = false) {
  if (!deviceToken.value) return;
  void loadHomeExtras();
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

// Watch with Partner: always-on long-poll for an invite arriving from the
// partner set in Settings, mirroring watchLibraryRevision exactly.
async function watchPartnerInvite() {
  if (!deviceToken.value || partnerInviteController) return;
  partnerInviteController = new AbortController();
  const controller = partnerInviteController;
  try {
    const data = await request(`/api/partner/invite?since=${partnerInviteRevision}`, { cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted) return;
    const nextRevision = Number(data.revision) || 1;
    const changed = partnerInviteRevision > 0 && nextRevision !== partnerInviteRevision;
    partnerInviteRevision = nextRevision;
    partnerInviteController = null;
    if (changed && data.invite) pendingPartnerInvite.value = data.invite;
    watchPartnerInvite();
  } catch (error) {
    if (partnerInviteController === controller) partnerInviteController = null;
    if (error.name !== "AbortError") partnerInviteRetryTimer = window.setTimeout(watchPartnerInvite, 1500);
  }
}

// Watch with Partner: while a session is active, long-poll roku_backend
// directly (not library_backend) for the other participant's seek/quality
// change, and follow it - whoever acts moves both, always exactly one shared
// job. Skipped as a no-op "stale echo" when the incoming state already
// matches what we're doing (our own action just caused this same bump).
async function watchWwpSync() {
  if (!webWwpSessionId.value || wwpSyncController) return;
  const sessionId = webWwpSessionId.value;
  wwpSyncController = new AbortController();
  const controller = wwpSyncController;
  try {
    const url = new URL(`${browserStreamer}/api/xtream/wwp-sync/${encodeURIComponent(sessionId)}`);
    url.searchParams.set("since", wwpSyncToken);
    // Both credentials - see sendWwpControl. The host's 5-minute stream ticket
    // must not be the only key or their follow-the-partner sync dies at 5 min.
    if (deviceToken.value) url.searchParams.set("deviceToken", deviceToken.value);
    if (webStreamTicket.value) url.searchParams.set("streamTicket", webStreamTicket.value);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (controller.signal.aborted || webWwpSessionId.value !== sessionId) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Watch with Partner sync failed");
    wwpSyncController = null;
    // The other partner closed their player - close ours too.
    if (data.ended === true) { wwpRemoteEnded = true; closeWebPlayer(); return; }
    const nextRevision = Number(data.revision) || 0;
    const nextControlRevision = Number(data.controlRevision) || 0;
    const firstPoll = wwpSyncToken === "";
    const seekChanged = !firstPoll && nextRevision !== wwpKnownRevision;
    // Also honour a paused partner on our very first poll (we joined while they
    // were already paused), so we do not start playing out of sync.
    const controlChanged = firstPoll ? data.paused === true : nextControlRevision !== wwpKnownControlRevision;
    wwpKnownRevision = nextRevision;
    wwpKnownControlRevision = nextControlRevision;
    wwpSyncToken = String(data.token || `${nextRevision}.${nextControlRevision}`);
    // Frame-lock: track the host's clock + last known position for the follower.
    wwpClockOffset = (Number(data.serverNow) || Date.now()) - Date.now();
    if (webIsWwpGuest.value && Number.isFinite(Number(data.controlAt))) {
      wwpHostState = {
        posMs: Number(data.controlPositionMs) || 0,
        atServerMs: Number(data.controlAt) || Date.now(),
        paused: data.paused === true,
      };
    }
    startWwpFollowing();
    // Voice call: a non-empty callRing while we are not already in the call
    // means the partner tapped "Start call".
    webCallIncoming.value = Boolean(data.callRing) && !webCallActive.value;
    if (webNowPlaying.value) {
      // Re-anchor the displayed position to the shared job's real -ss. Both
      // participants request their own (0.1s-different) start and the server
      // snaps them onto one job; data.start is that authoritative offset. Only
      // adjust for a small settled gap - a big one is a genuine seek handled
      // below, and mid-restart we leave it alone.
      const anchor = Math.max(0, Number(data.start) || 0);
      const anchorGap = anchor - webPlaybackOffset.value;
      if (!seekChanged && !wwpApplyingRemote && Math.abs(anchorGap) > 1.5 && Math.abs(anchorGap) < 25) {
        webPlaybackOffset.value = anchor;
        webCurrentTime.value = Math.max(0, webCurrentTime.value + anchorGap);
        webBufferedTime.value = Math.max(webBufferedTime.value + anchorGap, webCurrentTime.value);
      }
      if (seekChanged) {
        const incomingStart = Math.max(0, Number(data.start) || 0);
        // Compare against the LAST job -ss we saw, not our drifting playback
        // position - otherwise every revision bump yanks us back by however
        // long we have been watching since.
        const startMoved = wwpLastSeenStart < 0 || Math.abs(incomingStart - wwpLastSeenStart) > 1;
        wwpLastSeenStart = incomingStart;
        if (startMoved) {
          await restartWebAt(incomingStart);
        }
      }
      if (controlChanged) await applyRemoteWwpControl(data);
    }
    watchWwpSync();
  } catch (error) {
    if (wwpSyncController === controller) wwpSyncController = null;
    if (error.name !== "AbortError" && webWwpSessionId.value === sessionId) wwpSyncRetryTimer = window.setTimeout(watchWwpSync, 1500);
  }
}

// Host: broadcast our position every 3s. Guest: converge onto the host's
// position every 2s (extrapolated from the last wwp-sync). Neither ever blocks
// the other, so there is no deadlock path.
function startWwpFollowing() {
  if (!webWwpSessionId.value) return;
  if (webIsWwpGuest.value) {
    if (!wwpFollowTimer) wwpFollowTimer = window.setInterval(followWwpHost, 2000);
  } else if (!wwpHostBeatTimer) {
    wwpHostBeatTimer = window.setInterval(() => {
      if (webWwpSessionId.value && !webIsWwpGuest.value) sendWwpControl(Boolean(webVideo.value?.paused));
    }, 3000);
  }
}
function stopWwpFollowing() {
  if (wwpHostBeatTimer) { window.clearInterval(wwpHostBeatTimer); wwpHostBeatTimer = null; }
  if (wwpFollowTimer) { window.clearInterval(wwpFollowTimer); wwpFollowTimer = null; }
  wwpHostState = null; wwpClockOffset = 0; wwpUserPaused = false;
  const video = webVideo.value;
  if (video && video.playbackRate !== 1) video.playbackRate = 1;
}
function followWwpHost() {
  const video = webVideo.value;
  if (!webIsWwpGuest.value || !video || !webNowPlaying.value || !wwpHostState) return;
  if (wwpApplyingRemote || webSeekTimer || webBuffering.value || webPlayerError.value) return;
  if (wwpHostState.paused) {
    if (!video.paused) { wwpApplyingRemote = true; video.pause(); webPlaying.value = false; setTimeout(() => { wwpApplyingRemote = false; }, 300); }
    return;
  }
  if (video.paused) {
    if (!wwpUserPaused) startWebPlayback(video).catch(() => {});
    return;
  }
  const serverNow = Date.now() + wwpClockOffset;
  const expected = wwpHostState.posMs / 1000 + Math.max(0, serverNow - wwpHostState.atServerMs) / 1000;
  const drift = (webPlaybackOffset.value + (video.currentTime || 0)) - expected;   // >0 = guest ahead
  const abs = Math.abs(drift);
  if (abs > 1.5 && Date.now() - wwpLastFollowSeek > 3500) {
    wwpLastFollowSeek = Date.now();
    try { video.currentTime = Math.max(0, (video.currentTime || 0) - drift); } catch { /* not seekable yet */ }
    video.playbackRate = 1;
  } else if (abs > 0.35) {
    video.playbackRate = drift > 0 ? 0.93 : 1.07;
  } else if (video.playbackRate !== 1) {
    video.playbackRate = 1;
  }
}

function stopWwpSync() {
  endWebCall();
  stopWwpFollowing();
  webCallIncoming.value = false;
  webWwpSessionId.value = "";
  webIsWwpGuest.value = false;
  wwpSyncToken = "";
  wwpKnownRevision = 0;
  wwpKnownControlRevision = 0;
  wwpLastSeenStart = -1;
  if (wwpSyncController) { wwpSyncController.abort(); wwpSyncController = null; }
  if (wwpSyncRetryTimer) { clearTimeout(wwpSyncRetryTimer); wwpSyncRetryTimer = null; }
}

// Watch with Partner voice call. The RTCPeerConnection lives in the iframe
// (webCallUrl); here we just show/hide it and answer the ring.
function startWebCall() {
  if (!webWwpSessionId.value || webCallActive.value) return;
  webPartnerMenuOpen.value = false;
  webCallRole.value = "caller";
  webCallIncoming.value = false;
  webCallActive.value = true;
}
function answerWebCall() {
  if (!webWwpSessionId.value) return;
  webCallRole.value = "callee";
  webCallIncoming.value = false;
  webCallActive.value = true;
}
function declineWebCall() {
  webCallIncoming.value = false;
  const sessionId = webWwpSessionId.value;
  if (!sessionId) return;
  const token = webStreamTicket.value || deviceToken.value || "";
  fetch(`${browserStreamer}/api/xtream/wwp-call/${encodeURIComponent(sessionId)}/ring?ringing=0&streamTicket=${encodeURIComponent(token)}&deviceToken=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => {});
}
function endWebCall() {
  if (!webCallActive.value) return;
  try { webCallFrame.value?.contentWindow?.postMessage({ wwpCall: "hangup" }, "*"); } catch { /* iframe gone */ }
  webCallActive.value = false;
}
function onWwpCallMessage(event) {
  if (event?.data?.wwpCall === "ended") webCallActive.value = false;
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
  sourceListRequestCount += 1;
  sourceListLoading.value = true;
  try {
    const data = await request("/api/xtream/sources");
    sources.value = data.items || [];
    sourceId.value = sources.value.some(item => item.id === preferred) ? preferred : (sources.value[0]?.id || "");
    const source = sources.value.find(item => item.id === sourceId.value);
    selectedKeys.value = [];
    savedItems.value = (source?.enabledItems || []).map(hydrateCachedItem);
    archivedItems.value = (source?.archivedItems || []).map(hydrateCachedItem);
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
    if (safariPage.value === "welcome") await loadWelcomeProvider(source);
    else if (safariPage.value === "playlist") loadWelcomeProvider(source); // fills the tab counters without delaying the list
  } finally {
    sourceListRequestCount = Math.max(0, sourceListRequestCount - 1);
    sourceListLoading.value = sourceListRequestCount > 0;
  }
}

async function saveSource() {
  busy.value = true;
  messageType.value = "info";
  message.value = editing.value ? "Saving playlist changes…" : "Saving playlist…";
  try {
    const isEditing = Boolean(editing.value);
    const data = await request(isEditing ? `/api/xtream/sources/${encodeURIComponent(editing.value)}` : "/api/xtream/sources", {
      method: isEditing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.value, type: sourceType.value, url: url.value, username: sourceUsername.value, password: sourcePassword.value }),
    });
    name.value = "";
    url.value = "";
    sourceType.value = "xtream";
    sourceUsername.value = "";
    sourcePassword.value = "";
    editing.value = null;
    await loadSources(data.id, { loadPlaylist: false });
    await loadPlaylistHealth();
    messageType.value = "success";
    message.value = data.warning || "Playlist saved.";
  } catch (error) {
    messageType.value = "error";
    message.value = error.message || "The playlist could not be saved.";
  } finally {
    busy.value = false;
  }
}

function editSource(source) {
  editing.value = source.id;
  name.value = source.name || "";
  sourceType.value = source.type || "xtream";
  url.value = source.endpoint || "";
  sourceUsername.value = "";
  sourcePassword.value = "";
}

function cancelEdit() {
  editing.value = null;
  name.value = "";
  url.value = "";
  sourceType.value = "xtream";
  sourceUsername.value = "";
  sourcePassword.value = "";
}

async function deleteSource(source) {
  if (!window.confirm(`Delete “${source.name}”?`)) return;
  busy.value = true;
  try {
    await request(`/api/xtream/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
    if (editing.value === source.id) cancelEdit();
    await loadSources(sources.value.find(item => item.id !== source.id)?.id || "", { loadPlaylist: false });
    await loadPlaylistHealth();
    messageType.value = "success";
    message.value = `Deleted “${source.name}”.`;
  } catch (error) {
    messageType.value = "error";
    message.value = error.message || "The playlist could not be deleted.";
  } finally {
    busy.value = false;
  }
}

function playlistConnectionStatus(source) {
  return playlistHealthBySource.value[source.id]?.status || source.connectionStatus || "unknown";
}

function playlistConnectionLabel(source) {
  return ({ online: "Connected", offline: "Offline", checking: "Checking…" })[playlistConnectionStatus(source)] || "Unknown";
}

function playlistConnectionTitle(source) {
  const health = playlistHealthBySource.value[source.id];
  if (health?.status === "offline" && health.error) return health.error;
  if (!health && source.connectionMessage) return source.connectionMessage;
  return `${source.name}: ${playlistConnectionLabel(source)}`;
}

async function loadPlaylistHealth() {
  const requestId = ++playlistHealthRequestId;
  playlistHealthBySource.value = Object.fromEntries(sources.value.map(source => [source.id, { status: "checking" }]));
  try {
    const data = await request("/api/playlist-health?refresh=1", { cache: "no-store" });
    if (requestId !== playlistHealthRequestId) return;
    playlistHealthBySource.value = Object.fromEntries((data.results || []).map(result => [result.sourceId, {
      status: result.ok ? "online" : "offline",
      error: result.error || "",
    }]));
  } catch (error) {
    if (requestId !== playlistHealthRequestId) return;
    playlistHealthBySource.value = Object.fromEntries(sources.value.map(source => [source.id, {
      status: "offline",
      error: error.message || "Could not check this playlist.",
    }]));
  }
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

const favorites = ref([]);
const favoritesLoading = ref(false);
async function loadFavorites() {
  favoritesLoading.value = true;
  try {
    const data = await request("/api/favorites");
    favorites.value = Array.isArray(data?.items) ? data.items : [];
  } catch {
    favorites.value = [];
  } finally {
    favoritesLoading.value = false;
  }
}
async function removeFavorite(item) {
  try {
    await request("/api/favorites/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, kind: item.kind, sourceId: item.sourceId, favorite: false }),
    });
    favorites.value = favorites.value.filter(entry => entry.id !== item.id);
  } catch { /* leave the item in place if the server rejects the removal */ }
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
  if (reset && !categories.value.length) void loadPlaylistCategories();
  const requestedSourceId = sourceId.value;
  const requestedKind = kind.value;
  const normalizedQuery = normalizeSearchText(query.value);
  const requestedPage = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  message.value = "";
  try {
  const params = new URLSearchParams({ sourceId: requestedSourceId, kind: requestedKind, category: category.value, titleLanguage: titleLanguage.value, q: normalizedQuery, page: String(requestedPage), limit: String(playlistRequestSize) });
    // Keep catalog pages across reloads and reopened tabs. The account/source
    // identity is part of the key, so one account cannot reuse another one's
    // catalog entries.
    const browserCacheKey = `rh-catalog:v5:${requestedSourceId}:${requestedKind}:${category.value}:${titleLanguage.value}:${normalizedQuery}:${requestedPage}`;
    let data;
    try {
      const cached = window.localStorage.getItem(browserCacheKey);
      data = cached ? JSON.parse(cached) : null;
    } catch { data = null; }
    if (!data || !Array.isArray(data.items)) {
      data = await request(`/api/xtream/catalog?${params}`, { signal: catalogController.signal });
      try { window.localStorage.setItem(browserCacheKey, JSON.stringify(data)); } catch { /* cache is optional */ }
    }
    if (requestId !== catalogRequestId || requestedSourceId !== sourceId.value || requestedKind !== kind.value) return;
    const nextItems = data.items || [];
    if (data.stale) {
      message.value = "Showing the last saved provider catalog. It may be out of date.";
      messageType.value = "warning";
    }
    const mergedItems = reset ? nextItems : [...items.value, ...nextItems.filter(item => !items.value.some(existing => existing.key === item.key))];
    items.value = mergedItems.sort(compareCatalogTitles);
    rememberItems(nextItems);
    if (Array.isArray(data.categories) && data.categories.length) categories.value = data.categories;
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

async function loadPlaylistCategories() {
  if (!sourceId.value) { categories.value = []; return; }
  const requestedSource = sourceId.value;
  const requestedKind = kind.value;
  try {
    const data = await request(`/api/xtream/categories?sourceId=${encodeURIComponent(requestedSource)}&kind=${requestedKind}`, { cache: "no-store" });
    if (requestedSource === sourceId.value && requestedKind === kind.value) categories.value = data.categories || [];
  } catch { categories.value = []; }
}

async function chooseCategory(id) {
  category.value = id || "all";
  await loadCatalog();
}

async function loadSaved() {
  const data = await request(`/api/xtream/sources/${sourceId.value}/enabled`);
  applySource(data.source);
  savedItems.value = data.items || [];
}

async function chooseSource(id) { sourceId.value = id; category.value = "all"; titleLanguage.value = "all"; loadPlaylistCategories(); await loadSources(id); }
async function deleteCurrentSource() {
  const current = sources.value.find(item => item.id === sourceId.value);
  if (!current) return;
  if (!window.confirm(`Delete source “${current.name}”? This removes its catalog and Roku selections.`)) return;
  busy.value = true;
  try {
    await request(`/api/xtream/sources/${encodeURIComponent(current.id)}`, { method: "DELETE" });
    stopPlaylistPreview({ clearSelection: true });
    await loadSources(sources.value.find(item => item.id !== current.id)?.id || "");
    messageType.value = "info";
    message.value = `Deleted ${current.name}.`;
  } catch (error) {
    messageType.value = "error";
    message.value = error?.message || "The source could not be deleted.";
  } finally {
    busy.value = false;
  }
}
async function chooseKind(value) { if (kind.value === value && items.value.length) return; kind.value = value; category.value = "all"; titleLanguage.value = "all"; query.value = ""; loadPlaylistCategories(); await loadCatalog(); }
function toggle(item) { if (savedKeys.value.has(item.key)) return; rememberItems([item]); selectedKeys.value = selectedKeys.value.includes(item.key) ? selectedKeys.value.filter(key => key !== item.key) : [...selectedKeys.value, item.key]; }

let searchTimer;
let deviceStatusTimer;
watch(safariPage, value => window.localStorage.setItem("rh-safari-page", value === "episodes" ? "series" : value));
watch(safariLibraryTab, value => window.localStorage.setItem("rh-safari-library-tab", value));
watch(safariPage, value => {
  if (!deviceToken.value) return;
  if (value === "watchlater") { loadFavorites(); return; }
  if (value === "playlist") loadPlaylistCategories();
  // Welcome needs its provider rails refreshed too - loadSources() fans out to
  // loadManagedLibrary() + loadWelcomeProvider() when the Welcome page is open,
  // so navigating back to Welcome always repopulates it.
  const pageRequest = value === "playlist"
    ? loadSources()
    : (value === "settings" || value === "welcome")
      ? loadSources(sourceId.value, { loadPlaylist: false })
      : loadManagedLibrary();
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
  document.addEventListener("click", closeCardActionsOnOutsideClick);
  window.addEventListener("popstate", enforceProfileSelection);
  window.addEventListener("pageshow", blurRestoredLoginFocus);
  window.addEventListener("message", onWwpCallMessage);
  if (!legalPage.value && window.location.pathname === "/") {
    window.history.replaceState({ appPage: "welcome" }, "", `/home${window.location.search}${window.location.hash}`);
  }
  if (pairing.value) {
    blurRestoredLoginFocus();
    window.setTimeout(blurRestoredLoginFocus, 0);
    // Safari may restore the last focused form control after the first paint.
    // Repeat the blur after its restoration pass so reload opens unfocused.
    window.setTimeout(blurRestoredLoginFocus, 80);
    window.setTimeout(blurRestoredLoginFocus, 300);
    window.setTimeout(blurRestoredLoginFocus, 700);
  }
  try {
    // Roku Settings' "Browser auto log in" QR lands here with ?pair=<code>.
    // The Roku already proved account ownership when it minted the code, so
    // scanning it is treated as sufficient proof here too - no password.
    const pairCode = new URLSearchParams(window.location.search).get("pair");
    if (pairCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("pair");
      window.history.replaceState({}, "", url);
      // Always claim, even when this browser is already signed in or waiting on
      // a profile choice: scanning must switch it to the Roku's account and
      // profile. A failed claim (expired code) leaves the existing session alone.
      try {
        const claim = await request("/api/device-session/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode }) });
        if (claim?.token) {
          window.localStorage.setItem("rh-device-token", claim.token);
          deviceToken.value = claim.token;
          browserRealm.value = tokenRealm(claim.token);
          window.localStorage.setItem("rh-browser-realm", browserRealm.value);
          pairing.value = false;
          // The claim token is already scoped to the Roku's profile. Adopt it so
          // the "Who's watching?" chooser is skipped and the active profile
          // matches the token instead of a stale rh-profile-id.
          window.sessionStorage.removeItem(profileSelectionKey);
          const paired = await request("/api/account/profile").catch(() => null);
          if (paired?.item?.id) window.localStorage.setItem("rh-profile-id", paired.item.id);
          else window.localStorage.removeItem("rh-profile-id");
          activeProfileId.value = paired?.item?.id || "";
          safariPage.value = "settings";
          window.history.replaceState({ appPage: "settings" }, "", "/settings");
        }
      } catch (error) {
        messageType.value = "error";
        message.value = error.message;
      }
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
    profiles.value = (await request("/api/account/profiles")).items || [];
    const currentProfile = await request("/api/account/profile").catch(() => null);
    if (!currentProfile?.item) {
      pairing.value = false;
      profileChooser.value = true;
      appReady.value = false;
      return;
    }
    // Only the health check and the provider catalog gate the boot loader.
    // Everything else enriches an already usable page and loads in the
    // background so a slow response cannot keep the spinner on screen.
    await Promise.all([request("/api/health"), loadSources(sourceId.value, { loadPlaylist: false })]);
    online.value = true;
    appReady.value = true;
    if (initialRoute.page === "episodes") void syncPageFromLocation();
    void Promise.all([loadWeatherSettings(), sendBrowserHeartbeat(), loadPartnerSettings()]).catch(() => {});
    void request("/api/account/profiles").then(data => {
      profiles.value = data.items || [];
      if (!activeProfileId.value && activeProfile.value) { activeProfileId.value = activeProfile.value.id; window.localStorage.setItem("rh-profile-id", activeProfileId.value); }
    }).catch(() => {});
    void loadHomeData();
    if (safariPage.value === "watchlater") void loadFavorites();
    // Warm the lazy HLS.js chunk (~185 KB gzip) while the catalog renders, so
    // the first Play does not wait on that download over the slow tunnel.
    void loadHlsConstructor().catch(() => {});
    if (safariPage.value === "playlist") loadSources().catch(error => {
      messageType.value = "error";
      message.value = error.message;
    });
    watchLibraryRevision();
    watchPartnerInvite();
    deviceStatusTimer = window.setInterval(() => {
      if (!pairing.value && deviceToken.value) { sendBrowserHeartbeat(); loadPartnerSettings().catch(() => {}); }
    }, 10_000);
  } catch (error) { online.value = false; messageType.value = "error"; message.value = error.message; appReady.value = true; }
});
</script>

<template>
  <main class="shell" :class="{ 'safari-app-mode': browserApp && !legalPage, 'login-shell': pairing && !legalPage, 'legal-shell': legalPage }">
    <section v-if="legalPage" class="legal-page" :aria-labelledby="`${legalPage}-title`">
      <div class="legal-page-inner">
        <a class="legal-brand" href="/" aria-label="RH IPTV Player home"><span class="legal-brand-mark">RH</span><span>IPTV PLAYER</span></a>
        <p class="legal-eyebrow">RH IPTV PLAYER</p>
        <h1 :id="`${legalPage}-title`">{{ legalPage === 'terms' ? 'Terms of use' : legalPage === 'delete-account' ? 'Delete your account' : (legalPage === 'android-privacy' ? 'Android privacy policy' : 'Privacy policy') }}</h1>
        <p class="legal-updated">Effective September 11, 2026</p>
        <template v-if="legalPage === 'delete-account'">
          <p>You can permanently delete your RH IPTV Player account, profiles, library, favourites, and playback history at any time, from a browser or the app - no need to keep it installed.</p>
          <h2>Delete it yourself (immediate)</h2>
          <p>1. Sign in at <a :href="browserOrigin">{{ browserOrigin }}</a> (or open the app) with your account email and password.<br>2. Go to <strong>Settings &rarr; Delete account</strong>.<br>3. Confirm with your password. Your account and all associated data are deleted immediately - this cannot be undone.</p>
          <h2>Can't sign in? Request deletion by email</h2>
          <p>Email <a href="mailto:rudyhamameca@gmail.com?subject=Delete%20my%20RH%20IPTV%20Player%20account">rudyhamameca@gmail.com</a> from the address on your account and we will delete it for you, usually within a few days.</p>
          <h2>What gets deleted</h2>
          <p>Your account credentials, profiles, linked devices, favourites, watch history and resume positions, and any Watch-with-Partner pairing are all permanently removed. Provider/playlist credentials you connected are deleted along with the account, not retained separately.</p>
          <h2>Delete only some of your data</h2>
          <p>You don't have to delete your whole account to remove specific data. From the app or <a :href="browserOrigin">{{ browserOrigin }}</a> you can: remove individual titles from Favourites or your Library, and delete a connected playlist/provider (Settings &rarr; Sources) to erase its catalogue and credentials while keeping the rest of your account.</p>
        </template>
        <template v-else-if="legalPage === 'privacy' || legalPage === 'android-privacy'">
          <p v-if="legalPage === 'android-privacy'">RH IPTV Player for Android is a personal streaming library that lets you connect an authorised provider, organise content by profile, and continue watching across linked devices. This policy explains what information the Android app uses and how it is protected.</p>
          <p v-else>RH IPTV Player is a personal streaming library that lets you connect an authorised provider, organise content by profile, and continue watching across linked devices. This policy explains what information we use to provide those features.</p>
          <h2>Information we collect</h2>
          <p>We collect your email address and password when you create an account, profile names and preferences you choose, linked-device and pairing information, favourites, playback history, and resume positions. Provider credentials and catalogue data are used only to connect your authorised playlist and deliver requested media.</p>
          <h2>How we use information</h2>
          <p>We use this information to authenticate you, keep your library isolated to your account and profiles, synchronise playback and favourites, operate subscriptions, prevent abuse, and provide support. We do not sell personal information or use it for third-party advertising.</p>
          <h2>Sharing and retention</h2>
          <p>Information is shared only with the service providers needed to host the app, store account data, process Roku subscriptions, and deliver media you request. We retain account data while your account is active or as needed for security and legal obligations. You may <a href="/delete-account">delete your account and all associated data</a> at any time.</p>
          <h2>Security and your choices</h2>
          <p>We use authenticated connections and scoped account access. You are responsible for keeping your password and provider credentials private. You can update profile data or <a href="/delete-account">delete your account</a> at any time.</p>
          <h2>Contact</h2>
          <p>Questions or privacy requests: <a href="mailto:rudyhamameca@gmail.com">rudyhamameca@gmail.com</a>.</p>
        </template>
        <template v-else>
          <p>These Terms govern your use of RH IPTV Player. By creating an account, linking a Roku device, or using the service, you agree to these Terms.</p>
          <h2>Eligibility and accounts</h2>
          <p>You must provide accurate information and keep your account secure. You are responsible for activity under your account and for ensuring that anyone using a linked profile is authorised by you.</p>
          <h2>Authorised content and providers</h2>
          <p>RH IPTV Player is a software client and library manager. You may connect only playlists and media sources that you are legally entitled to access. We do not provide or endorse unauthorised content, and availability depends on the provider you choose.</p>
          <h2>Subscriptions and payments</h2>
          <p>Any paid plan, price, billing period, renewal, cancellation, and refund terms are shown at purchase through Roku Pay. Subscriptions are processed by Roku and are subject to Roku’s payment terms. Cancelling stops future renewals; access continues through the paid period unless otherwise stated.</p>
          <h2>Acceptable use</h2>
          <p>Do not bypass authentication, share access in a way that violates your provider’s terms, interfere with the service, or use it for unlawful purposes. We may suspend access when necessary to protect users or the service.</p>
          <h2>Availability and liability</h2>
          <p>The service is provided as available. Provider outages, network conditions, device limitations, and catalogue changes may affect playback. To the extent permitted by law, RH IPTV Player is not liable for indirect losses arising from those conditions.</p>
          <h2>Contact</h2>
          <p>Support: <a href="mailto:rudyhamameca@gmail.com">rudyhamameca@gmail.com</a>.</p>
        </template>
        <nav class="legal-links" aria-label="Legal navigation"><a href="/privacy">Privacy policy</a><a href="/android/privacy">Android privacy policy</a><a href="/terms">Terms of use</a><a href="/delete-account">Delete account</a><a href="/">Back to RH IPTV Player</a></nav>
      </div>
    </section>
    <div v-if="!legalPage" class="app-content">
    <div v-if="pendingPartnerInvite" class="partner-invite-banner" role="alert"><img v-if="pendingPartnerInvite.hostAvatar" :src="pendingPartnerInvite.hostAvatar" alt="" class="partner-invite-avatar"><p><strong>{{ pendingPartnerInvite.hostName }}</strong> invited you to watch <strong>{{ pendingPartnerInvite.title || 'something' }}</strong> together.</p><div><button type="button" class="primary-action" @click="joinPartnerInvite(pendingPartnerInvite)">Join</button><button type="button" @click="pendingPartnerInvite = null">Dismiss</button></div></div>
    <section v-if="pairing" class="rh-auth">
      <div class="rh-auth-inner">
        <div class="rh-auth-brand" aria-label="RH IPTV PLAYER"><img src="/login/rh-snow-logo.png" alt="RH"><span>IPTV PLAYER</span></div>
        <div class="rh-auth-card">
          <div v-if="!isPairingSignup" class="rh-auth-tabs" role="tablist" aria-label="Account type">
            <button type="button" role="tab" :aria-selected="browserRealm === 'general'" :class="{ active: browserRealm === 'general' }" @click="chooseBrowserRealm('general')">General</button>
            <button type="button" role="tab" :aria-selected="browserRealm === 'roku'" :class="{ active: browserRealm === 'roku' }" @click="chooseBrowserRealm('roku')">Roku</button>
          </div>
          <h1>{{ isPairingSignup ? 'Create your account' : 'Welcome back' }}</h1>
          <p class="rh-auth-sub">{{ isPairingSignup ? (signupVerificationId ? 'Enter the code from your email, then choose a password.' : 'Enter your email to receive a verification code.') : (browserRealm === 'roku' ? 'Sign in with the account you created on your Roku.' : 'Sign in to access your library.') }}</p>
          <form v-if="!isPairingSignup" novalidate @submit.prevent="signIn">
            <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <label>Password<input v-model="pairingPassword" type="password" minlength="8" required autocomplete="current-password" placeholder="Your password"></label>
            <button type="submit" class="rh-auth-primary" :disabled="authBusy"><span v-if="authBusy" class="login-spinner" aria-hidden="true"></span><span>Sign in</span></button>
          </form>
          <form v-else novalidate @submit.prevent="signupVerificationId ? signUp($event) : requestSignupCode($event)">
            <label>Email address<input v-model="pairingEmail" type="email" required autocomplete="email" placeholder="you@example.com"></label>
            <template v-if="signupVerificationId">
              <label>Verification code<input v-model="signupVerificationCode" class="rh-auth-code" type="text" inputmode="numeric" autocomplete="one-time-code" required placeholder="000000"></label>
              <label>Password<input v-model="pairingPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters"></label>
              <label>Confirm password<input v-model="pairingPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password" placeholder="Repeat password"></label>
            </template>
            <button type="submit" class="rh-auth-primary" :disabled="authBusy"><span v-if="authBusy" class="login-spinner" aria-hidden="true"></span><span>{{ signupVerificationId ? 'Create account' : 'Send verification code' }}</span></button>
          </form>
          <p class="rh-auth-switch">
            <template v-if="!isPairingSignup">New here? <button type="button" @click="beginSignup">Create an account</button></template>
            <template v-else>Already have an account? <button type="button" @click="beginLogin">Sign in</button></template>
          </p>
        </div>
        <div v-if="!isPairingSignup" class="rh-auth-badges">
          <a href="https://play.google.com/store/apps/details?id=com.rhstream.library" @click.prevent="showPlatformDevelopment('Android')" aria-label="Android app still in development"><img src="/login/android-play-banner.png" alt="Also on Android — Get it on Google Play"></a>
          <a href="https://channelstore.roku.com/" @click.prevent="showPlatformDevelopment('Roku')" aria-label="Roku app still in development"><img src="/login/roku-channel-banner.png" alt="Also on Roku Channel Store"></a>
        </div>
      </div>
      <p v-if="message" role="status" :class="['xtream-message', `is-${messageType}`]">{{ message }}</p>
    </section>
    <section v-else-if="profileChooser" class="profile-chooser-page">
      <div class="profile-chooser-inner">
        <p class="eyebrow">RH LIBRARY</p>
        <h1>Who's watching?</h1>
        <p class="profile-chooser-copy">{{ profiles.length ? 'Choose a profile to open your personalized library.' : 'Create a profile to start using the library.' }}</p>
        <div class="profile-grid">
          <button v-for="profile in profiles" :key="profile.id" type="button" class="profile-option" :disabled="profileBusy" @click="chooseProfile(profile)">
            <span class="profile-avatar" :class="`profile-avatar-${profile.avatar || 'lime'}`"><img v-if="profile.avatarImage" :src="profile.avatarImage" alt=""><template v-else>{{ profile.name.slice(0, 1).toUpperCase() }}</template></span>
            <strong>{{ profile.name }}</strong>
            <small class="profile-lock-line"><LockKeyholeIcon v-if="profile.hasPin" /><LockKeyholeOpenAltIcon v-else /><span>{{ profile.hasPin ? 'PIN protected' : (profile.isDefault ? 'Main profile' : 'Library profile') }}</span></small>
          </button>
          <button type="button" class="profile-option profile-add-option" :disabled="profileBusy" @click="openProfileCreation">
            <span class="profile-avatar profile-add-avatar" aria-hidden="true">+</span>
            <strong>Add profile</strong>
            <small>Personal library</small>
          </button>
        </div>
        <form v-if="profileCreateOpen" class="profile-create-form" @submit.prevent="createProfile"><label>Profile name <input ref="profileNameInput" v-model="newProfileName" type="text" maxlength="30" required placeholder="Your name"></label><button type="submit" class="primary-action" :disabled="profileBusy || !newProfileName.trim()">Add profile</button></form>
        <p v-if="profileError" class="profile-error" role="alert">{{ profileError }}</p>
        <button type="button" class="logout-button profile-chooser-logout" @click="logout">Log out</button>
      </div>
    </section>
    <template v-else>
    <template v-if="browserApp">
      <div class="home-background" aria-hidden="true"></div>
      <video v-if="homeBackdropUrl && safariPage === 'welcome'" class="home-backdrop-video" :src="homeBackdropUrl" autoplay muted loop playsinline preload="auto" aria-hidden="true" @error="homeBackdropUrl = ''"></video>
      <div class="home-aurora home-aurora-one" aria-hidden="true"></div>
      <div class="home-aurora home-aurora-two" aria-hidden="true"></div>
    </template>
    <section v-if="browserApp" class="browser-app-shell" :class="{ 'nav-open': navOpen }">
      <aside class="browser-sidebar">
        <div class="browser-sidebar-brand"><img class="app-brand-mark" src="/login/rh-snow-logo.png" alt="RH" :style="{visibility: brandLogoReady ? undefined : 'hidden'}"><span class="browser-sidebar-brand-name"><em>IPTV PLAYER</em></span></div>
        <nav aria-label="Main menu"><button v-for="item in safariMenuItems" :key="item.id" type="button" :class="{active:safariPage === item.id}" :aria-label="item.label" :title="item.label" @click="openSafariPage(item.id)"><span class="browser-sidebar-icon"><img v-if="typeof item.icon === 'string'" :src="item.icon" alt=""><component v-else :is="item.icon" /></span><span class="browser-sidebar-label">{{ item.label }}</span></button></nav>
        <button type="button" class="browser-sidebar-logout" aria-label="Log out" title="Log out" @click="logout"><span class="browser-sidebar-icon"><DoorOpenAltIcon /></span><span class="browser-sidebar-label">Log out</span></button>
      </aside>
      <div class="browser-main"><div class="safari-page-shell">
      <article v-if="safariPage === 'welcome'" class="safari-page safari-welcome-page">
        <header class="welcome-page-heading">
          <div><p class="eyebrow">WELCOME</p><h1>Your library,<br><em>ready to watch.</em></h1></div>
          <div class="welcome-identity-cluster" :class="partnerEmail ? (partnerLinked ? (partnerOnline ? 'is-online' : 'is-offline') : 'is-unknown') : ''">
            <template v-if="partnerEmail">
              <button type="button" class="welcome-profile-button" :aria-label="'Watch partner: ' + (partnerName || partnerEmail)" :title="partnerName || partnerEmail" @click="openSafariPage('settings')"><span class="profile-avatar welcome-partner-avatar"><img v-if="partnerAvatar" :src="partnerAvatar" alt=""><template v-else>{{ (partnerName || partnerEmail).slice(0, 1).toUpperCase() }}</template></span></button>
              <button type="button" class="welcome-partner-link" :aria-label="partnerLinked ? ((partnerName || partnerEmail) + (partnerOnline ? ' is online' : ' is offline')) : ('Watch partner not found: ' + partnerEmail)" :title="partnerLinked ? ((partnerName || partnerEmail) + (partnerOnline ? ' · online' : ' · offline')) : ('Watch partner not found: ' + partnerEmail)" @click="openSafariPage('settings')">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M17 7h-3v2h3c1.65 0 3 1.35 3 3s-1.35 3-3 3h-3v2h3c2.76 0 5-2.24 5-5s-2.24-5-5-5M7 17h3v-2H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h3V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5"/><path d="M6 11h12v2H6z"/></svg>
              </button>
            </template>
            <button v-if="activeProfile" type="button" class="welcome-profile-button" aria-label="Change profile" title="Change profile" @click="profileChooser = true"><span class="profile-avatar" :class="`profile-avatar-${activeProfile.avatar || 'lime'}`"><img v-if="activeProfile.avatarImage" :src="activeProfile.avatarImage" alt=""><template v-else>{{ activeProfileFirstName.slice(0, 1).toUpperCase() }}</template></span></button>
          </div>
        </header>

        <section class="welcome-provider-box">
          <div class="welcome-provider-head">
            <div class="welcome-provider-head-text">
              <p class="eyebrow">YOUR PLAYLIST</p>
              <select v-if="sources.length > 1" class="welcome-provider-select" aria-label="Choose playlist provider" :value="sourceId" @change="chooseSource($event.target.value)">
                <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
              </select>
              <h1 v-else>{{ sourceListLoading ? 'Loading playlists…' : (sources.length ? (sources.find(source => source.id === sourceId)?.name || 'Provider') : 'No provider connected') }}</h1>
            </div>
            <div v-if="sources.length" class="welcome-provider-stats" aria-label="Provider catalog totals">
              <div><strong>{{ welcomeCatalogBusy ? '—' : welcomeProviderCounts.series.toLocaleString() }}</strong><span>SERIES</span></div>
              <div><strong>{{ welcomeCatalogBusy ? '—' : welcomeProviderCounts.movie.toLocaleString() }}</strong><span>MOVIES</span></div>
              <div><strong>{{ welcomeCatalogBusy ? '—' : welcomeProviderCounts.channel.toLocaleString() }}</strong><span>LIVE CHANNELS</span></div>
            </div>
          </div>
          <div v-if="!sources.length && !sourceListLoading" class="welcome-provider-empty">No playlist providers are connected yet.</div>
        </section>
        <p v-if="welcomeProviderError" class="home-error" role="status">{{ welcomeProviderError }}</p>

        <p v-else-if="homeError" class="home-error" role="status">{{ homeError }}</p>

        <div v-if="welcomeCatalogBusy" class="welcome-catalog-loading" role="status" aria-live="polite" aria-label="Loading catalog">
          <span class="welcome-catalog-spinner" aria-hidden="true"></span>
          <span>Loading catalog…</span>
        </div>

        <section v-for="(rail, railIndex) in (welcomeCatalogBusy ? [] : homeRails)" :key="rail.id" class="home-rail" :class="`home-rail-${rail.id}`" :style="{ '--tier': railIndex }"><div class="home-rail-inner">
          <header><div><p class="eyebrow">{{ rail.eyebrow }}</p><h2>{{ rail.title }}</h2></div>
          </header>
          <div class="home-rail-body">
          <button type="button" class="home-rail-arrow is-prev" aria-label="Scroll left" @click="scrollHomeRail($event, -1)"><CaretLeftIcon /></button>
          <button type="button" class="home-rail-arrow is-next" aria-label="Scroll right" @click="scrollHomeRail($event, 1)"><CaretLeftIcon /></button>
          <div class="home-rail-track">
            <div v-for="item in rail.items" :key="homeItemKey(item)" class="home-content-card" :class="{ 'is-open': openCardKey === homeItemKey(item) }" @click="toggleCardActions(homeItemKey(item))">
              <span class="home-card-art">
                <img v-if="item.logo && !failedLogoUrls.has(item.logo)" :src="imageUrl(item.logo)" :alt="item.title" loading="lazy" @error="markLogoFailed(item.logo)">
                <span v-else class="home-card-fallback"><b>RH</b><em>{{ item.title }}</em></span>
                <transition name="card-fade">
                  <button v-if="openCardKey === homeItemKey(item)" type="button" class="home-fav-action" :class="{on:isHomeFavorite(item)}" :aria-label="isHomeFavorite(item) ? 'Remove from favorites' : 'Add to favorites'" @click.stop="toggleHomeFavorite(item)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" :fill="isHomeFavorite(item) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="m12 17.3-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z"/></svg>
                  </button>
                </transition>
                <transition name="card-fade">
                  <span v-if="openCardKey === homeItemKey(item)" class="card-actions">
                    <button type="button" class="card-action-btn" aria-label="Play" title="Play" @click.stop="playLibraryItem(item)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
                    <button type="button" class="card-action-btn" :class="{on:welcomeItemEnabled(item)}" :aria-label="welcomeItemEnabled(item) ? 'Remove from library' : 'Add to library'" :title="welcomeItemEnabled(item) ? 'Remove from library' : 'Add to library'" @click.stop="toggleWelcomeItem(item)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path :d="welcomeItemEnabled(item) ? 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' : 'M11 5v6H5v2h6v6h2v-6h6v-2h-6V5z'"/></svg></button>
                  </span>
                </transition>
              </span>
              <strong>{{ item.title }}</strong><small>{{ item.category || typeLabel(item.kind) }}</small>
            </div>
          </div>
          </div>
        </div></section>
        <p v-if="!welcomeCatalogBusy && sources.length && !Object.values(welcomeProviderItems).some(items => items.length)" class="welcome-provider-empty">This provider has no catalog items yet.</p>
      </article>

      <article v-else-if="safariPage === 'playlist'" class="safari-page safari-playlist-page web-playlist-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>Manage playlist</h1></div></div>
        <template v-if="sources.length">
          <div class="playlist-toolbar">
            <div class="playlist-toolbar-left">
            <select v-if="sources.length > 1" class="playlist-provider-select" aria-label="Playlist provider" :value="sourceId" @change="chooseSource($event.target.value)">
              <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
            </select>
            <select class="playlist-category-select" :value="category" aria-label="Playlist category" @change="chooseCategory($event.target.value)">
              <option value="all">All categories</option>
              <option v-for="entry in categories" :key="entry.id" :value="entry.id">{{ entry.name }}{{ entry.count ? ` · ${entry.count}` : '' }}</option>
            </select>
            </div>
            <div class="playlist-tabs" role="tablist">
              <button v-for="option in [{v:'series',l:'Series'},{v:'movie',l:'Movies'},{v:'channel',l:'Live TV'}]" :key="option.v" type="button" role="tab" :aria-selected="kind === option.v" :class="{active:kind === option.v}" @click="chooseKind(option.v)">
                <span>{{ option.l }}</span>
                <em class="playlist-tab-count">{{ kind === option.v ? total.toLocaleString() : (welcomeProviderCounts[option.v] ? welcomeProviderCounts[option.v].toLocaleString() : '—') }}</em>
              </button>
            </div>
            <label class="playlist-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input v-model="query" placeholder="Search this playlist"></label>
          </div>
          <p v-if="!loading && total" class="playlist-result-count">
            <strong>{{ total.toLocaleString() }}</strong> {{ (query || category !== 'all') ? 'matching ' : '' }}{{ typeLabel(kind).toLowerCase() }}{{ total === 1 ? '' : 's' }}
          </p>
          <div v-if="loading" class="browser-playlist-loading" role="status" aria-live="polite"><span class="loading-ring" aria-hidden="true"></span><span>Loading {{ typeLabel(kind).toLowerCase() }}…</span></div>
          <div v-else-if="visibleItems.length" class="playlist-grid" :class="{'is-channel-grid':kind === 'channel'}" @scroll="handlePlaylistScroll">
            <div v-for="item in visibleItems" :key="item.key" class="playlist-card" :class="{enabled:savedKeys.has(item.key), 'is-open': openCardKey === item.key}" @click="toggleCardActions(item.key)">
              <span class="playlist-card-art">
                <img v-if="item.logo && !failedLogoUrls.has(item.logo)" :src="imageUrl(item.logo)" :alt="item.title" loading="lazy" @error="markLogoFailed(item.logo)">
                <span v-else class="playlist-card-fallback" :data-kind="kind"><span class="fallback-mark">RH</span><span class="fallback-name">{{ item.title }}</span><span class="fallback-kind">{{ typeLabel(kind) }}</span></span>
                <transition name="card-fade">
                  <span v-if="openCardKey === item.key" class="card-actions">
                    <button type="button" class="card-action-btn" aria-label="Play" title="Play" @click.stop="playLibraryItem(item)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
                    <button type="button" class="card-action-btn" :class="{on:savedKeys.has(item.key)}" :aria-label="savedKeys.has(item.key) ? 'Remove from library' : 'Add to library'" :title="savedKeys.has(item.key) ? 'Remove from library' : 'Add to library'" @click.stop="toggleWelcomeItem(item)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path :d="savedKeys.has(item.key) ? 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' : 'M11 5v6H5v2h6v6h2v-6h6v-2h-6V5z'"></path></svg></button>
                  </span>
                </transition>
              </span>
              <span class="playlist-card-copy"><strong>{{ item.title }}</strong><small>{{ item.category || 'Uncategorized' }}</small></span>
            </div>
            <div v-if="loadingMore" class="playlist-grid-more">Loading more…</div>
          </div>
          <p v-else class="web-empty">No matching {{ typeLabel(kind).toLowerCase() }} found.</p>
        </template>
      </article>

      <article v-if="safariPage === 'episodes'" class="safari-page safari-episodes-page">
        <header class="ep-hero">
          <button type="button" class="episodes-back" :aria-label="episodesFrom === 'welcome' ? 'Back to Welcome' : 'Back'" :title="episodesFrom === 'welcome' ? 'Back to Welcome' : 'Back'" @click="openSafariPage(episodesFrom)">
            <svg v-if="episodesFrom === 'welcome'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <img v-if="selectedSeries?.logo && !failedLogoUrls.has(selectedSeries.logo)" class="ep-poster" :src="imageUrl(selectedSeries.logo)" alt="" @error="markLogoFailed(selectedSeries.logo)">
          <div class="ep-hero-copy">
            <h1>{{ selectedSeries?.title || 'Series' }}</h1>
            <p v-if="seriesEpisodes.length" class="ep-meta">{{ seriesEpisodeSeasons.length }} {{ seriesEpisodeSeasons.length === 1 ? 'season' : 'seasons' }} · {{ seriesEpisodes.length }} episodes</p>

          </div>
          <button v-if="firstDisplayedEpisode" type="button" class="ep-play-first" @click="playSeriesEpisode(firstDisplayedEpisode)"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>Play {{ selectedSeasonNumber != null ? `S${selectedSeasonNumber} · ` : '' }}E{{ firstDisplayedEpisode.episodeNumber }}</button>
        </header>
        <div v-if="seriesEpisodesLoading" class="home-loading" role="status"><span class="loading-ring"></span><span>Loading episodes…</span></div>
        <p v-else-if="seriesEpisodesError" class="home-error" role="status">{{ seriesEpisodesError }} <button type="button" @click="openSeriesEpisodes(selectedSeries)">Retry</button></p>
        <div v-else-if="seriesEpisodeSeasons.length" class="series-episodes-content">
          <nav class="series-season-selector" aria-label="Select season">
            <button v-for="season in seriesEpisodeSeasons" :key="season.number" type="button" :class="{active:selectedSeasonNumber === season.number}" @click="selectedSeasonNumber = season.number">{{ season.title }}</button>
          </nav>
          <div class="series-seasons">
            <section v-for="season in displayedSeriesEpisodeSeasons" :key="season.number" class="series-season">
              <div class="ep-list">
                <button v-for="episode in season.episodes" :key="episode.key" type="button" class="ep-row" :aria-label="`Play ${episode.title}`" @click="playSeriesEpisode(episode)">
                  <span class="ep-thumb"><img v-if="episode.logo && !failedLogoUrls.has(episode.logo)" :src="imageUrl(episode.logo)" alt="" loading="lazy" @error="markLogoFailed(episode.logo)"><b v-else>{{ episode.episodeNumber }}</b><span class="ep-thumb-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg></span></span>
                  <span class="ep-copy"><strong>{{ episode.title }}</strong><small>Episode {{ episode.episodeNumber }}<template v-if="episode.duration"> · {{ episode.duration }}</template></small></span>
                  <span v-if="episode.extension || episode.streamFormat" class="ep-format">{{ streamFormatLabel(episode) }}</span>
                </button>
              </div>
            </section>
          </div>
        </div>
        <p v-else class="web-empty">No episodes are available for this series.</p>
      </article>

      <article v-if="['series', 'movies', 'channels'].includes(safariPage)" class="safari-page safari-library-page" :class="{ 'safari-browse-page': safariPage !== 'channels' }" :style="browseSelectedItem?.logo ? { '--browse-art': `url(${JSON.stringify(imageUrl(browseSelectedItem.logo))})` } : null">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>{{ safariLibraryTab === 'channel' ? 'Live TV' : typeLabel(safariLibraryTab) }}</h1></div><div class="library-heading-actions"><span>{{ managedItemsForTab.length }} items</span></div></div>
        <section v-if="categoryManagerOpen" class="library-category-manager">
          <header><div><p class="eyebrow">LIBRARY RAILS</p><h2>Manage {{ safariLibraryTab === 'channel' ? 'Live TV' : typeLabel(safariLibraryTab) }} categories</h2></div><span>Playlist categories are imported automatically. Your changes control what appears in your Library.</span></header>
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
        <div v-else-if="safariLibraryTab !== 'channel' && browseItems.length" class="safari-media-browser">
          <nav class="browse-category-nav" aria-label="Browse categories">
            <button v-for="entry in browseCategories" :key="entry.id" type="button" :class="{active:browseCategoryId === entry.id}" @click="selectBrowseCategory(entry.id)">{{ entry.name }}</button>
          </nav>
          <div class="browse-carousel" tabindex="0" :aria-label="`${typeLabel(safariLibraryTab)} posters`">
            <button v-for="(item,index) in browseItems" :key="item.libraryKey || `${item.sourceId}:${item.kind}:${item.id}`" type="button" class="browse-poster" :class="{focused:index === browseFocusIndex}" :aria-label="item.title" @focus="focusBrowseItem($event,index)" @mouseenter="browseFocusIndex = index" @click="playLibraryItem(item)">
              <span class="browse-poster-art"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title" loading="lazy"><span v-else class="safari-library-fallback"><b>{{ typeIcon(safariLibraryTab) }}</b></span></span><strong>{{ item.title }}</strong><small>{{ item.category || typeLabel(safariLibraryTab) }}</small>
            </button>
          </div>
        </div>
        <p v-else class="web-empty safari-library-empty">No {{ typeLabel(safariLibraryTab).toLowerCase() }} are enabled yet. Add them from Playlist.</p>
      </article>

      <article v-if="safariPage === 'watchlater'" class="safari-page safari-library-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">SAVED FOR LATER</p><h1>Watch Later</h1></div><div class="library-heading-actions"><span>{{ favorites.length }} items</span></div></div>
        <div v-if="favoritesLoading" class="loading">Loading&hellip;</div>
        <div v-else-if="favorites.length" class="safari-library-rails">
          <section class="safari-library-rail">
            <div class="safari-library-rail-track">
              <div v-for="item in favorites" :key="item.id" class="is-add-item is-playable watch-later-item">
                <button type="button" :aria-label="`Play ${item.title}`" @click="playLibraryItem(item)"><span class="safari-library-art"><img v-if="item.logo" :src="imageUrl(item.logo)" :alt="item.title"><template v-else><span class="safari-library-fallback"></span><b>{{ typeIcon(item.kind) }}</b></template></span><span><strong>{{ item.title }}</strong></span><em>Play</em></button>
                <button type="button" class="watch-later-remove" :aria-label="`Remove ${item.title} from Watch Later`" @click="removeFavorite(item)">&times;</button>
              </div>
            </div>
          </section>
        </div>
        <p v-else class="web-empty safari-library-empty">Nothing saved yet. Tap the bookmark on a Series, Movie, or Channel to add it here.</p>
      </article>

      <article v-if="safariPage === 'settings'" class="safari-page safari-settings-page">
        <div class="safari-compact-heading"><div><p class="eyebrow">RH Library Manager</p><h1>Settings</h1></div></div>
        <nav class="settings-tabs" aria-label="Settings sections">
          <button type="button" :class="{ active: settingsTab === 'profile' }" :aria-selected="settingsTab === 'profile'" @click="settingsTab = 'profile'">PROFILE</button>
          <button type="button" :class="{ active: settingsTab === 'playlists' }" :aria-selected="settingsTab === 'playlists'" @click="settingsTab = 'playlists'">PLAYLISTS</button>
          <button type="button" :class="{ active: settingsTab === 'appearance' }" :aria-selected="settingsTab === 'appearance'" @click="settingsTab = 'appearance'">APPEARANCE</button>
        </nav>
        <section v-if="activeProfile && settingsTab === 'profile'" class="settings-profile-card">
          <div class="settings-section-heading"><div><p class="eyebrow">PROFILE</p><h2>Profile picture</h2></div><span>{{ activeProfile.name }} <code class="profile-code-badge" title="Your profile code - share it so a partner can add this exact profile">{{ activeProfile.code }}</code></span></div>
          <div class="profile-picture-editor"><button type="button" class="profile-picture-preview" :disabled="profileBusy" @click="openProfileImagePicker"><img v-if="activeProfile.avatarImage" :src="activeProfile.avatarImage" alt="Current profile picture"><span v-else>{{ activeProfileFirstName.slice(0, 1).toUpperCase() }}</span></button><div><p class="profile-picture-help">Set a real profile picture for your account.</p><button type="button" class="source-action" :disabled="profileBusy" @click="openProfileImagePicker">{{ activeProfile.avatarImage ? 'Change picture' : 'Upload picture' }}</button><input ref="profileImageInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="loadProfileImage"></div></div>
          <p v-if="profileError" class="profile-error" role="alert">{{ profileError }}</p>
          <div class="profile-password-divider"></div>
          <div class="profile-password-heading"><div><p class="eyebrow">PROFILE SECURITY</p><h3 class="profile-lock-line"><LockKeyholeIcon v-if="activeProfile.hasPin" /><LockKeyholeOpenAltIcon v-else /><span>{{ activeProfile.hasPin ? '4-digit PIN enabled' : 'No profile PIN' }}</span></h3></div><button type="button" class="source-action" @click="profilePinOpen = !profilePinOpen; profilePinMessage = ''">{{ profilePinOpen ? 'Cancel' : (activeProfile.hasPin ? 'Change PIN' : 'Set PIN') }}</button></div>
          <form v-if="profilePinOpen" class="web-password-form profile-password-form" @submit.prevent="saveProfilePin"><label>New 4-digit PIN<input v-model="profilePin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="new-password"></label><label>Confirm PIN<input v-model="profilePinConfirmation" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="new-password"></label><div class="profile-pin-actions"><button type="submit" class="primary-action" :disabled="profileBusy">Save PIN</button><button v-if="activeProfile.hasPin" type="button" class="source-action" :disabled="profileBusy" @click="removeProfilePin">Remove PIN</button></div></form>
          <p v-if="profilePinMessage" class="web-password-message">{{ profilePinMessage }}</p>
          <div class="profile-password-divider"></div>
          <div class="profile-password-heading"><div><p class="eyebrow">SECURITY</p><h3>Change password</h3></div><button type="button" class="source-action" @click="changePasswordOpen = !changePasswordOpen">{{ changePasswordOpen ? 'Cancel' : 'Update password' }}</button></div>
          <form v-if="changePasswordOpen" class="web-password-form profile-password-form" @submit.prevent="changePassword"><label>Current password<input v-model="currentPassword" type="password" minlength="8" required autocomplete="current-password"></label><label>New password<input v-model="newPassword" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirm new password<input v-model="newPasswordConfirmation" type="password" minlength="8" required autocomplete="new-password"></label><button type="submit" class="primary-action" :disabled="busy">Change password</button><p v-if="passwordMessage" :class="['web-password-message', `is-${passwordMessageType}`]">{{ passwordMessage }}</p></form>
          <div class="profile-password-divider"></div>
          <div class="profile-password-heading"><div><p class="eyebrow">DANGER ZONE</p><h3>Delete account</h3></div><button type="button" class="source-action web-delete-account-toggle" @click="deleteAccountOpen = !deleteAccountOpen; deleteAccountMessage = ''">{{ deleteAccountOpen ? 'Cancel' : 'Delete account' }}</button></div>
          <form v-if="deleteAccountOpen" class="web-password-form profile-password-form" @submit.prevent="deleteAccount"><p>This permanently deletes your account, library, profiles, and settings. This cannot be undone.</p><label>Current password<input v-model="deleteAccountPassword" type="password" minlength="8" required autocomplete="current-password"></label><button type="submit" class="primary-action web-delete-account-confirm" :disabled="busy">Permanently delete account</button><p v-if="deleteAccountMessage" class="web-password-message is-error">{{ deleteAccountMessage }}</p></form>
          <div class="profile-password-divider"></div>
          <div class="profile-password-heading"><div><p class="eyebrow">WATCH WITH PARTNER</p><h3>{{ partnerEmail ? `${partnerEmail} (${partnerProfileCode})` : 'No partner set' }}</h3><p class="profile-picture-help">Your profile code is <code class="profile-code-badge">{{ activeProfile.code }}</code> - give it to whoever adds you as their partner.</p></div><button type="button" class="source-action" @click="partnerEmailOpen = !partnerEmailOpen; partnerEmailInput = partnerEmail; partnerProfileCodeInput = partnerProfileCode">{{ partnerEmailOpen ? 'Cancel' : (partnerEmail ? 'Change' : 'Set partner') }}</button></div>
          <form v-if="partnerEmailOpen" class="web-password-form profile-password-form" @submit.prevent="savePartnerEmail"><label>Partner's RH account email<input v-model="partnerEmailInput" type="email" placeholder="partner@example.com" autocomplete="off"></label><label>Partner's profile code<input v-model="partnerProfileCodeInput" type="text" placeholder="e.g. R1" maxlength="6" autocomplete="off" style="text-transform:uppercase"></label><button type="submit" class="primary-action" :disabled="busy">Save partner</button><p v-if="partnerMessage" :class="['web-password-message', `is-${partnerMessageType}`]">{{ partnerMessage }}</p></form>
        </section>
        <section v-if="settingsTab === 'playlists'" class="settings-playlists">
          <div class="settings-section-heading"><div><p class="eyebrow">PLAYLISTS</p><h2>Manage playlists</h2></div><span>{{ sources.length }} total</span></div>
          <form class="settings-playlist-form" @submit.prevent="saveSource">
            <label>Playlist type<select v-model="sourceType"><option value="m3u">M3U</option><option value="m3u_plus">M3U PLUS</option><option value="xtream">Xtream</option></select></label>
            <label>Playlist name<input v-model="name" required placeholder="My playlist"></label>
            <label class="settings-playlist-link">Playlist link<input v-model="url" type="url" required :placeholder="sourceType === 'xtream' ? 'https://provider.com' : 'https://provider.com/playlist.m3u'" spellcheck="false"></label>
            <template v-if="sourceType === 'xtream'">
              <label>Username<input v-model="sourceUsername" :required="!editing" autocomplete="username" :placeholder="editing ? 'Leave blank to keep current' : 'Username'"></label>
              <label>Password<input v-model="sourcePassword" type="password" :required="!editing" autocomplete="new-password" :placeholder="editing ? 'Leave blank to keep current' : 'Password'"></label>
            </template>
            <div class="settings-playlist-form-actions"><button type="submit" class="primary-action" :disabled="busy">{{ busy ? 'Saving…' : (editing ? 'Save changes' : 'Add playlist') }}</button><button v-if="editing" type="button" class="source-action" @click="cancelEdit">Cancel</button></div>
          </form>
          <p v-if="message" :class="['settings-playlist-message', `is-${messageType}`]">{{ message }}</p>
          <div v-if="sources.length" class="settings-playlist-table-wrap"><table class="settings-playlist-table"><thead><tr><th>Type</th><th>Playlist</th><th>Endpoint</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr v-for="source in sources" :key="source.id"><td data-label="Type"><span class="settings-playlist-type">{{ (source.type || 'xtream').replace('_', ' ').toUpperCase() }}</span></td><td class="settings-playlist-name" data-label="Playlist">{{ source.name }}</td><td class="settings-playlist-endpoint" data-label="Endpoint" :title="source.endpoint">{{ source.endpoint }}</td><td data-label="Status"><span :class="['settings-playlist-status', `is-${playlistConnectionStatus(source)}`]" role="status" :aria-label="playlistConnectionTitle(source)" :title="playlistConnectionTitle(source)"><i aria-hidden="true"></i><span>{{ playlistConnectionLabel(source) }}</span></span></td><td data-label="Actions"><div class="settings-playlist-actions"><button type="button" class="settings-icon-action" :disabled="busy" aria-label="Edit playlist" title="Edit playlist" @click="editSource(source)"><EditIcon /></button><button type="button" class="settings-icon-action is-delete" :disabled="busy" aria-label="Delete playlist" title="Delete playlist" @click="deleteSource(source)"><TrashIcon /></button></div></td></tr></tbody></table></div>
          <p v-else class="web-empty">No playlists added yet.</p>
        </section>
        <section v-if="settingsTab === 'appearance'" class="settings-profile-card">
          <div class="settings-section-heading"><div><p class="eyebrow">APPEARANCE</p><h2>Preferences</h2></div></div>
          <div class="settings-toggle-row">
            <div><strong>Welcome page video backdrop</strong><small>Looping montage of clips from your newest titles behind the Welcome page.</small></div>
            <button type="button" class="rh-switch" role="switch" :aria-checked="backdropEnabled ? 'true' : 'false'" :class="{ on: backdropEnabled }" @click="setBackdropEnabled(!backdropEnabled)"><span class="rh-switch-knob"></span></button>
          </div>
        </section>
      </article>
      <div v-if="profileCropOpen" class="profile-crop-backdrop" role="dialog" aria-modal="true" aria-label="Crop profile picture"><section class="profile-crop-modal"><div class="settings-section-heading"><div><p class="eyebrow">PROFILE PHOTO</p><h2>Frame your picture</h2></div><button type="button" class="close" @click="profileCropOpen=false">×</button></div><div class="profile-crop-window"><img :src="profileCropSource" alt="Crop preview" :style="{transform:`translate(${(50-profileCropX)/4}%, ${(50-profileCropY)/4}%) scale(${profileCropZoom})`}" @load="cropImageLoaded"></div><label class="crop-control">Zoom <input v-model.number="profileCropZoom" type="range" min="1" max="3" step="0.05"></label><label class="crop-control">Horizontal position <input v-model.number="profileCropX" type="range" min="0" max="100"></label><label class="crop-control">Vertical position <input v-model.number="profileCropY" type="range" min="0" max="100"></label><div class="profile-crop-actions"><button type="button" class="source-action" @click="profileCropOpen=false">Cancel</button><button type="button" class="primary-action" :disabled="profileBusy" @click="saveProfileImage">Save picture</button></div></section></div>

      <nav class="safari-bottom-menu" aria-label="Main menu"><button v-for="item in safariMenuItems" :key="item.id" type="button" :class="{active:safariPage === item.id}" @click="openSafariPage(item.id)"><span><img v-if="typeof item.icon === 'string'" :src="item.icon" alt=""><component v-else :is="item.icon" /></span><small>{{ item.label }}</small></button></nav>
      </div></div>
    </section>
      <section v-if="webNowPlaying" class="web-player" :class="{'is-fullscreen': webFullscreen, 'is-mini': webMini}" :style="webMini && webMiniPos ? {left: webMiniPos.left + 'px', top: webMiniPos.top + 'px', right: 'auto', bottom: 'auto'} : null" @pointerdown="startMiniDrag" role="dialog" aria-label="Media player">
      <div class="web-video-frame" @click="webFrameClick($event)"><video ref="webVideo" playsinline preload="metadata" @webkitendfullscreen="handleFullscreenChange" @loadedmetadata="handleWebMetadata" @timeupdate="onWebTimeUpdate" @progress="refreshWebBuffered" @play="onWebPlay" @pause="onWebPause" @playing="onWebReady" @waiting="onWebWaiting" @canplay="onWebReady" @loadeddata="onWebReady" @volumechange="webMuted = $event.target.muted" @ended="webPlaying = false; showWebControls()" @error="handleWebVideoError"></video><div v-if="!webMediaReady && !webPlayerError" class="web-video-placeholder"></div><div v-if="webCallIncoming" class="wwp-call-ring"><span>📞 {{ partnerName || 'Your partner' }} is calling…</span><div><button type="button" class="primary-action" @click.stop="answerWebCall">Answer</button><button type="button" @click.stop="declineWebCall">Decline</button></div></div><iframe v-if="webCallActive" ref="webCallFrame" :src="webCallUrl" class="wwp-call-frame" allow="microphone; autoplay" title="Watch with Partner voice call"></iframe>
        <div v-if="webMini" class="web-mini-bar">
          <button type="button" class="web-pl-btn" aria-label="Play or pause" @click.stop="toggleWebPlayback"><PauseIcon v-if="webPlaying" /><PlayIcon v-else /></button>
          <strong>{{ webNowPlaying.title }}</strong>
          <button type="button" class="web-pl-btn" aria-label="Expand" @click.stop="webMini = false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>
          <button type="button" class="web-pl-btn" aria-label="Close player" @click.stop="closeWebPlayer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="web-player-overlay" :class="{visible: webControlsVisible || webBuffering || webPlayerError || !webPlaying}">
          <header class="web-player-topbar">
            <button type="button" class="web-pl-btn web-pl-back" aria-label="Close player" @click.stop="closeWebPlayer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
            <h2 class="web-player-name">{{ webNowPlaying.title }}</h2>
            <div class="web-player-topbar-actions">
              <span v-if="webEncodeStrategy" class="web-strategy-badge" :data-tier="webStrategyTier" :title="'Playback: ' + webEncodeStrategy"><i aria-hidden="true"></i>{{ webEncodeStrategy }}</span>
              <div class="web-partner-control">
                <button type="button" class="web-pl-btn" :class="{active: webPartnerMenuOpen || webWwpSessionId}" aria-label="Watch with Partner" title="Watch with Partner" @click.stop="webPartnerMenuOpen = !webPartnerMenuOpen"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.24 4.76c-2.3-2.29-5.87-2.35-8.24-.19-2.37-2.16-5.93-2.09-8.24.2-2.36 2.37-2.36 6.07 0 8.43l7.53 7.52c.2.19.45.29.71.29s.51-.1.71-.29l7.53-7.52c2.36-2.36 2.36-6.06 0-8.43Zm-1.41 7.02-6.82 6.81-6.82-6.81a3.92 3.92 0 0 1 0-5.6C5.98 5.39 6.99 5 8 5s2.02.39 2.8 1.18l.5.5c.39.39 1.02.39 1.41 0l.5-.5c1.57-1.57 4.04-1.57 5.62 0 1.57 1.58 1.57 4.04 0 5.6"/><path d="M13 8.5h-2V11H8.5v2H11v2.5h2V13h2.5v-2H13z"/></svg></button>
                <div v-if="webPartnerMenuOpen" class="web-quality-menu web-partner-menu"><p v-if="partnerEmail">Invite <strong>{{ partnerEmail }}</strong> to watch this with you, on the same stream.</p><p v-else>Set a partner in Settings first.</p><button type="button" class="primary-action" :disabled="!partnerEmail" @click.stop="sendPartnerInvite">Send invite</button><button v-if="webWwpSessionId && !webCallActive" type="button" class="primary-action wwp-call-start" @click.stop="startWebCall">🎙 Start voice call</button><button v-if="webCallActive" type="button" class="primary-action wwp-call-end" @click.stop="endWebCall">End voice call</button></div>
              </div>
            </div>
          </header>
          <div v-if="webBuffering && !webPlayerError" class="web-startup-status web-startup-status-centered"><strong>{{ webStartupPercent }}%</strong><small>{{ webStartupHint }}</small></div>
          <button v-else-if="!webPlaying" type="button" class="web-center-play" aria-label="Play or pause" @click.stop="toggleWebPlayback"><PauseIcon v-if="webPlaying" /><PlayIcon v-else /></button>
          <footer class="web-player-bottombar">
            <button type="button" class="web-pl-btn web-pl-play" aria-label="Play or pause" @click.stop="toggleWebPlayback"><PauseIcon v-if="webPlaying" /><PlayIcon v-else /></button>
            <template v-if="webNowPlaying.kind !== 'channel'"><span class="web-player-time">{{ formatTime(webCurrentTime) }} <i>/ {{ formatTime(webDuration) }}</i></span>
            <input type="range" class="web-player-scrub" min="0" :max="webDuration || 0" :value="webCurrentTime" :style="webTimelineStyle" aria-label="Seek" @pointerdown="showWebControls" @input="seekWebMovie"></template><span v-else class="web-player-live-spacer"></span>
            <button type="button" class="web-pl-btn" aria-label="Skip to next" :disabled="!webUpNext" @click.stop="webUpNext && playWebMovie(webUpNext)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l9-7zM16 5h2.4v14H16z"/></svg></button>
            <button type="button" class="web-pl-btn" :aria-label="webMuted ? 'Unmute' : 'Mute'" @click.stop="toggleWebMute"><svg v-if="webMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4zM23 9l-6 6M17 9l6 6"/></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/></svg></button>
            <button type="button" class="web-pl-btn" :aria-label="webFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click.stop="fullscreenWebMovie"><svg v-if="webFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a3 3 0 0 1-3 3H3M21 9h-3a3 3 0 0 1-3-3V3M3 15h3a3 3 0 0 1 3 3v3M15 21v-3a3 3 0 0 1 3-3h3"/></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5"/></svg></button>
          </footer>
        </div>
        <button v-if="webAutoplayBlocked && webMuted" type="button" class="web-unmute-prompt" @click.stop="unmuteWebPlayback">Tap to unmute</button>
        <div v-if="webPlayerError" class="web-player-error">
          <div class="web-player-error-card">
            <span class="web-player-error-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>
            <strong>Playback unavailable</strong>
              <p>{{ webPlayerError }}</p>
            <button type="button" class="primary-action" @click.stop="playWebMovie(webNowPlaying)">Try again</button>
          </div>
        </div>
      </div>
      <article v-if="webUpNext && !webMini" class="web-up-next"><div class="web-up-next-icon"><img v-if="webUpNext.logo" :src="imageUrl(webUpNext.logo)" :alt="webUpNext.title"><span v-else>▶</span></div><div><p>UP NEXT</p><strong>{{ webUpNext.title }}</strong><small>Continue watching</small></div><button type="button" aria-label="Play next movie" @click="playWebMovie(webUpNext)">▶</button></article>
    </section>
    </template>
    </div>
  </main>
</template>
