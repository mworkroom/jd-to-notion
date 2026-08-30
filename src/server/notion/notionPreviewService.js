import { calculateWeekdayDeadline } from '../../shared/deadline.js';
import {
  deriveProgrammeFields,
  normalizeWhitespace,
  splitProgrammeName
} from '../../shared/normalization.js';
import {
  ADMISSIONS_CATEGORY,
  REQUEST_SEASON,
  getNextWorkLogTitles
} from '../../shared/workLog.js';
import { createNotionClient } from './client.js';
import { getNotionConfig } from './config.js';
import { NotionAppError } from './errors.js';
import { createNotionRepositories } from './repositories/index.js';
import {
  buildSopMajorCandidatePreview,
  buildSopPlaceholderMajorPreview
} from './sopMajorCandidates.js';
import {
  ADMISSIONS_REQUEST_TYPE,
  SOP_LANGUAGES,
  SOP_REQUEST_TYPE,
  SOP_REVIEW_ROUNDS,
  getSopCategory,
  getSopWorkLogTitle
} from '../../shared/sopReview.js';

const PENDING_WORK_LOG_TITLE = '기존 학생 선택 필요';

export function createDefaultNotionPreviewService({ client, config } = {}) {
  const activeConfig = config ?? getNotionConfig();
  const activeClient = client ?? createNotionClient(activeConfig);

  return createNotionPreviewService({
    repositories: createNotionRepositories({
      client: activeClient,
      config: activeConfig
    })
  });
}

export function createNotionPreviewService({ repositories }) {
  return {
    async preview(input) {
      const request = validatePreviewRequest(input);
      const agent = await repositories.agents.findByExactName(request.requesterName);
      const matchedAgentId = agent.status === 'matched' ? agent.selected.id : null;
      const student = await buildStudentPreview({
        repositories,
        request,
        matchedAgentId
      });
      if (request.requestType === SOP_REQUEST_TYPE) {
        const sopReview = student.mode === 'new'
          ? await buildSopPlaceholderMajorPreview({
              repositories,
              selectedMajorId: request.selectedMajorId
            })
          : await buildSopMajorCandidatePreview({
              repositories,
              studentId: student.selectedStudentId,
              selectedMajorId: request.selectedMajorId
            });
        const workLog = buildSopWorkLogPreview(request);
        const blockingIssues = collectSopBlockingIssues({ agent, student, sopReview });

        return {
          ok: true,
          requestType: SOP_REQUEST_TYPE,
          blockingIssues,
          agent,
          student,
          programmes: [],
          sopReview,
          workLog,
          phase3Plan: {
            canCreate: false,
            reasons: ['Controlled live-write approval is still required.'],
            studentAction: student.mode === 'new'
              ? 'create'
              : student.selectedStudentId ? 'reuse' : 'select',
            universitiesToCreate: [],
            majorsToCreate: []
          }
        };
      }
      const programmes = await Promise.all(
        request.programmes.map((programme, index) => buildProgrammePreview({
          repositories,
          programme,
          index
        }))
      );
      const workLog = await buildWorkLogPreview({
        repositories,
        request,
        selectedStudentId: student.selectedStudentId
      });
      const blockingIssues = collectBlockingIssues({ agent, student, programmes });

      return {
        ok: true,
        requestType: ADMISSIONS_REQUEST_TYPE,
        blockingIssues,
        agent,
        student,
        programmes,
        workLog,
        phase3Plan: buildPhase3Plan({
          request,
          student,
          programmes
        })
      };
    },

    async getWorkLogTitleForStudent(studentId, workLogCount = 1) {
      const cleanStudentId = normalizeWhitespace(studentId);
      if (!cleanStudentId) {
        throw new NotionAppError({
          code: 'INVALID_PREVIEW_REQUEST',
          statusCode: 400,
          message: 'Selected Student page ID is required.',
          details: { errors: ['selectedStudentId is required.'] }
        });
      }

      const count = normalizeWorkLogCount(workLogCount);
      const existingLogs = await repositories.workLogs.findAdmissionsLogsForStudent(cleanStudentId);
      const titles = getNextWorkLogTitles(existingLogs, count);
      return {
        ok: true,
        workLog: {
          title: titles[0] ?? '',
          titles,
          count,
          category: ADMISSIONS_CATEGORY,
          requestSeason: REQUEST_SEASON
        }
      };
    }
  };
}

export function validatePreviewRequest(input = {}) {
  const errors = [];
  const requestType = input.requestType === SOP_REQUEST_TYPE
    ? SOP_REQUEST_TYPE
    : ADMISSIONS_REQUEST_TYPE;
  const clientMode = input.clientMode ?? (requestType === SOP_REQUEST_TYPE ? 'existing' : '');
  const requesterName = normalizeWhitespace(input.requesterName);
  const studentName = normalizeWhitespace(input.studentName);
  const programmes = Array.isArray(input.programmes) ? input.programmes : [];

  if (!['new', 'existing'].includes(clientMode)) {
    errors.push('clientMode must be "new" or "existing".');
  }

  if (!requesterName) {
    errors.push('requesterName is required.');
  }

  if (!studentName) {
    errors.push('studentName is required.');
  }

  if (requestType !== SOP_REQUEST_TYPE && programmes.length === 0) {
    errors.push('At least one programme is required.');
  }

  const normalizedProgrammes = requestType === SOP_REQUEST_TYPE ? [] : programmes.map((programme, index) => {
    const normalized = deriveProgrammeFields({
      rawUniversityName: programme?.rawUniversityName ?? programme?.universityName ?? '',
      universityName: normalizeWhitespace(programme?.universityName),
      programmeNameOriginal: normalizeWhitespace(programme?.programmeNameOriginal),
      programmeUrl: normalizeWhitespace(programme?.programmeUrl)
    });

    if (!normalized.universityName) {
      errors.push(`programmes.${index}.universityName is required.`);
    }

    if (!normalized.majorSearchKey) {
      errors.push(`programmes.${index}.majorSearchKey is required.`);
    }

    return normalized;
  });

  const sopReview = requestType === SOP_REQUEST_TYPE
    ? {
        round: Number(input.sopReview?.round),
        language: normalizeWhitespace(input.sopReview?.language)
      }
    : null;
  if (requestType === SOP_REQUEST_TYPE && !SOP_REVIEW_ROUNDS.includes(sopReview.round)) {
    errors.push('sopReview.round must be 1, 2, or 3.');
  }
  if (requestType === SOP_REQUEST_TYPE && !SOP_LANGUAGES.includes(sopReview.language)) {
    errors.push('sopReview.language must be 영문 or 국문.');
  }

  if (errors.length > 0) {
    throw new NotionAppError({
      code: 'INVALID_PREVIEW_REQUEST',
      statusCode: 400,
      message: 'Preview request is invalid.',
      details: { errors }
    });
  }

  return {
    requestType,
    clientMode,
    requesterName,
    studentName,
    requestDateTime: normalizeWhitespace(input.requestDateTime),
    programmes: normalizedProgrammes,
    selectedStudentId: normalizeWhitespace(input.selectedStudentId),
    selectedMajorId: normalizeWhitespace(input.selectedMajorId),
    sopReview
  };
}

async function buildStudentPreview({ repositories, request, matchedAgentId }) {
  if (request.clientMode === 'new') {
    const preview = await repositories.students.getNewClientPreview(request.studentName);
    return {
      mode: 'new',
      baseName: preview.baseName,
      existingFamily: preview.existingFamily,
      suggestedStudentName: preview.suggestedStudentName,
      selectedStudentId: null,
      proposedAction: 'create'
    };
  }

  const preview = await repositories.students.getExistingClientPreview(request.studentName, matchedAgentId);
  const candidates = request.requestType === SOP_REQUEST_TYPE
    ? preview.candidates.filter((candidate) => candidate.agentIds.includes(matchedAgentId))
    : preview.candidates;
  if (request.requestType === SOP_REQUEST_TYPE && candidates.length === 0) {
    const newClientPreview = await repositories.students.getNewClientPreview(request.studentName);
    return {
      ...newClientPreview,
      mode: 'new',
      selectedStudentId: null,
      proposedAction: 'create',
      fallbackReason: 'no-agent-linked-existing-student'
    };
  }
  const requestedStudent = candidates.find(
    (candidate) => candidate.id === request.selectedStudentId
  );
  const selectedStudentId = requestedStudent?.id
    ?? (request.requestType === SOP_REQUEST_TYPE
      ? candidates.length === 1 ? candidates[0].id : null
      : preview.selectedStudentId);
  return {
    mode: 'existing',
    baseName: preview.baseName,
    candidates,
    selectedStudentId,
    selection: requestedStudent
      ? { type: 'manual', studentId: requestedStudent.id }
      : preview.selection,
    proposedAction: selectedStudentId ? 'reuse' : 'select'
  };
}

function buildSopWorkLogPreview(request) {
  return {
    title: getSopWorkLogTitle(request.sopReview.round, request.sopReview.language),
    titles: [getSopWorkLogTitle(request.sopReview.round, request.sopReview.language)],
    count: 1,
    deadline: calculateWeekdayDeadline(request.requestDateTime),
    category: getSopCategory(request.sopReview.language),
    requestSeason: REQUEST_SEASON
  };
}

async function buildProgrammePreview({ repositories, programme, index }) {
  try {
    const university = await repositories.universities.findByExactName(programme.universityName);
    const major = await repositories.majors.findByUniversityAndKey({
      universityId: university.selected?.id ?? null,
      majorSearchKey: programme.majorSearchKey,
      requestedOriginalName: programme.programmeNameOriginal,
      proposedCreateName: programme.notionMajorNameProposed
    });
    const degreeNameWarning = getExistingMajorDegreeNameWarning({
      officialProgrammeName: programme.programmeNameOriginal,
      suggestedName: programme.notionMajorNameProposed,
      major
    });

    return {
      index,
      university,
      major,
      officialProgrammeName: programme.programmeNameOriginal,
      programmeUrl: programme.programmeUrl,
      needsMajorNameReview: programme.needsMajorNameReview,
      degreeNameWarning
    };
  } catch (error) {
    return {
      index,
      university: {
        status: 'error',
        requestedName: programme.universityName,
        selected: null,
        candidates: []
      },
      major: {
        status: 'blocked',
        requestedOriginalName: programme.programmeNameOriginal,
        searchKey: programme.majorSearchKey,
        proposedCreateName: programme.notionMajorNameProposed,
        selected: null,
        candidates: []
      },
      error: {
        code: error.code ?? 'NOTION_API_ERROR',
        message: error.message ?? 'Programme preview failed.'
      },
      officialProgrammeName: programme.programmeNameOriginal,
      programmeUrl: programme.programmeUrl,
      needsMajorNameReview: programme.needsMajorNameReview,
      degreeNameWarning: null
    };
  }
}

function getExistingMajorDegreeNameWarning({ officialProgrammeName, suggestedName, major }) {
  if (major.status !== 'matched' || !major.selected?.name) {
    return null;
  }

  const officialDegree = splitProgrammeName(officialProgrammeName).degreeLabel;
  const existingDegree = splitProgrammeName(major.selected.name).degreeLabel;
  if (!officialDegree || existingDegree) {
    return null;
  }

  return {
    code: 'existing_major_degree_missing',
    expectedDegreeLabel: officialDegree,
    existingMajorName: major.selected.name,
    suggestedName
  };
}

async function buildWorkLogPreview({ repositories, request, selectedStudentId }) {
  const count = countUniqueProgrammeIdentities(request.programmes);
  const titles = request.clientMode === 'new'
    ? getNextWorkLogTitles([], count)
    : selectedStudentId
      ? getNextWorkLogTitles(
          await repositories.workLogs.findAdmissionsLogsForStudent(selectedStudentId),
          count
        )
      : [PENDING_WORK_LOG_TITLE];

  return {
    title: titles[0] ?? '',
    titles,
    count,
    deadline: calculateWeekdayDeadline(request.requestDateTime),
    category: ADMISSIONS_CATEGORY,
    requestSeason: REQUEST_SEASON
  };
}

function countUniqueProgrammeIdentities(programmes) {
  return new Set(programmes.map((programme) => [
    normalizeWhitespace(programme.universityName).toLowerCase(),
    programme.majorSearchKey
  ].join('|'))).size;
}

function normalizeWorkLogCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new NotionAppError({
      code: 'INVALID_PREVIEW_REQUEST',
      statusCode: 400,
      message: 'Work Log count must be an integer between 1 and 100.',
      details: { errors: ['workLogCount must be an integer between 1 and 100.'] }
    });
  }
  return parsed;
}

function collectBlockingIssues({ agent, student, programmes }) {
  const issues = [];

  if (agent.status === 'missing') {
    issues.push('Requester Agent was not found.');
  } else if (agent.status === 'ambiguous') {
    issues.push('Requester Agent matched multiple rows.');
  }

  if (student.mode === 'existing' && !student.selectedStudentId) {
    issues.push('Existing Student selection is unresolved.');
  }

  for (const programme of programmes) {
    if (programme.university.status === 'ambiguous') {
      issues.push(`Programme ${programme.index + 1}: University match is ambiguous.`);
    }
    if (programme.university.status === 'error') {
      issues.push(`Programme ${programme.index + 1}: University lookup failed.`);
    }
    if (programme.major.status === 'ambiguous') {
      issues.push(`Programme ${programme.index + 1}: Major match is ambiguous.`);
    }
    if (programme.major.status === 'blocked'
      && programme.university.status !== 'missing') {
      issues.push(`Programme ${programme.index + 1}: Major lookup is blocked until University is resolved.`);
    }
  }

  return issues;
}

function collectSopBlockingIssues({ agent, student, sopReview }) {
  const issues = [];
  if (agent.status === 'missing') {
    issues.push('Requester Agent was not found.');
  } else if (agent.status === 'ambiguous') {
    issues.push('Requester Agent matched multiple rows.');
  }
  if (student.mode === 'existing' && !student.selectedStudentId) {
    issues.push('Existing Student selection is unresolved.');
  }
  if (sopReview.placeholderIssue) {
    issues.push(sopReview.placeholderIssue);
  } else if (student.mode === 'existing' && student.selectedStudentId && sopReview.candidates.length === 0) {
    issues.push('No eligible Major was found in the Student admissions Work Logs.');
  } else if (!sopReview.selectedMajorId) {
    issues.push('SOP Major selection is unresolved.');
  }
  return issues;
}

function buildPhase3Plan({ request, student, programmes }) {
  const universitiesToCreate = uniqueByName(
    programmes
      .filter((programme) => programme.university.status === 'missing')
      .map((programme) => ({
        name: programme.university.proposedCreateName ?? programme.university.requestedName
      }))
  );
  const majorsToCreate = uniqueByMajorIdentity(
    programmes
      .filter((programme) => programme.major.status === 'missing'
        || (programme.major.status === 'blocked'
          && programme.university.status === 'missing'))
      .map((programme) => ({
        name: programme.major.proposedCreateName,
        universityName: programme.university.selected?.name ?? programme.university.requestedName
      }))
  );

  return {
    canCreate: false,
    reasons: ['Controlled live-write approval is still required.'],
    studentAction: request.clientMode === 'new'
      ? 'create'
      : student.selectedStudentId
        ? 'reuse'
        : 'select',
    universitiesToCreate,
    majorsToCreate
  };
}

function uniqueByMajorIdentity(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = [
      normalizeWhitespace(item.universityName).toLowerCase(),
      normalizeWhitespace(item.name).toLowerCase()
    ].join('|');
    if (!item.name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function uniqueByName(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = normalizeWhitespace(item.name).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
