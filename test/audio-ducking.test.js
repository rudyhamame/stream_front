import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioDucking } from '../src/audio-ducking.js';
function setup(volume = 0.8) {
  let time = 0, id = 0;
  const frames = new Map(), events = new Map();
  const media = { volume, muted: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const ducking = createAudioDucking({ now: () => time, requestFrame: fn => { frames.set(++id, fn); return id; }, cancelFrame: id => frames.delete(id) });
  ducking.setMedia(media);
  return { ducking, media, events, frames, tick(ms) { time += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}
test('speech smoothly ducks to a quarter of the chosen volume and restores it gradually', () => {
  const c = setup();
  c.ducking.setSpeaking(true);
  c.tick(110); assert.ok(c.media.volume > 0.2 && c.media.volume < 0.8);
  c.tick(110); assert.ok(Math.abs(c.media.volume - 0.2) < 1e-9);
  c.ducking.setSpeaking(false);
  c.tick(600); assert.ok(c.media.volume > 0.2 && c.media.volume < 0.8);
  c.tick(600); assert.equal(c.media.volume, 0.8);
});
test('manual mute is preserved and ending the call restores the original level and cancels animation', () => {
  const c = setup(0.6); c.media.muted = true;
  c.ducking.setSpeaking(true); c.tick(220);
  assert.equal(c.media.muted, true);
  c.ducking.reset(); c.tick(2000);
  assert.equal(c.media.volume, 0.6); assert.equal(c.frames.size, 0);
});
test('manual volume adjustment during restoration wins over the pending animation', () => {
  const c = setup(); c.ducking.setSpeaking(true); c.tick(220);
  c.ducking.setSpeaking(false); c.tick(300);
  c.media.volume = 0.4; c.events.get('volumechange')(); c.tick(2000);
  assert.equal(c.media.volume, 0.4);
  c.ducking.setSpeaking(true); c.tick(220); assert.ok(Math.abs(c.media.volume - 0.1) < 1e-9);
  c.ducking.reset(); assert.equal(c.media.volume, 0.4);
});
test('a replaced Video node does not leave the previous player attenuated', () => {
  const c = setup(); c.ducking.setSpeaking(true); c.tick(220);
  const next = { volume: 0.5, addEventListener() {}, removeEventListener() {} };
  c.ducking.setMedia(next); assert.equal(c.media.volume, 0.8);
  c.tick(220); assert.ok(Math.abs(next.volume - 0.125) < 1e-9);
  c.ducking.destroy(); assert.equal(next.volume, 0.5); assert.equal(c.frames.size, 0);
});

test('fade reports the applied volume without relying on native volumechange events', () => {
  let tick, time = 0;
  const reported = [];
  const media = { volume: 1, muted: false, addEventListener() {}, removeEventListener() {} };
  const ducking = createAudioDucking({ now: () => time, requestFrame: fn => { tick = fn; return 1; }, cancelFrame() {}, onVolume: video => reported.push(video.volume) });
  ducking.setMedia(media);
  ducking.setSpeaking(true);
  time = 110; tick();
  assert.equal(reported.at(-1), media.volume);
  assert.ok(reported.at(-1) < 1 && reported.at(-1) > 0.25);
  time = 220; tick();
  assert.equal(reported.at(-1), 0.25);
  ducking.reset();
  assert.equal(reported.at(-1), 1);
});
