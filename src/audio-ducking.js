export function createAudioDucking({ requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now() } = {}) {
  let media = null, baseVolume = 1, writtenVolume = null, speaking = false, frame = null;
  function cancel() { if (frame !== null) cancelFrame(frame); frame = null; }
  function write(volume) {
    if (!media) return;
    writtenVolume = Math.min(1, Math.max(0, volume));
    media.volume = writtenVolume;
  }
  function fade() {
    cancel();
    if (!media) return;
    const from = media.volume, target = baseVolume * (speaking ? 0.25 : 1);
    const start = now(), duration = speaking ? 220 : 1200;
    function step() {
      const progress = Math.min(1, Math.max(0, (now() - start) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      write(from + (target - from) * eased);
      frame = progress < 1 ? requestFrame(step) : null;
    }
    frame = requestFrame(step);
  }
  function volumeChanged() {
    if (!media || (writtenVolume !== null && Math.abs(media.volume - writtenVolume) < 0.00001)) return;
    baseVolume = media.volume;
    if (speaking) fade();
    else cancel();
  }
  return {
    setMedia(next) {
      if (next === media) return;
      cancel();
      if (media) { media.removeEventListener('volumechange', volumeChanged); write(baseVolume); }
      media = next; writtenVolume = null;
      if (media) { baseVolume = media.volume; media.addEventListener('volumechange', volumeChanged); if (speaking) fade(); }
    },
    setSpeaking(next) {
      next = Boolean(next);
      if (next === speaking) return;
      speaking = next;
      fade();
    },
    reset() { cancel(); speaking = false; write(baseVolume); },
    destroy() { this.reset(); this.setMedia(null); },
  };
}
