import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const code = app.slice(app.indexOf('async function startWebPlayback('), app.indexOf('// The server picks copy vs.'));
function player(video) {
  let controlsShown = 0;
  const context = vm.createContext({
    webVideo: { value: video }, webPlaybackToken: 1, wwpUserPaused: false,
    webPlaying: { value: false }, webMuted: { value: video.muted },
    webBuffering: { value: true }, setTimeout: fn => fn(),
    showWebControls() { controlsShown++; },
  });
  vm.runInContext(code, context);
  return { context, controlsShown: () => controlsShown };
}
test('blocked audible autoplay never retries muted and exposes the Play control', async () => {
  let attempts = 0;
  const video = { muted: false, async play() { attempts++; throw { name: 'NotAllowedError' }; } };
  const c = player(video);
  assert.equal(await c.context.startWebPlayback(video), false);
  assert.equal(attempts, 1);
  assert.equal(video.muted, false);
  assert.equal(c.context.webMuted.value, false);
  assert.equal(c.context.webBuffering.value, false);
  assert.equal(c.controlsShown(), 1);
  video.play = async () => { attempts++; };
  assert.equal(await c.context.startWebPlayback(video), true);
  assert.equal(video.muted, false);
});
test('temporary source-attachment abort retries preserve sound', async () => {
  let attempts = 0;
  const video = { muted: false, async play() { if (++attempts === 1) throw { name: 'AbortError' }; } };
  const c = player(video);
  assert.equal(await c.context.startWebPlayback(video), true);
  assert.equal(attempts, 2);
  assert.equal(video.muted, false);
});
test('manual mute remains a user choice during playback', async () => {
  const video = { muted: true, async play() {} };
  const c = player(video);
  assert.equal(await c.context.startWebPlayback(video), true);
  assert.equal(video.muted, true);
  assert.equal(c.context.webMuted.value, true);
});
test('an old autoplay rejection cannot replace the current player state', async () => {
  let reject;
  const video = { muted: false, play() { return new Promise((_, fail) => { reject = fail; }); } };
  const c = player(video), pending = c.context.startWebPlayback(video);
  c.context.webPlaybackToken = 2;
  c.context.webPlaying.value = true;
  reject({ name: 'NotAllowedError' });
  assert.equal(await pending, false);
  assert.equal(c.context.webPlaying.value, true);
  assert.equal(c.controlsShown(), 0);
});
test('partner joins start unmuted and the unmute prompt is removed', () => {
  const join = app.slice(app.indexOf('async function joinPartnerInvite('), app.indexOf('function toggleWebMute('));
  assert.match(join, /webMuted\.value = false/);
  assert.doesNotMatch(join, /webMuted\.value = true/);
  assert.doesNotMatch(app, /Tap to unmute|webAutoplayBlocked|unmuteWebPlayback/);
});
