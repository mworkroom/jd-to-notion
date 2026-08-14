import { deriveProgrammeFields, normalizeWhitespace } from '../../shared/normalization.js';
import { isKnownUniversityAlias, resolveUniversityName } from '../universities/universityAliases.js';
import { DEGREE_LABELS, DEGREE_LABEL_TYPOS } from '../../shared/degreeLabels.js';
import {
  SOP_REQUEST_TYPE,
  detectRequestType,
  extractSopLanguage,
  extractSopReviewRound
} from '../../shared/sopReview.js';

const URL_PATTERN = /(?:https?:\/\/[^\]\s)]+|www\.[^\]\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\]\s)]*)/i;
const DATE_PATTERN = /(\d{4})[/.](\d{1,2})[/.](\d{1,2})\s*(AM|PM)?\s*(\d{1,2}):(\d{2})/i;
const DEGREE_LABEL_PATTERN = [...DEGREE_LABELS, ...DEGREE_LABEL_TYPOS]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

export function mockExtractJandiMessage(message) {
  const requestType = detectRequestType(message);
  const lines = joinWrappedUrlLines(String(message ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean));

  const requestDateLine = lines.find((line) => DATE_PATTERN.test(line)) ?? '';
  const requesterName = extractRequesterName(lines, requestDateLine);
  const studentName = extractStudentName(lines);
  const requestDateTime = parseJandiDateTime(requestDateLine);
  const programmeExtraction = requestType === SOP_REQUEST_TYPE
    ? { programmes: [], warnings: [] }
    : extractProgrammes(lines);
  const programmes = programmeExtraction.programmes.map(deriveProgrammeFields);
  const sopReview = requestType === SOP_REQUEST_TYPE
    ? {
        round: extractSopReviewRound(message).value,
        language: extractSopLanguage(message)
      }
    : null;

  return {
    requestType,
    requesterName,
    requestDateTime,
    studentName,
    programmes,
    extractionWarnings: programmeExtraction.warnings,
    sopReview
  };
}

export function validateExtraction(extraction) {
  const errors = {};

  if (!extraction.requesterName) {
    errors.requesterName = 'Requester name is required.';
  }

  if (!extraction.requestDateTime) {
    errors.requestDateTime = 'Request date/time is required.';
  }

  if (!extraction.studentName) {
    errors.studentName = 'Student name is required.';
  }

  if (extraction.requestType === SOP_REQUEST_TYPE && !extraction.sopReview?.round) {
    errors.sopReviewRound = 'SOP review round must be 1, 2, or 3 and cannot be ambiguous.';
  }

  if (extraction.requestType !== SOP_REQUEST_TYPE
    && (!Array.isArray(extraction.programmes) || extraction.programmes.length === 0)) {
    errors.programmes = 'At least one programme is required.';
  } else if (extraction.requestType !== SOP_REQUEST_TYPE) {
    extraction.programmes.forEach((programme, index) => {
      if (!programme.universityName) {
        errors[`programmes.${index}.universityName`] = 'University name is required.';
      }
      if (!programme.programmeNameOriginal) {
        errors[`programmes.${index}.programmeNameOriginal`] = 'Programme name is required.';
      }
      if (!programme.programmeUrl) {
        errors[`programmes.${index}.programmeUrl`] = 'Programme URL is required.';
      }
    });
  }

  return errors;
}

function extractRequesterName(lines, requestDateLine) {
  const dateIndex = lines.indexOf(requestDateLine);
  const requesterLine = dateIndex > 0 ? lines[dateIndex - 1] : lines[0];
  return stripLeadingMarkers(requesterLine);
}

function extractStudentName(lines) {
  for (const line of lines) {
    const requestTitleMatch = line.match(
      /^\[(?:업무요청|입학요강)(?:\]|\s)+\s*([\p{Script=Hangul}]{2,5})(?=\s|_|님|학생)/u
    );
    if (requestTitleMatch) {
      return extractKoreanName(requestTitleMatch[1]);
    }

    const bracketMatch = line.match(/\[[^\]]+\]\s*(.+?)(?:\s+입학요강|\s*$)/u);
    if (bracketMatch) {
      return extractKoreanName(bracketMatch[1]);
    }

    const sentenceMatch = line.match(/^(.+?)님\s+입학요강/u);
    if (sentenceMatch) {
      return extractKoreanName(sentenceMatch[1]);
    }
  }

  return '';
}

function extractKoreanName(value) {
  const cleaned = normalizeWhitespace(value).replace(/\s*님(?=\s|$)/u, '');
  const koreanName = cleaned.match(/[\p{Script=Hangul}]{2,5}/u);
  return koreanName ? koreanName[0] : cleaned;
}

function extractProgrammes(lines) {
  const programmes = [];
  const warnings = [];
  let currentUniversityName = '';
  let pendingProgrammeName = '';
  let sharedProgrammeName = '';

  for (const line of lines) {
    if (
      programmes.length > 0
      && !pendingProgrammeName
      && isPostProgrammeNotesBoundary(line)
    ) {
      break;
    }

    if (isNonProgrammeContextLine(line)) {
      continue;
    }

    const requestedSharedProgramme = extractSharedProgrammeName(line);
    if (requestedSharedProgramme) {
      sharedProgrammeName = requestedSharedProgramme;
      continue;
    }

    if (isAttachmentFilename(line) || isNarrativeProseLine(line)) {
      continue;
    }

    const urlInfo = extractUrlInfo(line);
    if (urlInfo.url) {
      const inlineProgrammeName = extractProgrammeNameFromUrlLine(line, urlInfo);
      const programmeName = pendingProgrammeName || inlineProgrammeName || sharedProgrammeName;

      if (programmeName) {
        const university = resolveUniversityName(currentUniversityName, urlInfo.url);
        const writtenUniversity = resolveUniversityName(currentUniversityName);
        const programmeIndex = programmes.length;

        if (
          university.universityAliasMatchSource === 'domain'
          && writtenUniversity.universityAliasMatched
          && writtenUniversity.universityName !== university.universityName
        ) {
          warnings.push({
            code: 'university_domain_conflict',
            severity: 'error',
            programmeIndex,
            writtenUniversityName: writtenUniversity.universityName,
            domainUniversityName: university.universityName,
            programmeName,
            programmeUrl: urlInfo.url
          });
        }

        programmes.push({
          rawUniversityName: university.rawUniversityName,
          universityName: university.universityName,
          universityAliasMatched: university.universityAliasMatched,
          universityAliasMatchSource: university.universityAliasMatchSource,
          programmeNameOriginal: programmeName,
          programmeUrl: urlInfo.url
        });
        pendingProgrammeName = '';
      } else {
        warnings.push({
          code: 'orphan_url',
          severity: 'error',
          programmeUrl: urlInfo.url
        });
      }
      continue;
    }

    if (isProgrammeMetadataLine(line)) {
      continue;
    }

    if (isSupplementaryProgrammeNote(line) && pendingProgrammeName) {
      continue;
    }

    const universityProgramme = splitUniversityProgrammeLine(line);
    if (universityProgramme) {
      addMissingUrlWarning(warnings, currentUniversityName, pendingProgrammeName);
      currentUniversityName = universityProgramme.universityName;
      pendingProgrammeName = universityProgramme.programmeName;
      continue;
    }

    if (isProgrammeLine(line)) {
      addMissingUrlWarning(warnings, currentUniversityName, pendingProgrammeName);
      pendingProgrammeName = stripProgrammeBullet(line);
      continue;
    }

    if (isUniversityLine(line)) {
      addMissingUrlWarning(warnings, currentUniversityName, pendingProgrammeName);
      currentUniversityName = normalizeUniversityHeader(line);
      pendingProgrammeName = '';
      continue;
    }

    if ((currentUniversityName || hasRecognizedDegreeLabel(line)) && isProgrammeNameCandidate(line)) {
      addMissingUrlWarning(warnings, currentUniversityName, pendingProgrammeName);
      pendingProgrammeName = stripProgrammeBullet(line);
    }
  }

  addMissingUrlWarning(warnings, currentUniversityName, pendingProgrammeName);

  return { programmes, warnings };
}

function joinWrappedUrlLines(lines) {
  const joined = [];

  for (const line of lines) {
    const previous = joined.at(-1);
    if (previous && isWrappedUrlStart(previous) && isUrlPathContinuation(line)) {
      joined[joined.length - 1] = `${previous}${line}`;
      continue;
    }

    joined.push(line);
  }

  return joined;
}

function isWrappedUrlStart(value) {
  const url = extractUrl(value);
  return Boolean(url) && url === value && url.endsWith('/');
}

function isUrlPathContinuation(value) {
  return /^[a-z0-9][a-z0-9-]*(?:\.[a-z]{2,5})?(?:[?#].*)?$/.test(value);
}

function addMissingUrlWarning(warnings, universityName, programmeName) {
  if (!universityName || !programmeName) {
    return;
  }

  warnings.push({
    code: 'missing_programme_url',
    severity: 'warning',
    writtenUniversityName: universityName,
    programmeName
  });
}

function extractUrl(value) {
  return extractUrlInfo(value).url;
}

function extractUrlInfo(value) {
  const raw = String(value ?? '');
  const markdownLink = raw.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownLink) {
    return {
      url: markdownLink[2],
      label: markdownLink[1]
    };
  }

  const matchedUrl = raw.match(URL_PATTERN)?.[0] ?? '';
  return {
    url: matchedUrl && !/^https?:\/\//i.test(matchedUrl)
      ? `https://${matchedUrl}`
      : matchedUrl,
    label: ''
  };
}

function extractProgrammeNameFromUrlLine(line, urlInfo) {
  if (urlInfo.label && !/^https?:\/\//i.test(urlInfo.label)) {
    return stripProgrammeBullet(urlInfo.label);
  }

  const beforeUrl = normalizeWhitespace(String(line ?? '').replace(urlInfo.url, ''));
  const withoutMarkdownSyntax = beforeUrl.replace(/[\[\]()]/g, '');
  return stripProgrammeBullet(withoutMarkdownSyntax);
}

function splitUniversityProgrammeLine(value) {
  const hasNumberedListMarker = /^\s*\d+\s*[.)]\s*/u.test(String(value ?? ''));
  const raw = stripLeadingMarkers(value);

  const universityOfLondonProgrammeMatch = raw.match(
    /^(.+?),\s*University of London\s*[/:-]\s*(.+)$/iu
  );
  if (universityOfLondonProgrammeMatch) {
    return {
      universityName: `${universityOfLondonProgrammeMatch[1]}, University of London`,
      programmeName: stripProgrammeBullet(universityOfLondonProgrammeMatch[2])
    };
  }

  if (/^.+?,\s*University of London\s*$/i.test(raw)) {
    return null;
  }

  const acronymHeaderMatch = raw.match(/^(.+?)\s*\(([A-Z]{2,8})\)\s*$/u);
  if (
    acronymHeaderMatch
    && !hasRecognizedDegreeLabel(acronymHeaderMatch[2])
    && (
      isUniversityLine(acronymHeaderMatch[1])
      || isKnownUniversityAlias(acronymHeaderMatch[2])
    )
  ) {
    return null;
  }

  const knownPrefixMatch = splitKnownUniversityProgrammePrefix(raw, hasNumberedListMarker);
  if (knownPrefixMatch) {
    return knownPrefixMatch;
  }

  const universitySuffixMatch = raw.match(/^(.+?\bUniversity)\s+(.+)$/iu);
  if (universitySuffixMatch && hasRecognizedDegreeLabel(universitySuffixMatch[2])) {
    return {
      universityName: normalizeUniversityHeader(universitySuffixMatch[1]),
      programmeName: stripProgrammeBullet(universitySuffixMatch[2])
    };
  }

  const reversedColonMatch = raw.match(/^(.+?)\s*:\s*(.+)$/u);
  if (reversedColonMatch) {
    const programmeName = stripProgrammeBullet(reversedColonMatch[1]);
    const universityName = normalizeUniversityHeader(reversedColonMatch[2]);

    if (
      programmeName
      && universityName
      && hasRecognizedDegreeLabel(programmeName)
      && isUniversityLine(universityName)
    ) {
      return {
        universityName,
        programmeName
      };
    }
  }

  const delimiterMatch = raw.match(/^(.+?)\s*(?:[-–—/,:])\s*(.+)$/u);
  if (delimiterMatch) {
    const universityName = stripLeadingMarkers(delimiterMatch[1]);
    const programmeName = stripProgrammeBullet(delimiterMatch[2]);
    const numberedUnknownUniversity = hasNumberedListMarker
      && /^[A-Za-z\p{Script=Hangul}][A-Za-z\p{Script=Hangul}&.'’ -]{1,40}$/u.test(universityName)
      && /[A-Za-z]/u.test(programmeName);

    if (
      universityName
      && programmeName
      && (isUniversityProgrammePrefix(universityName, programmeName) || numberedUnknownUniversity)
    ) {
      return {
        universityName,
        programmeName
      };
    }
  }

  const parentheticalMatch = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/u);
  if (parentheticalMatch && isUniversityLine(parentheticalMatch[1])) {
    return {
      universityName: stripLeadingMarkers(parentheticalMatch[1]),
      programmeName: stripProgrammeBullet(parentheticalMatch[2])
    };
  }

  const degreeLedMatch = raw.match(
    new RegExp(`^(.+?)\\s+((?:${DEGREE_LABEL_PATTERN})\\b.+)$`, 'iu')
  );
  if (degreeLedMatch && isUniversityProgrammePrefix(degreeLedMatch[1], degreeLedMatch[2])) {
    return {
      universityName: stripLeadingMarkers(degreeLedMatch[1]),
      programmeName: stripProgrammeBullet(degreeLedMatch[2])
    };
  }

  return null;
}

function splitKnownUniversityProgrammePrefix(value, allowUnlabeledProgramme = false) {
  for (let index = value.length - 1; index > 0; index -= 1) {
    if (!/\s/u.test(value[index])) {
      continue;
    }

    const universityName = normalizeWhitespace(value.slice(0, index));
    const programmeName = stripProgrammeBullet(value.slice(index));
    const isInstitutionSuffixOnly = /^(?:University|College|Institute|School)$/i.test(programmeName);
    if (
      isKnownUniversityAlias(normalizeUniversityHeader(universityName))
      && !isInstitutionSuffixOnly
      && (
        hasRecognizedDegreeLabel(programmeName)
        || (allowUnlabeledProgramme && /[A-Za-z]/u.test(programmeName))
      )
    ) {
      return {
        universityName: normalizeUniversityHeader(universityName),
        programmeName
      };
    }
  }

  return null;
}

function isUniversityProgrammePrefix(universityName, programmeName) {
  return isUniversityLine(universityName)
    || (
      /^[\p{Script=Hangul}\s]{2,20}$/u.test(normalizeWhitespace(universityName))
      && /[A-Za-z]/u.test(programmeName)
    );
}

function isProgrammeLine(value) {
  return /^[-•*]\s*\S/.test(value);
}

function isProgrammeNameCandidate(value) {
  return /[A-Za-z]/.test(value);
}

function isSupplementaryProgrammeNote(value) {
  return /^\([^)]*\)$/u.test(value);
}

function isProgrammeMetadataLine(value) {
  const raw = normalizeWhitespace(value);
  return /^(?:Department|Faculty|Division)\s+of\b/i.test(raw)
    || /\bUnit\b.*(?:\([A-Z]{2,}\)|,\s*[A-Z]{2,})/u.test(raw);
}

function isPostProgrammeNotesBoundary(value) {
  return /^(?:특이사항|참고사항|학생\s*특이사항|추가\s*사항)\s*[:：]/u.test(
    normalizeWhitespace(value)
  );
}

function isAttachmentFilename(value) {
  return /\.(?:pdf|docx?|xlsx?|pptx?|hwp|hwpx|csv|png|jpe?g|gif)(?:\s|$)/i.test(
    normalizeWhitespace(value)
  );
}

function isNarrativeProseLine(value) {
  const raw = normalizeWhitespace(value);
  if (!/^[\p{Script=Hangul}]/u.test(raw)) {
    return false;
  }

  return /(?:부탁드립니다|부탁드리겠습니다|해주세요|드립니다|학생입니다|있습니다|있는데|가능하시다면|안된다면)[\s.!?~:)]*$/u.test(raw)
    || (
      raw.length >= 30
      && /(?:학생|성적|과목|요건|조건|지원|전공|정리|확인)/u.test(raw)
    );
}

function isNonProgrammeContextLine(value) {
  const raw = normalizeWhitespace(value);
  return /^\[(?:업무요청|입학요강)(?:\]|\s)/u.test(raw)
    || /@[^\s]+/u.test(raw)
    || /@Marion\s+Lee/i.test(raw)
    || /^(?:안녕하세요|안녕하십니까)[\s,.:)~!^^]*/u.test(raw);
}

function extractSharedProgrammeName(value) {
  const raw = normalizeWhitespace(value);
  if (!/(?:입학\s*요강|요강\s*정리|요강)/u.test(raw)) {
    return '';
  }

  const match = raw.match(new RegExp(`(?:^|\\s)(${DEGREE_LABEL_PATTERN})(?=\\s|$)`, 'i'));
  return match ? match[1] : '';
}

function hasRecognizedDegreeLabel(value) {
  return new RegExp(`(?:^|\\s)(?:${DEGREE_LABEL_PATTERN})(?:\\b|\\))`, 'i').test(value);
}

function isUniversityLine(value) {
  const raw = stripLeadingMarkers(value);
  const cleaned = normalizeUniversityHeader(value);
  const hasNumberedListMarker = /^\s*\d+\s*[.)]\s*/u.test(String(value ?? ''));
  if (new RegExp(`^(?:${DEGREE_LABEL_PATTERN})$`, 'i').test(cleaned)) {
    return false;
  }

  return isKnownUniversityAlias(cleaned)
    || /\b(Uni|University|Univerisity|College|Institute|School)\b/i.test(raw)
    || /대학교\s*$/u.test(raw)
    || /^[A-Z]{3,8}$/.test(cleaned)
    || (
      hasNumberedListMarker
      && /^[A-Za-z][A-Za-z&.' -]{1,40}$/.test(cleaned)
      && !hasRecognizedDegreeLabel(cleaned)
    );
}

function normalizeUniversityHeader(value) {
  return stripLeadingMarkers(value)
    .replace(/\]+\s*$/u, '')
    .replace(/\s*\([A-Z]{2,8}\)\s*$/u, '')
    .replace(/,\s*University of London\s*$/i, '')
    .replace(/\s*대학교\s*$/u, '')
    .replace(/[_-]\s*\d+\s*개월\s*$/u, '')
    .replace(/\s*[-–—/:,]+\s*$/u, '');
}
function parseJandiDateTime(value) {
  const match = String(value ?? '').match(DATE_PATTERN);
  if (!match) {
    return '';
  }

  const [, year, month, day, meridiem, rawHour, minute] = match;
  let hour = Number(rawHour);

  if (meridiem?.toUpperCase() === 'PM' && hour < 12) {
    hour += 12;
  }

  if (meridiem?.toUpperCase() === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`;
}

function findPreviousLineIndex(lines, startIndex, predicate) {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (predicate(lines[index])) {
      return index;
    }
  }

  return -1;
}

function stripProgrammeBullet(value) {
  return normalizeWhitespace(String(value ?? '')
    .replace(/^\s*\d+\s*[.)]\s*[-•*]?\s*/u, '')
    .replace(/^[-•*]\s*/u, ''));
}

function stripLeadingMarkers(value) {
  const withoutDecorations = String(value ?? '').replace(/^[^\p{L}\p{N}]+/u, '');
  const withoutListNumber = withoutDecorations.replace(/^\d+\s*[.)]\s*/u, '');
  const withoutPostNumberDecorations = withoutListNumber.replace(/^[^\p{L}\p{N}]+/u, '');
  return normalizeWhitespace(withoutPostNumberDecorations);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

