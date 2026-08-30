import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { calculateWeekdayDeadline } from '../../shared/deadline.js';
import {
  normalizeForComparison,
  normalizeWhitespace
} from '../../shared/normalization.js';
import {
  ADMISSIONS_CATEGORY,
  REQUEST_SEASON,
  getNextWorkLogTitle
} from '../../shared/workLog.js';
import { createNotionClient } from './client.js';
import { createFileCreationJournal } from './creationJournal.js';
import { NotionAppError, mapNotionError } from './errors.js';
import { createRequestFingerprint } from './fingerprint.js';
import { getNotionConfig } from './config.js';
import { validatePreviewRequest } from './notionPreviewService.js';
import { createNotionRepositories } from './repositories/index.js';
import { checkNotionSchema } from './schema.js';
import {
  buildSopMajorCandidatePreview,
  buildSopPlaceholderMajorPreview
} from './sopMajorCandidates.js';
import {
  SOP_REQUEST_TYPE,
  getSopCategory,
  getSopWorkLogTitle
} from '../../shared/sopReview.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function createDefaultNotionCreationService({
  client,
  config,
  journal,
  journalPath
} = {}) {
  const activeConfig = config ?? getNotionConfig();
  const activeClient = client ?? createNotionClient(activeConfig);

  return createNotionCreationService({
    repositories: createNotionRepositories({
      client: activeClient,
      config: activeConfig
    }),
    schemaChecker: () => checkNotionSchema({
      client: activeClient,
      config: activeConfig
    }),
    journal: journal ?? createFileCreationJournal({
      filePath: journalPath
        ?? process.env.NOTION_JOURNAL_PATH
        ?? path.join(projectRoot, '.local', 'notion-creation-journal.json')
    })
  });
}

export function createNotionCreationService({
  repositories,
  schemaChecker,
  journal
}) {
  const activeFingerprints = new Set();

  return {
    async create(input) {
      const request = validateCreationRequest(input);
      const preflight = await runPreflight({
        request,
        repositories,
        schemaChecker
      });
      const fingerprint = createRequestFingerprint({
        requestType: request.requestType,
        requesterName: request.requesterName,
        requestDateTime: request.requestDateTime,
        clientMode: request.clientMode,
        studentIdentity: preflight.studentIdentity,
        programmeUrls: request.programmes.map((programme) => programme.programmeUrl),
        reviewRound: request.sopReview?.round,
        language: request.sopReview?.language,
        majorId: preflight.selectedMajor?.id
      });

      if (activeFingerprints.has(fingerprint)) {
        throw conflict(
          'NOTION_CREATE_IN_PROGRESS',
          'The same request is already being processed.',
          { fingerprint }
        );
      }

      activeFingerprints.add(fingerprint);
      try {
        const previous = await journal.get(fingerprint);
        if (previous?.status === 'completed') {
          throw conflict(
            'NOTION_CREATE_DUPLICATE',
            'The same request has already been completed.',
            {
              fingerprint,
              completedAt: previous.completedAt,
              pages: previous.pages
            }
          );
        }

        const journalRecord = await journal.begin(fingerprint);
        return await executeCreation({
          request,
          preflight,
          fingerprint,
          journalRecord,
          repositories,
          journal
        });
      } finally {
        activeFingerprints.delete(fingerprint);
      }
    }
  };
}

export function validateCreationRequest(input = {}) {
  const request = validatePreviewRequest(input);
  const errors = [];

  if (!request.requestDateTime || Number.isNaN(Date.parse(request.requestDateTime))) {
    errors.push('requestDateTime must be a valid date/time.');
  }

  if (Array.isArray(input.extractionWarnings) && input.extractionWarnings.length > 0) {
    errors.push('Extraction warnings must be resolved before Notion creation.');
  }

  const programmes = request.programmes.map((programme, index) => {
    if (!isHttpUrl(programme.programmeUrl)) {
      errors.push(`programmes.${index}.programmeUrl must be an http or https URL.`);
    }

    return {
      ...programme,
      reviewedMajorName: normalizeWhitespace(
        input.programmes?.[index]?.reviewedMajorName
          ?? input.programmes?.[index]?.notionMajorNameProposed
          ?? programme.notionMajorNameProposed
      ),
      majorNameConfirmed: input.programmes?.[index]?.majorNameConfirmed === true
    };
  });

  if (errors.length > 0) {
    throw new NotionAppError({
      code: 'INVALID_CREATE_REQUEST',
      statusCode: 400,
      message: 'Notion creation request is invalid.',
      details: { errors }
    });
  }

  return {
    ...request,
    selectedStudentId: normalizeWhitespace(input.selectedStudentId),
    selectedMajorId: normalizeWhitespace(input.selectedMajorId),
    programmes
  };
}

async function runPreflight({ request, repositories, schemaChecker }) {
  const schema = await schemaChecker();
  if (!schema?.ok) {
    throw conflict(
      'NOTION_SCHEMA_MISMATCH',
      'Notion schema is not ready for creation.',
      { dataSources: schema?.dataSources ?? {} }
    );
  }

  const agent = await repositories.agents.findByExactName(request.requesterName);
  if (agent.status !== 'matched') {
    throw conflict(
      agent.status === 'ambiguous' ? 'AGENT_AMBIGUOUS' : 'AGENT_NOT_FOUND',
      'Requester Agent must have exactly one current match.'
    );
  }

  if (request.requestType === SOP_REQUEST_TYPE) {
    return runSopPreflight({ request, repositories, agent: agent.selected });
  }

  const student = request.clientMode === 'new'
    ? await repositories.students.getNewClientPreview(request.studentName)
    : await repositories.students.getExistingClientPreview(
        request.studentName,
        agent.selected.id
      );
  let selectedStudent = null;

  if (request.clientMode === 'existing') {
    const selectedId = request.selectedStudentId || student.selectedStudentId;
    selectedStudent = student.candidates.find((candidate) => candidate.id === selectedId) ?? null;
    if (!selectedStudent) {
      throw conflict(
        'STUDENT_SELECTION_UNRESOLVED',
        'The selected Student is not one of the current candidates.'
      );
    }
  }

  const universities = new Map();
  for (const programme of request.programmes) {
    const key = normalizeForComparison(programme.universityName);
    if (!universities.has(key)) {
      const match = await repositories.universities.findByExactName(programme.universityName);
      if (match.status === 'ambiguous') {
        throw conflict(
          'UNIVERSITY_AMBIGUOUS',
          `University "${programme.universityName}" has multiple current matches.`
        );
      }
      universities.set(key, {
        key,
        name: programme.universityName,
        match
      });
    }
  }

  const majors = new Map();
  for (const programme of request.programmes) {
    const universityKey = normalizeForComparison(programme.universityName);
    const university = universities.get(universityKey);
    const key = `${universityKey}|${programme.majorSearchKey}`;
    const existingPlan = majors.get(key);

    if (existingPlan) {
      if (normalizeForComparison(existingPlan.createName)
        !== normalizeForComparison(programme.reviewedMajorName)) {
        throw conflict(
          'MAJOR_NAME_CONFLICT',
          'The same University and Major identity has conflicting create names.'
        );
      }
      continue;
    }

    const match = university.match.status === 'matched'
      ? await repositories.majors.findByUniversityAndKey({
          universityId: university.match.selected.id,
          majorSearchKey: programme.majorSearchKey,
          requestedOriginalName: programme.programmeNameOriginal,
          proposedCreateName: programme.reviewedMajorName
        })
      : {
          status: 'pending_university',
          selected: null,
          candidates: []
        };

    if (match.status === 'ambiguous') {
      throw conflict(
        'MAJOR_AMBIGUOUS',
        `Major "${programme.programmeNameOriginal}" has multiple current matches.`
      );
    }

    if (match.status !== 'matched'
      && (!programme.reviewedMajorName || !programme.majorNameConfirmed)) {
      throw conflict(
        'MAJOR_NAME_UNCONFIRMED',
        `Major "${programme.programmeNameOriginal}" needs a confirmed Notion name.`
      );
    }

    majors.set(key, {
      key,
      universityKey,
      searchKey: programme.majorSearchKey,
      requestedOriginalName: programme.programmeNameOriginal,
      createName: programme.reviewedMajorName,
      match
    });
  }

  return {
    agent: agent.selected,
    student,
    selectedStudent,
    studentIdentity: request.clientMode === 'new'
      ? request.studentName
      : selectedStudent.id,
    universities,
    majors
  };
}

async function runSopPreflight({ request, repositories, agent }) {
  const student = request.clientMode === 'new'
    ? await repositories.students.getNewClientPreview(request.studentName)
    : await repositories.students.getExistingClientPreview(request.studentName, agent.id);
  let selectedStudent = null;
  if (request.clientMode === 'existing') {
    const eligibleCandidates = student.candidates.filter(
      (candidate) => candidate.agentIds.includes(agent.id)
    );
    const selectedId = request.selectedStudentId || student.selectedStudentId;
    selectedStudent = eligibleCandidates.find((candidate) => candidate.id === selectedId) ?? null;
    if (!selectedStudent) {
      throw conflict(
        'STUDENT_SELECTION_UNRESOLVED',
        'The selected Student is not one of the current candidates.'
      );
    }
  }

  const sopReview = request.clientMode === 'new'
    ? await buildSopPlaceholderMajorPreview({
        repositories,
        selectedMajorId: request.selectedMajorId
      })
    : await buildSopMajorCandidatePreview({
        repositories,
        studentId: selectedStudent.id,
        selectedMajorId: request.selectedMajorId
      });
  if (request.selectedMajorId && sopReview.selectedMajorId !== request.selectedMajorId) {
    throw conflict(
      'SOP_MAJOR_SELECTION_INVALID',
      'The selected Major is not one of the Student current admissions candidates.'
    );
  }
  if (!sopReview.selected) {
    throw conflict(
      sopReview.candidates.length === 0 ? 'SOP_MAJOR_NOT_FOUND' : 'SOP_MAJOR_SELECTION_UNRESOLVED',
      sopReview.candidates.length === 0
        ? 'No eligible Major was found in the Student admissions Work Logs.'
        : 'The SOP Major selection is unresolved.'
    );
  }

  return {
    agent,
    student,
    selectedStudent,
    selectedMajor: sopReview.selected,
    studentIdentity: selectedStudent?.id ?? request.studentName,
    universities: new Map(),
    majors: new Map()
  };
}

async function executeCreation({
  request,
  preflight,
  fingerprint,
  journalRecord,
  repositories,
  journal
}) {
  if (request.requestType === SOP_REQUEST_TYPE) {
    return executeSopCreation({
      request,
      preflight,
      fingerprint,
      journalRecord,
      repositories,
      journal
    });
  }

  const result = {
    ok: true,
    fingerprint,
    student: null,
    universities: [],
    majors: [],
    workLogs: [],
    finalStudentName: null
  };
  let step = 'student';

  try {
    const student = await resolveStudent({
      request,
      preflight,
      previousPage: journalRecord.pages.student,
      repositories
    });
    result.student = student;
    result.finalStudentName = student.name;
    await journal.recordPage(fingerprint, 'student', {
      key: 'student',
      id: student.id,
      action: student.action
    });

    step = 'universities';
    const universityIds = new Map();
    for (const universityPlan of preflight.universities.values()) {
      const pageKey = journalEntityKey('university', universityPlan.key);
      const previousPage = journalRecord.pages.universities.find(
        (page) => page.key === pageKey
      );
      const university = await resolveUniversity({
        plan: universityPlan,
        previousPage,
        repositories
      });
      universityIds.set(universityPlan.key, university.id);
      result.universities.push(university);
      await journal.recordPage(fingerprint, 'universities', {
        key: pageKey,
        id: university.id,
        action: university.action
      });
    }

    step = 'majors';
    const majorIds = new Map();
    for (const majorPlan of preflight.majors.values()) {
      const pageKey = journalEntityKey('major', majorPlan.key);
      const previousPage = journalRecord.pages.majors.find(
        (page) => page.key === pageKey
      );
      const major = await resolveMajor({
        plan: majorPlan,
        universityId: universityIds.get(majorPlan.universityKey),
        previousPage,
        repositories
      });
      majorIds.set(majorPlan.key, major.id);
      result.majors.push(major);
      await journal.recordPage(fingerprint, 'majors', {
        key: pageKey,
        id: major.id,
        action: major.action
      });
    }

    const deadline = calculateWeekdayDeadline(request.requestDateTime);
    const knownWorkLogs = await repositories.workLogs.findAdmissionsLogsForStudent(student.id);
    const journalWorkLogIds = new Set(
      journalRecord.pages.workLogs.map((page) => page.id).filter(Boolean)
    );
    const plannedWorkLogs = knownWorkLogs.filter(
      (workLog) => !journalWorkLogIds.has(workLog.id)
    );

    for (const majorPlan of preflight.majors.values()) {
      step = `work_log:${majorPlan.key}`;
      const pageKey = journalEntityKey('work_log', majorPlan.key);
      const previousPage = journalRecord.pages.workLogs.find(
        (page) => page.key === pageKey
      );
      const title = getNextWorkLogTitle(plannedWorkLogs);
      let workLog;

      if (previousPage?.id) {
        const page = await repositories.workLogs.getById(previousPage.id);
        workLog = {
          ...page,
          title,
          action: previousPage.action,
          majorId: majorIds.get(majorPlan.key),
          deadline,
          category: ADMISSIONS_CATEGORY,
          requestSeason: REQUEST_SEASON
        };
      } else {
        const page = await repositories.workLogs.createWorkLog({
          title,
          deadline,
          category: ADMISSIONS_CATEGORY,
          requestSeason: REQUEST_SEASON,
          studentId: student.id,
          majorId: majorIds.get(majorPlan.key)
        });
        workLog = {
          ...page,
          action: 'create',
          majorId: majorIds.get(majorPlan.key),
          deadline,
          category: ADMISSIONS_CATEGORY,
          requestSeason: REQUEST_SEASON
        };
        await journal.recordPage(fingerprint, 'workLogs', {
          key: pageKey,
          id: page.id,
          action: 'create'
        });
      }

      result.workLogs.push(workLog);
      plannedWorkLogs.push({
        id: workLog.id,
        title: workLog.title,
        category: ADMISSIONS_CATEGORY
      });
    }

    step = 'work_log_titles';
    for (const workLog of result.workLogs) {
      const finalized = await repositories.workLogs.ensureCreatedWorkLogTitle({
        pageId: workLog.id,
        title: workLog.title
      });
      workLog.url = finalized.url;
    }

    await journal.complete(fingerprint);
    return result;
  } catch (error) {
    const mapped = mapNotionError(error, 'Notion creation stopped after a partial result.');
    await journal.fail(fingerprint, {
      step,
      errorCode: mapped.code
    });

    throw new NotionAppError({
      code: 'NOTION_CREATE_PARTIAL_FAILURE',
      statusCode: mapped.statusCode ?? 502,
      message: 'Notion creation stopped. Review the completed items before retrying.',
      details: {
        failedStep: step,
        causeCode: mapped.code,
        partialResult: result
      },
      cause: mapped
    });
  }
}

async function executeSopCreation({
  request,
  preflight,
  fingerprint,
  journalRecord,
  repositories,
  journal
}) {
  const title = getSopWorkLogTitle(request.sopReview.round, request.sopReview.language);
  const category = getSopCategory(request.sopReview.language);
  const deadline = calculateWeekdayDeadline(request.requestDateTime);
  const pageKey = journalEntityKey('sop_work_log', preflight.selectedMajor.id);
  const previousPage = journalRecord.pages.workLogs.find((page) => page.key === pageKey);
  const result = {
    ok: true,
    requestType: SOP_REQUEST_TYPE,
    fingerprint,
    student: null,
    universities: [{ ...preflight.selectedMajor.university, action: 'reuse' }],
    majors: [{
      id: preflight.selectedMajor.id,
      name: preflight.selectedMajor.name,
      url: preflight.selectedMajor.url,
      universityId: preflight.selectedMajor.university.id,
      action: 'reuse'
    }],
    workLogs: [],
    finalStudentName: null
  };
  let step = 'student';

  try {
    const student = await resolveStudent({
      request,
      preflight,
      previousPage: journalRecord.pages.student,
      repositories
    });
    result.student = student;
    result.finalStudentName = student.name;
    await journal.recordPage(fingerprint, 'student', {
      key: 'student',
      id: student.id,
      action: student.action
    });

    step = 'work_log';
    let workLog;
    if (previousPage?.id) {
      const page = await repositories.workLogs.getById(previousPage.id);
      workLog = {
        ...page,
        title,
        action: previousPage.action,
        majorId: preflight.selectedMajor.id,
        deadline,
        category,
        requestSeason: REQUEST_SEASON
      };
    } else {
      const page = await repositories.workLogs.createWorkLog({
        title,
        deadline,
        category,
        requestSeason: REQUEST_SEASON,
        studentId: student.id,
        majorId: preflight.selectedMajor.id
      });
      workLog = {
        ...page,
        action: 'create',
        majorId: preflight.selectedMajor.id,
        deadline,
        category,
        requestSeason: REQUEST_SEASON
      };
      await journal.recordPage(fingerprint, 'workLogs', {
        key: pageKey,
        id: page.id,
        action: 'create'
      });
    }
    result.workLogs.push(workLog);

    step = 'work_log_titles';
    const finalized = await repositories.workLogs.ensureCreatedWorkLogTitle({
      pageId: workLog.id,
      title
    });
    workLog.url = finalized.url;

    await journal.complete(fingerprint);
    return result;
  } catch (error) {
    const mapped = mapNotionError(error, 'Notion creation stopped after a partial result.');
    await journal.fail(fingerprint, {
      step,
      errorCode: mapped.code
    });
    throw new NotionAppError({
      code: 'NOTION_CREATE_PARTIAL_FAILURE',
      statusCode: mapped.statusCode ?? 502,
      message: 'Notion creation stopped. Review the completed items before retrying.',
      details: {
        failedStep: step,
        causeCode: mapped.code,
        partialResult: result
      },
      cause: mapped
    });
  }
}

async function resolveStudent({ request, preflight, previousPage, repositories }) {
  if (request.clientMode === 'existing') {
    return {
      ...preflight.selectedStudent,
      action: 'reuse'
    };
  }

  if (previousPage?.id) {
    const student = await repositories.students.getById(previousPage.id);
    if (!student.agentIds.includes(preflight.agent.id)) {
      throw conflict(
        'JOURNAL_STUDENT_MISMATCH',
        'The journal Student no longer has the expected Agent relation.'
      );
    }
    return {
      ...student,
      action: previousPage.action
    };
  }

  const latest = await repositories.students.getNewClientPreview(request.studentName);
  const student = await repositories.students.createStudent({
    name: latest.suggestedStudentName,
    agentId: preflight.agent.id
  });
  return {
    ...student,
    name: latest.suggestedStudentName,
    action: 'create'
  };
}

async function resolveUniversity({ plan, previousPage, repositories }) {
  const current = await repositories.universities.findByExactName(plan.name);
  if (current.status === 'ambiguous') {
    throw conflict('UNIVERSITY_AMBIGUOUS', `University "${plan.name}" became ambiguous.`);
  }
  if (current.status === 'matched') {
    return {
      ...current.selected,
      action: 'reuse'
    };
  }

  if (previousPage?.id) {
    const university = await repositories.universities.getById(previousPage.id);
    if (normalizeForComparison(university.name) !== plan.key) {
      throw conflict(
        'JOURNAL_UNIVERSITY_MISMATCH',
        'The journal University does not match the current request.'
      );
    }
    return {
      ...university,
      action: previousPage.action
    };
  }

  const university = await repositories.universities.createUniversity({ name: plan.name });
  return {
    ...university,
    name: plan.name,
    action: 'create'
  };
}

async function resolveMajor({
  plan,
  universityId,
  previousPage,
  repositories
}) {
  const current = await repositories.majors.findByUniversityAndKey({
    universityId,
    majorSearchKey: plan.searchKey,
    requestedOriginalName: plan.requestedOriginalName,
    proposedCreateName: plan.createName
  });
  if (current.status === 'ambiguous') {
    throw conflict('MAJOR_AMBIGUOUS', `Major "${plan.requestedOriginalName}" became ambiguous.`);
  }
  if (current.status === 'matched') {
    return {
      ...current.selected,
      action: 'reuse',
      universityId
    };
  }

  if (previousPage?.id) {
    const major = await repositories.majors.getById(previousPage.id);
    if (major.searchKey !== plan.searchKey || !major.universityIds.includes(universityId)) {
      throw conflict(
        'JOURNAL_MAJOR_MISMATCH',
        'The journal Major does not match the current University and Major identity.'
      );
    }
    return {
      ...major,
      action: previousPage.action,
      universityId
    };
  }

  const major = await repositories.majors.createMajor({
    name: plan.createName,
    universityId
  });
  return {
    ...major,
    name: plan.createName,
    action: 'create',
    universityId
  };
}

function conflict(code, message, details = {}) {
  return new NotionAppError({
    code,
    statusCode: 409,
    message,
    details
  });
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function journalEntityKey(entity, value) {
  return createHash('sha256')
    .update(`${entity}:${value}`)
    .digest('hex');
}
