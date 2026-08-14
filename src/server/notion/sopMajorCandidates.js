import { normalizeWhitespace } from '../../shared/normalization.js';

const EXACT_FIRST_TITLE = '입학 요강 1';
const PLAIN_TITLE = '입학 요강';
const NUMBERED_TITLE_PATTERN = /^입학 요강\s+(\d+)$/u;

export async function buildSopMajorCandidatePreview({ repositories, studentId, selectedMajorId = '' }) {
  if (!studentId) {
    return emptyPreview();
  }

  const workLogs = await repositories.workLogs.findAdmissionsLogsWithMajorsForStudent(studentId);
  const eligibleLogs = workLogs.filter((workLog) => workLog.majorIds.length === 1);
  const candidateMap = new Map();

  for (const workLog of eligibleLogs) {
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
      createdTime: workLog.createdTime
    });
  }

  const candidates = [...candidateMap.values()].sort(compareCandidates);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const requestedSelection = normalizeWhitespace(selectedMajorId);
  const automaticSelection = selectDefaultMajorId(eligibleLogs, candidateIds, candidates);
  const resolvedSelection = requestedSelection && candidateIds.has(requestedSelection)
    ? { selectedMajorId: requestedSelection, selectionReason: 'manual' }
    : automaticSelection;

  return {
    candidates,
    selectedMajorId: resolvedSelection.selectedMajorId,
    selectionReason: resolvedSelection.selectionReason,
    skippedWorkLogCount: workLogs.length - eligibleLogs.length,
    selected: candidates.find((candidate) => candidate.id === resolvedSelection.selectedMajorId) ?? null
  };
}

function selectDefaultMajorId(workLogs, candidateIds, candidates) {
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

  if (candidates.length === 1) {
    return { selectedMajorId: candidates[0].id, selectionReason: 'single-candidate' };
  }

  return { selectedMajorId: null, selectionReason: null };
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
    skippedWorkLogCount: 0,
    selected: null
  };
}
