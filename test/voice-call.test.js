import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
function callUrl(guest) {
  const code = app.slice(app.indexOf('const webCallUrl = computed('), app.indexOf('const webFullscreen ='));
  const context = vm.createContext({ URLSearchParams, encodeURIComponent, computed: fn => fn(),
    browserStreamer: 'https://iptv-stream.mctoshs.ca', webWwpSessionId: { value: 'shared-session' },
    webIsWwpGuest: { value: guest }, webStreamTicket: { value: 'host-issued-invite' },
    deviceToken: { value: 'own-device' }, webCallRole: { value: 'caller' }, partnerName: { value: 'Partner' } });
  vm.runInContext(code + '\nresult = webCallUrl;', context);
  return new URL(context.result);
}
test('host voice call uses its durable device token rather than an invitation ticket', () => {
  assert.equal(callUrl(false).searchParams.get('t'), 'own-device');
});
test('guest voice call uses the host-issued invite without its own account token', () => {
  assert.equal(callUrl(true).searchParams.get('t'), 'host-issued-invite');
});

test('only the active call iframe and session can change player ducking', () => {
  const code = app.slice(app.indexOf('function onWwpCallMessage('), app.indexOf('function openCategoryItems('));
  const frame = {}, updates = [];
  const context = vm.createContext({ URL, webCallFrame: { value: { contentWindow: frame } },
    webCallUrl: { value: 'https://iptv-stream.mctoshs.ca/call' }, webWwpSessionId: { value: 'session' },
    webCallActive: { value: true }, webAudioDucking: { setSpeaking: value => updates.push(value) } });
  vm.runInContext(code, context);
  const event = { source: frame, origin: 'https://iptv-stream.mctoshs.ca', data: { wwpCall: 'speaking', sessionId: 'session', speaking: true } };
  context.onWwpCallMessage({ ...event, source: {} });
  context.onWwpCallMessage({ ...event, origin: 'https://foreign.invalid' });
  context.onWwpCallMessage({ ...event, data: { ...event.data, sessionId: 'old-session' } });
  assert.deepEqual(updates, []);
  context.onWwpCallMessage(event); assert.deepEqual(updates, [true]);
  context.webCallActive.value = false;
  context.onWwpCallMessage(event); assert.deepEqual(updates, [true]);
});
