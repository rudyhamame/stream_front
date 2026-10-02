import test from 'node:test';
import assert from 'node:assert/strict';
import { trackBrowserViewport } from '../src/browser-viewport.js';
function setup(visual = true) {
  const events = new Map(), frames = new Map(), styles = new Map(); let nextFrame = 0;
  const target = prefix => ({ addEventListener: (name, fn) => events.set(prefix + name, fn), removeEventListener: name => events.delete(prefix + name) });
  const viewport = { ...target('visual:'), height: 724.8, offsetTop: 0, scale: 1 };
  const window = { ...target('window:'), innerHeight: 844, visualViewport: visual ? viewport : null,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id) };
  const root = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) } };
  const stop = trackBrowserViewport(window, root);
  return { viewport, window, events, frames, styles, stop, flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}
test('uses visible Safari height instead of a larger layout viewport and follows keyboard changes', () => {
  const c = setup(); assert.equal(c.styles.get('--browser-viewport-height'), '724px');
  c.viewport.height = 410; c.viewport.offsetTop = 32;
  c.events.get('visual:resize')(); c.events.get('visual:scroll')(); assert.equal(c.frames.size, 1);
  c.flush(); assert.equal(c.styles.get('--browser-viewport-height'), '410px');
  assert.equal(c.styles.get('--browser-viewport-top'), '32px');
  c.viewport.height = 724; c.viewport.offsetTop = 0;
  c.events.get('visual:resize')(); c.flush();
  assert.equal(c.styles.get('--browser-viewport-top'), '0px');
});
test('pinch zoom does not shrink the layout or disable zoom', () => {
  const c = setup(); c.viewport.scale = 2; c.viewport.height = 360;
  c.events.get('visual:resize')(); c.flush();
  assert.equal(c.styles.get('--browser-viewport-height'), '724px');
});
test('fallback follows window size, and cleanup removes all listeners and pending work', () => {
  const c = setup(false); assert.equal(c.styles.get('--browser-viewport-height'), '844px');
  c.window.innerHeight = 650; c.events.get('window:resize')(); c.flush();
  assert.equal(c.styles.get('--browser-viewport-height'), '650px');
  c.events.get('window:resize')(); c.stop();
  assert.equal(c.frames.size, 0); assert.equal(c.events.size, 0); assert.equal(c.styles.size, 0);
});
