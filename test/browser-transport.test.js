import test from 'node:test';
import assert from 'node:assert/strict';
import { decideBrowserTransport, detectBrowserCapabilities, normalizeMediaMetadata } from '../src/browser-transport.js';

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

test('Firefox and Safari remux MKV only when both codecs can be copied', () => {
  for (const name of ['firefox', 'safari']) {
    assert.equal(decideBrowserTransport(source(), { ...supported, browser: { name, version: 140 }, mkvVerified: false }).transport, 'HLS_REMUX');
    assert.equal(decideBrowserTransport(source('matroska', 'dts'), { ...supported, browser: { name, version: 140 }, mkvVerified: false }).transport, 'UNSUPPORTED');
  }
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
  const caps = detectBrowserCapabilities({ userAgent: 'Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36', mediaElement: { canPlayType: () => 'probably' } });
  assert.equal(caps.mkvVerified, false);
});
