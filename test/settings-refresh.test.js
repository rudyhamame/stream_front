import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const partnerLoader = app.slice(app.indexOf('async function loadPartnerSettings()'), app.indexOf('async function savePartnerEmail()'));
const buildChecker = app.slice(app.indexOf('function canRefreshBrowserBuild()'), app.indexOf('function checkBrowserBuildWhenVisible()'));
const ref = value => ({ value });

function partnerContext(request) {
  const context = vm.createContext({ request, deviceToken: ref('token'), partnerEmailOpen: ref(false),
    partnerEmail: ref(''), partnerEmailInput: ref('draft@example.com'),
    partnerProfileCode: ref(''), partnerProfileCodeInput: ref('R2'),
    partnerLinked: ref(false), partnerOnline: ref(false), partnerName: ref(''), partnerAvatar: ref(''),
    partnerStatusChecked: ref(false), partnerStatusError: ref(false) });
  vm.runInContext(partnerLoader, context);
  return context;
}

test('partner presence refresh preserves both fields while editing and still updates status', async () => {
  const context = partnerContext(async () => ({ partnerEmail: 'saved@example.com', partnerProfileCode: 'R1', online: true }));
  context.partnerEmailOpen.value = true;
  await context.loadPartnerSettings();
  assert.equal(context.partnerEmailInput.value, 'draft@example.com');
  assert.equal(context.partnerProfileCodeInput.value, 'R2');
  assert.equal(context.partnerEmail.value, 'saved@example.com');
  assert.equal(context.partnerOnline.value, true);
  context.partnerEmailOpen.value = false;
  await context.loadPartnerSettings();
  assert.equal(context.partnerEmailInput.value, 'saved@example.com');
  assert.equal(context.partnerProfileCodeInput.value, 'R1');
});

test('opening the editor during a pending presence request preserves the draft', async () => {
  let resolve;
  const context = partnerContext(() => new Promise(done => { resolve = done; }));
  const pending = context.loadPartnerSettings();
  context.partnerEmailOpen.value = true;
  resolve({ partnerEmail: '', partnerProfileCode: '' });
  await pending;
  assert.equal(context.partnerEmailInput.value, 'draft@example.com');
  assert.equal(context.partnerProfileCodeInput.value, 'R2');
});

test('a partner response for the previous profile cannot update the new profile', async () => {
  let resolve;
  const context = partnerContext(() => new Promise(done => { resolve = done; }));
  const pending = context.loadPartnerSettings();
  context.deviceToken.value = 'new-profile-token';
  resolve({ partnerEmail: 'previous@example.com', online: true });
  await pending;
  assert.equal(context.partnerEmail.value, '');
  assert.equal(context.partnerOnline.value, false);
});

test('presence starts immediately, repeats without duplicate timers, and pauses at the profile chooser', () => {
  let beats = 0;
  let polls = 0;
  let timers = 0;
  let tick;
  const context = vm.createContext({ deviceToken: ref('token'), pairing: ref(false), profileChooser: ref(false),
    deviceStatusTimer: undefined,
    sendBrowserHeartbeat: () => { beats++; }, loadPartnerSettings: () => { polls++; },
    window: { setInterval: (callback, delay) => { assert.equal(delay, 10_000); timers++; tick = callback; return 1; } },
  });
  vm.runInContext(app.slice(app.indexOf('function refreshBrowserPresence()'), app.indexOf('watch(safariPage, value => window.localStorage')), context);
  context.startBrowserPresence();
  assert.equal(beats, 1);
  assert.equal(polls, 1);
  tick();
  assert.equal(beats, 2);
  context.startBrowserPresence();
  assert.equal(timers, 1);
  context.profileChooser.value = true;
  tick();
  assert.equal(beats, 3);
  context.profileChooser.value = false;
  context.deviceToken.value = '';
  tick();
  assert.equal(beats, 3);
  // Fresh sign-in finishes by selecting a profile, without mounting again.
  const chooseProfile = app.slice(app.indexOf('async function chooseProfile('), app.indexOf('async function createProfile('));
  assert.match(chooseProfile, /startBrowserPresence\(\)/);
});

test('build update reload is deferred in Settings and rechecks edits after fetching', async () => {
  let resolve;
  let reloads = 0;
  let fetches = 0;
  const context = vm.createContext({
    URL, AbortSignal, browserBuildCheckRunning: false,
    webNowPlaying: ref(null), legalPage: ref(''), downloadPage: ref(false), pairing: ref(false),
    safariPage: ref('settings'), partnerEmailOpen: ref(false),
    document: { hidden: false, activeElement: { matches: () => false }, querySelector: () => ({ src: 'https://example.com/assets/index-old.js' }) },
    location: { origin: 'https://example.com', reload: () => { reloads++; } },
    fetch: () => { fetches++; return new Promise(done => { resolve = done; }); },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ getAttribute: () => '/assets/index-new.js' }) }; } },
  });
  vm.runInContext(buildChecker, context);
  await context.checkBrowserBuild();
  assert.equal(fetches, 0);
  context.safariPage.value = 'welcome';
  const pending = context.checkBrowserBuild();
  context.safariPage.value = 'settings';
  context.partnerEmailOpen.value = true;
  resolve({ ok: true, text: async () => '' });
  await pending;
  assert.equal(reloads, 0);
  assert.equal(context.browserBuildCheckRunning, false);
  context.partnerEmailOpen.value = false;
  context.safariPage.value = 'welcome';
  const idleCheck = context.checkBrowserBuild();
  resolve({ ok: true, text: async () => '' });
  await idleCheck;
  assert.equal(reloads, 1);
});
