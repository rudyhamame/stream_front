// Correct drift only using media the browser has actually downloaded. A host
// clock is a synchronization target, not proof that the guest can decode it.
export function partnerPlaybackAdjustment(current, expected, bufferedRanges, canSeek) {
  if (!Number.isFinite(current) || !Number.isFinite(expected)) return { rate: 1 };
  if (expected < 0) return { rate: current > 0 ? 0.93 : 1 };
  const target = expected;
  const drift = current - target;
  const magnitude = Math.abs(drift);
  const targetReady = bufferedRanges.some(([start, end]) => target >= start && target + 2 <= end);
  if (magnitude > 1.5 && canSeek && targetReady) return { seek: target, rate: 1 };
  if (magnitude <= 0.35) return { rate: 1 };
  // Slowing an ahead-of-host guest builds buffer. Catching up consumes buffer,
  // so never speed up towards a host position that is not safely buffered.
  return { rate: drift > 0 ? 0.93 : targetReady ? 1.07 : 1 };
}
