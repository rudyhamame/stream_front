import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerPlaybackAdjustment as adjust } from '../src/partner-playback-sync.js';

test('a host ahead of downloaded media cannot force an unbuffered seek or acceleration', () => {
  assert.deepEqual(adjust(10, 15, [[0, 12]], true), { rate: 1 });
  assert.deepEqual(adjust(10, 15, [], true), { rate: 1 });
});
test('the final two buffered seconds remain a safety margin during catch-up', () => {
  assert.deepEqual(adjust(10, 11, [[0, 12]], true), { rate: 1 });
  assert.deepEqual(adjust(10, 11, [[0, 14]], true), { rate: 1.07 });
});
test('a buffered host target permits synchronization while preserving the seek cooldown', () => {
  assert.deepEqual(adjust(10, 15, [[0, 20]], true), { seek: 15, rate: 1 });
  assert.deepEqual(adjust(10, 15, [[0, 20]], false), { rate: 1.07 });
});
test('a gap between downloaded ranges is not a playable synchronization target', () => {
  assert.deepEqual(adjust(10, 15, [[0, 12], [18, 24]], true), { rate: 1 });
});
test('an ahead-of-host guest slows safely and returns to normal once aligned', () => {
  assert.deepEqual(adjust(15, 10, [[12, 20]], true), { rate: 0.93 });
  assert.deepEqual(adjust(10.2, 10, [[0, 12]], true), { rate: 1 });
});
test('nonzero HLS offsets use native buffered coordinates without clamping a target before the generation', () => {
  assert.deepEqual(adjust(5, -2, [[3, 12]], true), { rate: 0.93 });
  assert.deepEqual(adjust(5, -2, [[0, 12]], true), { rate: 0.93 });
  assert.deepEqual(adjust(5, 8, [[3, 12]], true), { seek: 8, rate: 1 });
});
