import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const code = app.slice(app.indexOf('async function notifyWwpPlayerClosed('), app.indexOf('window.addEventListener("pagehide"'));
function setup({ guest = false, beacon = false, failures = 0 } = {}) {
  const requests = [], beacons = [], releases = [];
  const c = vm.createContext({ URLSearchParams, encodeURIComponent, console,
    browserStreamer: 'https://iptv-stream.mctoshs.ca', webWwpSessionId: { value: 'shared-session' },
    webStreamTicket: { value: 'host-invite' }, webIsWwpGuest: { value: guest },
    deviceToken: { value: 'own-device' }, wwpRemoteEnded: false, webNowPlaying: { value: {} },
    browserPlaybackReleaseUrl() { releases.push(true); return 'release'; },
    navigator: { sendBeacon(url) { beacons.push(url); return beacon; } },
    async fetch(url, options) {
      requests.push({ url, options });
      if (requests.length <= failures) throw new Error('network');
      return { ok: true, async json() { return { ended: true }; } };
    },
  });
  vm.runInContext(code, c);
  return { c, requests, beacons, releases };
}
test('either host or guest closes the same shared session with its authorized credential', async () => {
  for (const guest of [false, true]) {
    const { c, requests, beacons } = setup({ guest });
    await c.notifyWwpPlayerClosed();
    const url = new URL(requests[0].url);
    assert.equal(url.pathname, '/api/xtream/wwp-end/shared-session');
    assert.equal(url.searchParams.get('streamTicket'), 'host-invite');
    assert.equal(url.searchParams.get('deviceToken'), guest ? null : 'own-device');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.keepalive, true);
    assert.equal(beacons.length, 0);
  }
});
test('a transient failed close retries the captured session after local teardown', async () => {
  const { c, requests } = setup({ failures: 1 });
  const pending = c.notifyWwpPlayerClosed();
  c.webWwpSessionId.value = '';
  c.webStreamTicket.value = '';
  await pending;
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, requests[1].url);
});
test('remote closure does not echo another end request', async () => {
  const { c, requests } = setup(); c.wwpRemoteEnded = true;
  await c.notifyWwpPlayerClosed();
  assert.equal(requests.length, 0);
});
test('tab close ends the shared session and falls back when beacon is refused', async () => {
  for (const beacon of [false, true]) {
    const { c, requests, beacons, releases } = setup({ beacon });
    c.releaseBrowserPlaybackOnPageHide();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(beacons.length, 1);
    assert.equal(requests.length, beacon ? 0 : 1);
    assert.equal(releases.length, 0);
  }
});
test('receiving an ended session closes the current player and marks it as remote', async () => {
  const { c } = setup();
  c.URL = URL; c.AbortController = AbortController;
  c.wwpSyncController = null; c.wwpSyncToken = '';
  c.fetch = async () => ({ ok: true, async json() { return { ended: true }; } });
  let closed = false;
  c.closeWebPlayer = () => { closed = true; assert.equal(c.wwpRemoteEnded, true); };
  vm.runInContext(app.slice(app.indexOf('async function watchWwpSync('), app.indexOf('// Host: broadcast our position')), c);
  await c.watchWwpSync();
  assert.equal(closed, true);
});
