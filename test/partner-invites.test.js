import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const listener = app.slice(app.indexOf('function stopPartnerInvites()'), app.indexOf('// Watch with Partner: while a session is active'));
function context(request) {
  const c = vm.createContext({ request, AbortController, onBeforeUnmount() {}, window: { clearTimeout() {}, setTimeout() {} },
    deviceToken: { value: 'profile-a' }, pendingPartnerInvite: { value: null },
    handledPartnerInviteIds: new Set(), webWwpSessionId: { value: '' }, partnerInviteError: { value: '' },
    partnerInviteRevision: 0, partnerInviteController: null, partnerInviteRetryTimer: null });
  vm.runInContext(listener, c);
  return c;
}
test('initial poll displays an invite waiting before login or reload', async () => {
  let calls = 0;
  const c = context(async () => ++calls === 1 ? { revision: 2, invite: { wwpSessionId: 'waiting' } } : new Promise(() => {}));
  await c.watchPartnerInvite();
  assert.equal(c.pendingPartnerInvite.value.wwpSessionId, 'waiting');
});
test('profile change aborts old poll, clears old invite, and starts listening for the new profile', async () => {
  const requests = [];
  const c = context((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  c.startPartnerInvites();
  c.pendingPartnerInvite.value = { wwpSessionId: 'old' };
  c.deviceToken.value = 'profile-b';
  c.startPartnerInvites();
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(c.pendingPartnerInvite.value, null);
  requests[0].resolve({ revision: 8, invite: { wwpSessionId: 'stale' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.pendingPartnerInvite.value, null);
  requests[1].resolve({ revision: 3, invite: { wwpSessionId: 'new' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.pendingPartnerInvite.value.wwpSessionId, 'new');
  c.stopPartnerInvites();
  assert.equal(requests[2].options.signal.aborted, true);
});
test('fresh profile selection starts the invite listener', () => {
  const choose = app.slice(app.indexOf('async function chooseProfile('), app.indexOf('async function createProfile('));
  assert.match(choose, /startPartnerInvites\(\)/);
});

function playbackContext(overrides = {}) {
  const names = [...new Set([...app.matchAll(/\b(\w+)\.value\b/g)].map(match => match[1]))];
  const c = vm.createContext({ Object, Number, Math, URL, AbortSignal, AbortController, crypto: { randomUUID: () => 'invitation-trace' },
    webPlaybackSessionId: 0, webPlaybackTraceId: '', stopWwpSync() {}, stopWebStartupPoll() {},
    setWebStartupProgress() {}, showWebControls() {}, loadWwpGuestDuration() {}, acknowledgePartnerInvite: async () => true,
    ...Object.fromEntries(names.map(name => [name, { value: null }])), ...overrides });
  vm.runInContext(app.slice(app.indexOf('async function joinPartnerInvite('), app.indexOf('function toggleWebMute()')), c);
  return c;
}
const invite = { wwpSessionId: 'host-session', streamTicket: 'host-ticket', sourceId: 'host-source', kind: 'series', id: 'episode', start: 47, durationSeconds: 900 };
test('joining a foreign account episode checks ticket-authorized compatibility before loading the shared stream', async () => {
  const order = [];
  const c = playbackContext({
    async decideWebPlayback(item) { order.push('decision'); assert.equal(item.id, 'episode'); return { playable: true }; },
    async runWebCompatibilitySteps() { order.push('hints'); },
    async configureMoviePlayback(start) { order.push('stream'); assert.equal(start, 47); },
    watchWwpSync() { order.push('sync'); },
  });
  await c.joinPartnerInvite(invite);
  assert.deepEqual(order, ['decision', 'hints', 'stream', 'sync']);
  assert.equal(c.webStreamTicket.value, 'host-ticket');
  assert.equal(c.webIsWwpGuest.value, true);
  assert.equal(c.webPlaybackOffset.value, 47);
});
test('guest retry preserves the host ticket and episode instead of resolving it in the guest library', async () => {
  let retried;
  const c = playbackContext({ webAbsolutePosition: () => 63, joinPartnerInvite: async (...args) => { retried = args; } });
  // Replace the extracted join function with a recorder for this retry test.
  c.joinPartnerInvite = async (...args) => { retried = args; };
  c.webIsWwpGuest.value = true; c.webWwpSessionId.value = 'host-session'; c.webStreamTicket.value = 'host-ticket';
  c.webNowPlaying.value = invite; c.webDuration.value = 900;
  vm.runInContext(app.slice(app.indexOf('async function retryWebPlayback()'), app.indexOf('async function openSeriesEpisodes(')), c);
  await c.retryWebPlayback();
  assert.equal(retried[0].streamTicket, 'host-ticket');
  assert.equal(retried[0].id, 'episode');
  assert.equal(retried[0].start, 63);
  assert.equal(retried[1].retry, true);
});
test('guest decision sends the host ticket without the guest device token in URL or headers', async () => {
  let sent;
  const c = playbackContext({ browserStreamer: 'https://stream.example', browserPlaybackClientId: 'browser',
    detectBrowserCapabilities: () => ({ browser: { name: 'chrome', version: 145 } }),
    async fetch(url, options) { sent = { url: new URL(url), options }; return { ok: false, json: async () => ({ error: 'stop after auth check' }) }; },
  });
  c.webIsWwpGuest.value = true; c.deviceToken.value = 'guest-device'; c.webStreamTicket.value = 'host-ticket';
  vm.runInContext(app.slice(app.indexOf('async function decideWebPlayback('), app.indexOf('function handleWebMetadata(')), c);
  await assert.rejects(c.decideWebPlayback(invite), /stop after auth check/);
  assert.equal(sent.url.searchParams.get('streamTicket'), 'host-ticket');
  assert.equal(sent.url.searchParams.has('deviceToken'), false);
  assert.equal(sent.options.headers['x-device-token'], undefined);
});
test('a Direct-only policy cannot invent an HLS strategy for an invitation', async () => {
  const c = playbackContext({ browserStreamer: 'https://stream.example', browserPlaybackClientId: 'browser',
    detectBrowserCapabilities: () => ({ browser: { name: 'chrome', version: 145 } }),
    async fetch() { return { ok: true, json: async () => ({ ok: true, traceId: 'trace', playbackUrl: '/direct', playbackStrategy: 'DIRECT', hlsFallbackStrategy: '' }) }; },
  });
  c.webPlaybackTraceId = 'trace'; c.webWwpSessionId.value = 'host-session'; c.webIsWwpGuest.value = true;
  vm.runInContext(app.slice(app.indexOf('async function decideWebPlayback('), app.indexOf('function handleWebMetadata(')), c);
  await assert.rejects(c.decideWebPlayback(invite), /No checked compatible HLS strategy/);
});

function actionContext(request) {
  const c = playbackContext({ request, handledPartnerInviteIds: new Set() });
  vm.runInContext(app.slice(app.indexOf('async function acknowledgePartnerInvite('), app.indexOf('async function joinPartnerInvite(')), c);
  c.deviceToken.value = 'guest-profile';
  c.pendingPartnerInvite.value = invite;
  return c;
}
test('dismissal waits for server confirmation and ignores any stale poll replay', async () => {
  const c = actionContext(async (path, options) => {
    assert.equal(path, '/api/partner/invite/ack');
    assert.equal(JSON.parse(options.body).wwpSessionId, 'host-session');
    return { confirmed: true };
  });
  await c.dismissPartnerInvite(invite);
  assert.equal(c.pendingPartnerInvite.value, null);
  assert.equal(c.handledPartnerInviteIds.has('host-session'), true);
  let calls = 0;
  c.request = async () => ++calls === 1 ? { revision: 3, invite } : new Promise(() => {});
  c.partnerInviteRevision = 0; c.partnerInviteController = null; c.partnerInviteRetryTimer = null;
  c.window = { clearTimeout() {}, setTimeout() {} }; c.onBeforeUnmount = () => {};
  vm.runInContext(listener, c);
  await c.watchPartnerInvite();
  assert.equal(c.pendingPartnerInvite.value, null);
});
test('an unconfirmed acknowledgment leaves the invitation available for retry', async () => {
  const c = actionContext(async () => ({ confirmed: false }));
  assert.equal(await c.acknowledgePartnerInvite(invite, 'join'), false);
  assert.equal(c.pendingPartnerInvite.value.wwpSessionId, 'host-session');
  assert.equal(c.handledPartnerInviteIds.size, 0);
  assert.match(c.partnerInviteError.value, /try again/i);
});
test('acknowledging an older invitation does not hide a newer arrival', async () => {
  let resolve;
  const c = actionContext(() => new Promise(done => { resolve = done; }));
  const action = c.acknowledgePartnerInvite(invite, 'dismiss');
  c.pendingPartnerInvite.value = { wwpSessionId: 'new-session' };
  resolve({ confirmed: true });
  await action;
  assert.equal(c.pendingPartnerInvite.value.wwpSessionId, 'new-session');
});
