import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const selector = readFileSync(new URL('../src/browser-transport.js', import.meta.url), 'utf8');
const runtime = `${app}\n${selector}`;
assert.match(selector, /serverDecision\?\.playable === false/,
  'Browser must reject a server decision with no checked playable strategy');
assert.match(selector, /serverDecision\?\.hlsFallbackStrategy/,
  'Browser Direct recovery must use the backend-approved fallback');
assert.match(app, /selectedHls\.replace\("HLS_"/,
  'Browser HLS requests must carry the selected exact strategy');
assert.match(selector, /mkvVerified/,
  'MKV Direct support must be capability-gated');
assert.match(selector, /browser\.name === 'chrome' && browser\.version >= 145/,
  'Chrome MKV Direct requires Chrome 145 or newer');
assert.match(selector, /remuxVideoCopy && remuxAudioCopy/,
  'Remux must validate stream-copy compatibility for both codecs');
console.log('Browser transport invariants passed.');
