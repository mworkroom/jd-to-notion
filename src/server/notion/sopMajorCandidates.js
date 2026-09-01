import { getMajorSearchKey, normalizeWhitespace } from '../../shared/normalization.js';
import { REQUEST_SEASON } from '../../shared/workLog.js';

const EXACT_FIRST_TITLE = '입학 요강 1';
const PLAIN_TITLE = '입학 요강';
const NUMBERED_TITLE_PATTERN = /^입학 요강\s+(\d+)$/u;
const SOP_WORK_LOG_TITLE_PATTERN = /^SOP\s+([1-3])차\s+감수(?:\((?:영문|국문)\))?$/u;
export const SOP_PLACEHOLDER_UNIVERSITY_NAME = 'Jandi';
export const SOP_PLACEHOLDER_MAJOR_NAME = 'Unknown';

export async function buildSopMajorCandidatePreview({
  repositories,
  studentId,
  selectedMajorId = '',
  reviewRound = 1,
  requestSeason = REQUEST_SEASON
}) {
  if (!studentId) {
    return emptyPreview();
  }

  const admissionsWorkLogs = await repositories.workLogs.findAdmissionsLogsWithMajorsForStudent(studentId);
  const previousRound = Number(reviewRound) - 1;
  const previousSopWorkLogs = previousRound >= 1
    ? (await repositories.workLogs.findSopLogsWithMajorsForStudent(studentId)).filter((workLog) => (
        workLog.requestSeason === requestSeason
        && getSopRoundFromWorkLogTitle(workLog.title) === previousRound
      ))
    : [];
  const eligibleAdmissionsLogs = admissionsWorkLogs.filter((workLog) => workLog.majorIds.length === 1);
  const eligiblePreviousSopLogs = previousSopWorkLogs.filter((workLog) => workLog.majorIds.length === 1);
  const candidateWorkLogs = [...eligibleAdmissionsLogs, ...eligiblePreviousSopLogs];
  const candidateMap = new Map();

  for (const workLog of candidateWorkLogs) {
    const majorId = workLog.majorIds[0];
    let candidate = candidateMap.get(majorId);
    if (!candidate) {
      const major = await repositories.majors.getById(majorId);
      if (major.universityIds.length !== 1) {
        continue;
      }
      const university = await repositories.universities.getById(major.universityIds[0]);
      candidate = {
        id: major.id,
        name: major.name,
        url: major.url,
        university,
        sourceWorkLogs: []
      };
      candidateMap.set(majorId, candidate);
    }
    candidate.sourceWorkLogs.push({
      id: workLog.id,
      title: normalizeWhitespace(workLog.title),
      category: workLog.category,
      createdTime: workLog.createdTime
    });
  }

  const candidates = [...candidateMap.values()].sort(compareCandidates);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const admissionsCandidateIds = uniqueEligibleMajorIds(eligibleAdmissionsLogs, candidateIds);
  const requestedSelection = normalizeWhitespace(selectedMajorId);
  const automaticSelection = selectPreviousSopMajorId(
    previousSopWorkLogs,
    candidateIds,
    previousRound
  ) ?? selectDefaultMajorId(eligibleAdmissionsLogs, candidateIds, admissionsCandidateIds);
  const resolvedSelection = requestedSelection && candidateIds.has(requestedSelection)
    ? { selectedMajorId: requestedSelection, selectionReason: 'manual' }
    : automaticSelection;

  return {
    candidates,
    selectedMajorId: resolvedSelection.selectedMajorId,
    selectionReason: resolvedSelection.selectionReason,
    selectionSourceRound: resolvedSelection.selectionSourceRound ?? null,
    skippedWorkLogCount: admissionsWorkLogs.length - eligibleAdmissionsLogs.length
      + previousSopWorkLogs.length - eligiblePreviousSopLogs.length,
    selected: candidates.find((candidate) => candidate.id === resolvedSelection.selectedMajorId) ?? null
  };
}

export async function buildSopPlaceholderMajorPreview({ repositories, selectedMajorId = '' }) {
  const universityMatch = await repositories.universities.findByExactName(
    SOP_PLACEHOLDER_UNIVERSITY_NAME
  );
  if (universityMatch.status !== 'matched') {
    return {
      ...emptyPreview(),
      isPlaceholder: true,
      placeholderIssue: universityMatch.status === 'ambiguous'
        ? 'Jandi University placeholder matched multiple rows.'
        : 'Jandi University placeholder was not found.'
    };
  }

  const majorMatch = await repositories.majors.findByUniversityAndKey({
    universityId: universityMatch.selected.id,
    majorSearchKey: getMajorSearchKey(SOP_PLACEHOLDER_MAJOR_NAME),
    requestedOriginalName: SOP_PLACEHOLDER_MAJOR_NAME,
    proposedCreateName: SOP_PLACEHOLDER_MAJOR_NAME
  });
  if (majorMatch.status !== 'matched') {
    return {
      ...emptyPreview(),
      isPlaceholder: true,
      placeholderIssue: majorMatch.status === 'ambiguous'
        ? 'Unknown Major placeholder matched multiple rows under Jandi.'
        : 'Unknown Major placeholder was not found under Jandi.'
    };
  }

  const candidate = {
    ...majorMatch.selected,
    university: universityMatch.selected,
    sourceWorkLogs: []
  };
  const requestedSelection = normalizeWhitespace(selectedMajorId);
  const selectedMajorIdResolved = requestedSelection && requestedSelection !== candidate.id
    ? null
    : candidate.id;

  return {
    candidates: [candidate],
    selectedMajorId: selectedMajorIdResolved,
    selectionReason: selectedMajorIdResolved ? 'placeholder' : null,
    skippedWorkLogCount: 0,
    selected: selectedMajorIdResolved ? candidate : null,
    isPlaceholder: true,
    placeholderIssue: selectedMajorIdResolved ? null : 'The selected Major is not the Jandi · Unknown placeholder.'
  };
}

function selectDefaultMajorId(workLogs, candidateIds, admissionsCandidateIds) {
  const firstIds = uniqueEligibleMajorIds(
    workLogs.filter((workLog) => normalizeWhitespace(workLog.title) === EXACT_FIRST_TITLE),
    candidateIds
  );
  if (firstIds.length === 1) {
    return { selectedMajorId: firstIds[0], selectionReason: 'admissions-1' };
  }

  if (firstIds.length === 0) {
    const plainLogs = workLogs.filter((workLog) => normalizeWhitespace(workLog.title) === PLAIN_TITLE);
    const numberedLaterExists = workLogs.some((workLog) => {
      const number = Number(normalizeWhitespace(workLog.title).match(NUMBERED_TITLE_PATTERN)?.[1] ?? 0);
      return number >= 2;
    });
    const plainIds = uniqueEligibleMajorIds(plainLogs, candidateIds);
    if (plainLogs.length === 1 && numberedLaterExists && plainIds.length === 1) {
      return { selectedMajorId: plainIds[0], selectionReason: 'plain-as-first' };
    }
  }

  if (admissionsCandidateIds.length === 1) {
    return { selectedMajorId: admissionsCandidateIds[0], selectionReason: 'single-candidate' };
  }

  return { selectedMajorId: null, selectionReason: null };
}

function selectPreviousSopMajorId(workLogs, candidateIds, previousRound) {
  if (previousRound < 1
    || workLogs.length === 0
    || workLogs.some((workLog) => workLog.majorIds.length !== 1)) {
    return null;
  }

  const majorIds = uniqueEligibleMajorIds(workLogs, candidateIds);
  return majorIds.length === 1
    ? {
        selectedMajorId: majorIds[0],
        selectionReason: 'previous-sop-round',
        selectionSourceRound: previousRound
      }
    : null;
}

function getSopRoundFromWorkLogTitle(title) {
  return Number(normalizeWhitespace(title).match(SOP_WORK_LOG_TITLE_PATTERN)?.[1] ?? 0);
}

function uniqueEligibleMajorIds(workLogs, candidateIds) {
  return [...new Set(
    workLogs
      .filter((workLog) => workLog.majorIds.length === 1)
      .map((workLog) => workLog.majorIds[0])
      .filter((majorId) => candidateIds.has(majorId))
  )];
}

function compareCandidates(left, right) {
  return `${left.university.name}\u0000${left.name}`.localeCompare(
    `${right.university.name}\u0000${right.name}`,
    'ko'
  );
}

function emptyPreview() {
  return {
    candidates: [],
    selectedMajorId: null,
    selectionReason: null,
    selectionSourceRound: null,
    skippedWorkLogCount: 0,
    selected: null
  };
}
