import test from 'node:test';
import assert from 'node:assert/strict';
import { decideBrowserTransport, detectBrowserCapabilities, normalizeMediaMetadata, shouldFallbackFromDirect } from '../src/browser-transport.js';

const supported = { browser: { name: 'chrome', version: 145 }, containers: { mp4: true, webm: true }, mkvVerified: true,
  videoCodecs: { h264: true, hevc: true, vp8: true, vp9: true, av1: true }, audioCodecs: { aac: true, mp3: true, opus: true, vorbis: true, ac3: false, eac3: false, dts: false } };
const source = (container = 'matroska', audioCodec = 'aac', videoCodec = 'h264') => ({ container, videoCodec, videoProfile: 'High', videoLevel: 41, width: 1920, height: 1080, frameRate: '24000/1001', pixelFormat: 'yuv420p', videoBitDepth: 8, audioCodec, audioProfile: 'LC', audioChannels: 2, audioSampleRate: 48000 });

test('Chrome 145 directly plays compatible MKV and MP4', () => {
  assert.equal(decideBrowserTransport(source(), supported).transport, 'DIRECT');
  assert.equal(decideBrowserTransport(source('mp4'), supported).transport, 'DIRECT');
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

test('Chrome below 145 does not receive the MKV rule', () => {
  const caps = detectBrowserCapabilities({ userAgent: 'Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36', brands: [{ brand: 'Google Chrome', version: '144' }], mediaElement: { canPlayType: () => 'probably' } });
  assert.equal(caps.mkvVerified, false);
});

test('Chrome 145 client hints qualify for MKV evaluation', () => {
  const caps = detectBrowserCapabilities({ userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36', brands: [{ brand: 'Google Chrome', version: '145' }], mediaElement: { canPlayType: () => 'probably' } });
  assert.equal(caps.mkvVerified, true);
  assert.equal(decideBrowserTransport(source(), caps).transport, 'DIRECT');
});

test('Direct network and decode failures do not start remux', () => {
  assert.equal(shouldFallbackFromDirect(2, true), false);
  assert.equal(shouldFallbackFromDirect(3, true), false);
  assert.equal(shouldFallbackFromDirect(4, true), true);
  assert.equal(shouldFallbackFromDirect(4, false), false);
});

test('Provider HLS is Direct when the browser has native or MSE HLS support', () => {
  const caps = { ...supported, containers: { ...supported.containers, hls: true } };
  assert.equal(decideBrowserTransport(source('hls'), caps).transport, 'DIRECT');
});
