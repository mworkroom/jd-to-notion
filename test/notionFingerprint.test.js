import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestFingerprint } from '../src/server/notion/fingerprint.js';

test('request fingerprint is stable across whitespace and programme URL order', () => {
  const first = createRequestFingerprint({
    requesterName: ' Requester ',
    requestDateTime: '2026-07-24T10:00:00+09:00',
    clientMode: 'new',
    studentIdentity: ' Kim ',
    programmeUrls: [
      'https://example.test/b#details',
      'https://example.test/a'
    ]
  });
  const second = createRequestFingerprint({
    requesterName: 'requester',
    requestDateTime: '2026-07-24T10:00:00+09:00',
    clientMode: 'new',
    studentIdentity: 'kim',
    programmeUrls: [
      'https://example.test/a',
      'https://example.test/b'
    ]
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});
