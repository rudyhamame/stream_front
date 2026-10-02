// Safari's visible viewport can differ from CSS viewport units after its
// toolbar or keyboard moves. Keep the app frame inside the visible bounds.
export function trackBrowserViewport(window, root) {
  const viewport = window.visualViewport;
  let frame = null;
  function update() {
    frame = null;
    // Do not resize the app around a user's pinch zoom.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport?.height || window.innerHeight;
    if (!Number.isFinite(height) || height <= 0) return;
    root.style.setProperty('--browser-viewport-height', `${Math.floor(height)}px`);
    root.style.setProperty('--browser-viewport-top', `${Math.max(0, viewport?.offsetTop || 0)}px`);
  }
  function schedule() { if (frame === null) frame = window.requestAnimationFrame(update); }
  const events = [[window, 'resize'], [window, 'orientationchange'], [window, 'pageshow']];
  if (viewport) events.push([viewport, 'resize'], [viewport, 'scroll']);
  events.forEach(([target, name]) => target.addEventListener(name, schedule));
  update();
  return () => {
    events.forEach(([target, name]) => target.removeEventListener(name, schedule));
    if (frame !== null) window.cancelAnimationFrame(frame);
    root.style.removeProperty('--browser-viewport-height');
    root.style.removeProperty('--browser-viewport-top');
  };
}
