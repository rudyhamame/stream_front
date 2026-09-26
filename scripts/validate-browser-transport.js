import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const selector = readFileSync(new URL('../src/browser-transport.js', import.meta.url), 'utf8');
const runtime = `${app}\n${selector}`;
assert.doesNotMatch(runtime, /HLS_(?:AUDIO|VIDEO|FULL|PARTIAL)_TRANSCODE/,
  'Browser runtime must not mention or invoke a transcode transport');
assert.doesNotMatch(app, /hlsFallback|advanceWebHlsFallback/,
  'Browser must not request or advance a server fallback ladder');
assert.match(selector, /mkvVerified/,
  'MKV Direct support must be capability-gated');
assert.match(selector, /browser\.name === 'chrome' && browser\.version >= 145/,
  'Chrome MKV Direct requires Chrome 145 or newer');
assert.match(selector, /remuxVideoCopy && remuxAudioCopy/,
  'Remux must validate stream-copy compatibility for both codecs');
console.log('Browser transport invariants passed.');
