import { createHash } from 'node:crypto';
import { normalizeForComparison, normalizeWhitespace } from '../../shared/normalization.js';

export function createRequestFingerprint({
  requesterName,
  requestDateTime,
  clientMode,
  studentIdentity,
  programmeUrls = []
}) {
  const canonical = JSON.stringify({
    requester: normalizeForComparison(requesterName),
    requestDate: normalizeWhitespace(requestDateTime),
    clientMode: normalizeWhitespace(clientMode),
    student: normalizeForComparison(studentIdentity),
    programmeUrls: programmeUrls
      .map(normalizeUrl)
      .filter(Boolean)
      .sort()
  });

  return createHash('sha256').update(canonical).digest('hex');
}

function normalizeUrl(value) {
  const cleanValue = normalizeWhitespace(value);
  if (!cleanValue) {
    return '';
  }

  try {
    const url = new URL(cleanValue);
    url.hash = '';
    return url.toString();
  } catch {
    return cleanValue;
  }
}
