import { createHash } from 'node:crypto';
import { normalizeForComparison, normalizeWhitespace } from '../../shared/normalization.js';

export function createRequestFingerprint({
  requestType = 'admissions',
  requesterName,
  requestDateTime,
  clientMode,
  studentIdentity,
  programmeUrls = [],
  reviewRound,
  language,
  majorId
}) {
  if (requestType === 'sop_review') {
    const canonical = JSON.stringify({
      requestType,
      requester: normalizeForComparison(requesterName),
      requestDate: normalizeWhitespace(requestDateTime),
      student: normalizeWhitespace(studentIdentity),
      reviewRound: Number(reviewRound),
      language: normalizeWhitespace(language),
      majorId: normalizeWhitespace(majorId)
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

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
