import test from 'node:test';
import assert from 'node:assert/strict';
import { describePartnerStatus } from '../src/partner-status.js';

test('partner status distinguishes activity, missing reciprocal links, and unavailable checks', () => {
  assert.equal(describePartnerStatus({}).label, 'Checking…');
  assert.equal(describePartnerStatus({ checked: true, linked: true, online: true }).label, 'Online');
  assert.equal(describePartnerStatus({ checked: true, linked: true, online: false }).label, 'Offline');
  assert.equal(describePartnerStatus({ checked: true, linked: false, online: true }).label, 'Not linked');
  assert.equal(describePartnerStatus({ checked: true, linked: true, online: true, error: true }).label, 'Status unavailable');
  assert.match(describePartnerStatus({ checked: true, linked: false }).detail, /exact profile code/);
});
