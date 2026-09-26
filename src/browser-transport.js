const clean = value => String(value || '').trim().toLowerCase();

export function normalizeMediaMetadata(raw = {}) {
  const containerText = clean(raw.container || raw.format_name || raw.formatName);
  const container = /matroska/.test(containerText) ? 'matroska'
    : /webm/.test(containerText) ? 'webm'
      : /(?:^|,)(?:mp4|m4v|mov|mov,)/.test(containerText) ? 'mp4'
        : containerText.split(',')[0] || 'unknown';
  const codec = value => {
    const input = clean(value).replace(/[^a-z0-9]/g, '');
    if (['avc', 'avc1', 'h264', 'x264'].includes(input)) return 'h264';
    if (['hevc', 'h265', 'hev1', 'hvc1', 'x265'].includes(input)) return 'hevc';
    if (input.startsWith('aac')) return 'aac';
    if (input === 'ac3') return 'ac3';
    if (input === 'eac3') return 'eac3';
    if (input.startsWith('dts')) return 'dts';
    return input;
  };
  return {
    container,
    video: {
      codec: codec(raw.videoCodec || raw.codecVideo), profile: clean(raw.videoProfile || raw.profile),
      level: Number(raw.videoLevel || raw.level) || 0, width: Number(raw.width) || 0, height: Number(raw.height) || 0,
      frameRate: Number(raw.frameRate) || (() => { const [n, d] = String(raw.frameRate || '').split('/').map(Number); return d ? n / d : 0; })(),
      pixelFormat: clean(raw.pixelFormat || raw.pixFmt), bitDepth: Number(raw.videoBitDepth || raw.bitDepth) || 0,
    },
    audio: {
      codec: codec(raw.audioCodec || raw.codecAudio), profile: clean(raw.audioProfile),
      channels: Number(raw.audioChannels || raw.channels) || 0, sampleRate: Number(raw.audioSampleRate || raw.sampleRate) || 0,
    },
    duration: Number(raw.containerSeconds || raw.duration) || 0, bitrate: Number(raw.probeBitrate || raw.bitrate) || 0,
  };
}

function uaIdentity(ua) {
  const value = String(ua || '');
  const match = value.match(/Edg\/(\d+)/i) || value.match(/(?:Chrome|CriOS)\/(\d+)/i) || value.match(/Firefox\/(\d+)/i) || value.match(/Version\/(\d+).*Safari/i);
  const name = /Edg\//i.test(value) ? 'edge' : /(?:Chrome|CriOS)\//i.test(value) ? (/Chromium/i.test(value) && !/Google Chrome|CriOS/i.test(value) ? 'chromium' : 'chrome') : /Firefox\//i.test(value) ? 'firefox' : /Safari/i.test(value) ? 'safari' : 'unknown';
  return { name, version: Number(match?.[1]) || 0 };
}

const canPlay = (media, mime) => {
  try { return Boolean(media?.canPlayType?.(mime)); } catch { return false; }
};

export function detectBrowserCapabilities({ userAgent = globalThis.navigator?.userAgent || '', mediaElement = globalThis.document?.createElement?.('video') } = {}) {
  const browser = uaIdentity(userAgent);
  const videoCodecs = {
    h264: canPlay(mediaElement, 'video/mp4; codecs="avc1.42E01E"'),
    hevc: canPlay(mediaElement, 'video/mp4; codecs="hvc1.1.6.L93.B0"'),
    vp8: canPlay(mediaElement, 'video/webm; codecs="vp8"'),
    vp9: canPlay(mediaElement, 'video/webm; codecs="vp9"'),
    av1: canPlay(mediaElement, 'video/mp4; codecs="av01.0.04M.08"'),
  };
  const audioCodecs = {
    aac: canPlay(mediaElement, 'audio/mp4; codecs="mp4a.40.2"'),
    mp3: canPlay(mediaElement, 'audio/mpeg'),
    opus: canPlay(mediaElement, 'audio/webm; codecs="opus"'),
    vorbis: canPlay(mediaElement, 'audio/webm; codecs="vorbis"'),
    ac3: canPlay(mediaElement, 'audio/mp4; codecs="ac-3"'),
    eac3: canPlay(mediaElement, 'audio/mp4; codecs="ec-3"'),
    dts: false,
  };
  const containerElement = mediaElement;
  const chromeMkv = browser.name === 'chrome' && browser.version >= 145;
  const edgeMkv = browser.name === 'edge'; // Verified RH target per Jellyfin browser compatibility table.
  const mkvFeature = canPlay(containerElement, 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"');
  const mkvVerified = chromeMkv || edgeMkv || (browser.name === 'chromium' && mkvFeature);
  return {
    browser, containers: { mp4: canPlay(mediaElement, 'video/mp4'), webm: canPlay(mediaElement, 'video/webm'), mkv: mkvVerified, hls: canPlay(mediaElement, 'application/vnd.apple.mpegurl') },
    videoCodecs, audioCodecs, mkvVerified,
  };
}

function codecSupport(codec, map) { return Boolean(codec && map?.[codec]); }

function videoParametersSupported(video) {
  if (!video.codec) return { ok: false, reason: 'Video codec could not be identified.' };
  const pix = video.pixelFormat;
  if (video.codec === 'h264') {
    if (video.bitDepth > 8 || (pix && !/^(yuvj?420p|nv12)$/.test(pix))) return { ok: false, reason: `H.264 pixel format ${pix || `${video.bitDepth}-bit`} is not browser-compatible.` };
    if (video.width > 4096 || video.height > 2160 || video.frameRate > 120) return { ok: false, reason: 'H.264 dimensions or frame rate exceed browser playback limits.' };
    if (video.level > 52) return { ok: false, reason: `H.264 level ${video.level} exceeds browser playback limits.` };
    if (video.profile && !/baseline|main|high|constrained baseline/i.test(video.profile)) return { ok: false, reason: `H.264 profile ${video.profile} is not supported.` };
  }
  if (video.codec === 'hevc' && video.bitDepth > 10) return { ok: false, reason: 'HEVC bit depth exceeds browser playback limits.' };
  return { ok: true, reason: '' };
}

export function decideBrowserTransport(rawMedia, capabilities) {
  const media = rawMedia?.video && rawMedia?.audio ? rawMedia : normalizeMediaMetadata(rawMedia);
  const browser = capabilities?.browser || { name: 'unknown', version: 0 };
  const container = media.container === 'matroska' ? 'mkv' : media.container;
  const videoSupported = codecSupport(media.video.codec, capabilities?.videoCodecs) && videoParametersSupported(media.video).ok;
  const audioSupported = !media.audio.codec || codecSupport(media.audio.codec, capabilities?.audioCodecs);
  const audioParametersSupported = !media.audio.codec || ((media.audio.channels <= 8 || !media.audio.channels) && (media.audio.sampleRate <= 96000 || !media.audio.sampleRate));
  const containerDirect = container === 'mp4' ? Boolean(capabilities?.containers?.mp4)
    : container === 'webm' ? Boolean(capabilities?.containers?.webm)
      : container === 'mkv' ? Boolean(capabilities?.mkvVerified || capabilities?.containers?.mkv) : false;
  const direct = containerDirect && videoSupported && audioSupported && audioParametersSupported;
  const remuxCompatible = videoSupported && audioSupported && audioParametersSupported && ['mp4', 'matroska', 'webm', 'avi', 'mpegts', 'mov', 'flv'].includes(media.container);
  let reason = '';
  if (direct) reason = `${browser.name} ${browser.version || ''} supports the source container and both probed codecs.`.trim();
  else if (!videoSupported) reason = media.video.codec ? `Video codec ${media.video.codec} or its parameters are unsupported; stream copy cannot change it.` : 'Video codec could not be identified; safe remux compatibility cannot be established.';
  else if (!audioSupported || !audioParametersSupported) reason = media.audio.codec ? `Audio codec ${media.audio.codec} or its parameters are unsupported; stream copy cannot change them.` : 'Audio codec could not be identified; safe remux compatibility cannot be established.';
  else if (remuxCompatible) reason = `The browser cannot reliably play ${media.container}; supported video and audio can be copied into HLS.`;
  else reason = `Container ${media.container} cannot be played or safely remuxed.`;
  const transport = direct ? 'DIRECT' : remuxCompatible ? 'HLS_REMUX' : 'UNSUPPORTED';
  return { transport, directCompatible: direct, containerCompatible: containerDirect, videoCompatible: videoSupported, audioCompatible: audioSupported, remuxCompatible, playable: transport !== 'UNSUPPORTED', reason, media, browser };
}

export async function browserCodecSupportFromMediaCapabilities(capabilities, media) {
  if (!globalThis.navigator?.mediaCapabilities?.decodingInfo || !media?.video?.codec) return capabilities;
  // canPlayType remains the baseline; MediaCapabilities can only positively add evidence.
  const mime = media.container === 'webm' ? 'video/webm' : 'video/mp4';
  const codecString = media.video.codec === 'h264' ? 'avc1.42E01E' : media.video.codec;
  try {
    const result = await navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: `${mime}; codecs="${codecString}"`, width: media.video.width || 1280, height: media.video.height || 720, bitrate: media.bitrate || 2_000_000, framerate: media.video.frameRate || 30 } });
    if (result.supported) capabilities.videoCodecs[media.video.codec] = true;
  } catch { /* Unsupported configuration is handled by the canPlayType signal. */ }
  return capabilities;
}
