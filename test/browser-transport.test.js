import test from 'node:test';
import assert from 'node:assert/strict';
import { applyServerPlaybackPolicy, decideBrowserTransport, detectBrowserCapabilities, normalizeMediaMetadata, shouldFallbackFromDirect } from '../src/browser-transport.js';

const supported = { browser: { name: 'chrome', version: 145 }, containers: { mp4: true, webm: true }, mkvVerified: true,
  videoCodecs: { h264: true, hevc: true, vp8: true, vp9: true, av1: true }, audioCodecs: { aac: true, mp3: true, opus: true, vorbis: true, ac3: false, eac3: false, dts: false } };
const source = (container = 'matroska', audioCodec = 'aac', videoCodec = 'h264') => ({ container, videoCodec, videoProfile: 'High', videoLevel: 41, width: 1920, height: 1080, frameRate: '24000/1001', pixelFormat: 'yuv420p', videoBitDepth: 8, audioCodec, audioProfile: 'LC', audioChannels: 2, audioSampleRate: 48000 });

test('Chrome 145 directly plays compatible MKV and MP4', () => {
  assert.equal(decideBrowserTransport(source(), supported).transport, 'DIRECT');
  assert.equal(decideBrowserTransport(source('mp4'), supported).transport, 'DIRECT');
});

test('delivery protocol changes only the delivery method for compatible media', () => {
  assert.equal(decideBrowserTransport(source('mp4'), supported, 'https:').transport, 'DIRECT_PROVIDER');
  assert.equal(decideBrowserTransport(source('mp4'), supported, 'http:').transport, 'DIRECT_PROXY');
  assert.equal(decideBrowserTransport(source('matroska'), supported, 'http:').transport, 'DIRECT_PROXY');
});

test('server Direct checkbox gates Direct while browser compatibility decides transport', () => {
  const local = decideBrowserTransport(source(), supported, 'http:');
  assert.equal(local.transport, 'DIRECT_PROXY');
  const policy = applyServerPlaybackPolicy(local, { directEnabled: false, directCompatible: false, playbackStrategy: 'HLS_REMUX', reason: 'Direct disabled in RH control panel.' });
  assert.equal(policy.transport, 'HLS_REMUX');
  assert.equal(policy.directCompatible, false);
  assert.equal(policy.playable, true);
  assert.equal(applyServerPlaybackPolicy(local, { directEnabled: true, directCompatible: false, playbackStrategy: 'HLS_REMUX' }).transport, 'DIRECT_PROXY');
});

test('HTTP does not turn incompatible containers or codecs into transport failures', () => {
  const firefox = { ...supported, browser: { name: 'firefox', version: 140 }, mkvVerified: false };
  assert.equal(decideBrowserTransport(source('legacybox'), firefox, 'https:').transport, 'HLS_REMUX');
  assert.equal(decideBrowserTransport(source('legacybox'), firefox, 'http:').transport, 'HLS_REMUX');
  assert.equal(decideBrowserTransport(source('mp4', 'dts'), supported, 'https:').transport, 'UNSUPPORTED');
  assert.equal(decideBrowserTransport(source('mp4', 'dts'), supported, 'http:').transport, 'UNSUPPORTED');
});

test('unsupported audio or video cannot be repaired by remux', () => {
  assert.equal(decideBrowserTransport(source('matroska', 'dts'), supported).transport, 'UNSUPPORTED');
  assert.equal(decideBrowserTransport(source('matroska', 'aac', 'mpeg2video'), supported).transport, 'UNSUPPORTED');
});

test('MediaCapabilities exact stream result can reject a generic codec signal', () => {
  const caps = { ...supported, mediaCapabilities: { video: { h264: false }, audio: { aac: true } } };
  assert.equal(decideBrowserTransport(source(), caps).transport, 'UNSUPPORTED');
  const audioCaps = { ...supported, mediaCapabilities: { video: { h264: true }, audio: { aac: false } } };
  assert.equal(decideBrowserTransport(source('matroska', 'aac'), audioCaps).transport, 'UNSUPPORTED');
});

test('Firefox and Safari remux MKV only when both codecs can be copied', () => {
  for (const name of ['firefox', 'safari']) {
    assert.equal(decideBrowserTransport(source(), { ...supported, browser: { name, version: 140 }, mkvVerified: false }).transport, 'HLS_REMUX');
    assert.equal(decideBrowserTransport(source('matroska', 'dts'), { ...supported, browser: { name, version: 140 }, mkvVerified: false }).transport, 'UNSUPPORTED');
  }
});

test('unsupported or unknown containers remux when stream copy solves it', () => {
  const firefox = { ...supported, browser: { name: 'firefox', version: 140 }, mkvVerified: false };
  assert.equal(decideBrowserTransport(source('legacybox'), firefox).transport, 'HLS_REMUX');
  assert.equal(decideBrowserTransport(source('unknown'), firefox).transport, 'HLS_REMUX');
});

test('verified Edge MKV support and unverified Chromium behavior are distinct', () => {
  assert.equal(decideBrowserTransport(source(), { ...supported, browser: { name: 'edge', version: 140 } }).transport, 'DIRECT');
  assert.equal(decideBrowserTransport(source(), { ...supported, browser: { name: 'chromium', version: 140 }, mkvVerified: false, containers: { mp4: true, webm: true, mkv: false } }).transport, 'HLS_REMUX');
});

test('normalizes ffprobe Matroska and codec aliases', () => {
  const media = normalizeMediaMetadata({ container: 'matroska,webm', videoCodec: 'avc1', audioCodec: 'AAC-LC', frameRate: '24000/1001' });
  assert.equal(media.container, 'matroska');
  assert.equal(media.video.codec, 'h264');
  assert.equal(media.audio.codec, 'aac');
  assert.ok(media.video.frameRate > 23.9);
});

test('Chrome version does not override a negative Matroska capability result', () => {
  const caps = detectBrowserCapabilities({ userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36', brands: [{ brand: 'Google Chrome', version: '152' }], mediaElement: { canPlayType: mime => mime.startsWith('video/x-matroska') ? '' : 'probably' } });
  assert.equal(caps.mkvVerified, false);
  assert.equal(decideBrowserTransport(source(), caps, 'http:').transport, 'HLS_REMUX');
});

test('positive Matroska support is honored when the browser advertises it', () => {
  const caps = detectBrowserCapabilities({ userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36', brands: [{ brand: 'Google Chrome', version: '145' }], mediaElement: { canPlayType: () => 'probably' } });
  assert.equal(caps.mkvVerified, true);
  assert.equal(decideBrowserTransport(source(), caps).transport, 'DIRECT');
});

test('Only native media rejection permits copy-compatible remux', () => {
  assert.equal(shouldFallbackFromDirect(2, true), false);
  assert.equal(shouldFallbackFromDirect(3, true), true);
  assert.equal(shouldFallbackFromDirect(3, false), false);
  assert.equal(shouldFallbackFromDirect(0, true), false);
  assert.equal(shouldFallbackFromDirect(4, true), true);
  assert.equal(shouldFallbackFromDirect(4, true, 'DIRECT_PROXY'), true);
  assert.equal(shouldFallbackFromDirect(4, false), false);
});

test('Provider HLS is Direct when the browser has native or MSE HLS support', () => {
  const caps = { ...supported, containers: { ...supported.containers, hls: true } };
  assert.equal(decideBrowserTransport(source('hls'), caps).transport, 'DIRECT');
});

 test('Direct attempt takes precedence over capability predictions; checkboxes still gate both paths', () => {
  const local = decideBrowserTransport(source('legacybox'), supported, 'http:');
  assert.equal(applyServerPlaybackPolicy(local, { directEnabled: true, sourceProtocol: 'http:' }).transport, 'DIRECT_PROXY');
  assert.equal(applyServerPlaybackPolicy(local, { directEnabled: false, remuxEnabled: false }).playable, false);
  const incompatible = decideBrowserTransport(source('mp4', 'dts'), supported, 'http:');
  assert.equal(applyServerPlaybackPolicy(incompatible, { directEnabled: true, sourceProtocol: 'http:' }).transport, 'DIRECT_PROXY');
  assert.equal(applyServerPlaybackPolicy(incompatible, { directEnabled: false, remuxEnabled: true }).playable, false);
});
