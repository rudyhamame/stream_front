import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCatalogTitles, describeEncodeStrategy, formatTime, normalizeSearchText, parseDuration } from '../src/catalog-format.js';

test('catalog search normalization folds Arabic spelling and digits', () => {
  assert.equal(normalizeSearchText('  إِخْتِبَار ١۲  '), 'اختبار 12');
});

test('catalog titles sort naturally and use stable keys for ties', () => {
  assert.ok(compareCatalogTitles({ title: 'Episode 2' }, { title: 'Episode 10' }) < 0);
  assert.ok(compareCatalogTitles({ title: 'Same', key: 'a' }, { title: 'Same', key: 'b' }) < 0);
});

test('playback time and duration formatting preserves UI behavior', () => {
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3661), '1:01:01');
  assert.equal(parseDuration('01:01:01'), 3661);
  assert.equal(parseDuration(-4), 0);
});

test('streaming strategies have stable user-facing labels', () => {
  assert.equal(describeEncodeStrategy('DIRECT'), 'DIRECT');
  assert.equal(describeEncodeStrategy('HLS_AUDIO_TRANSCODE'), 'HLS AUDIO TRANSCODE');
  assert.equal(describeEncodeStrategy('UNKNOWN'), '');
});
