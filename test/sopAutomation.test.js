import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCreationJournal } from '../src/server/notion/creationJournal.js';
import { createNotionCreationService } from '../src/server/notion/notionCreationService.js';
import { createNotionPreviewService } from '../src/server/notion/notionPreviewService.js';
import { buildSopMajorCandidatePreview } from '../src/server/notion/sopMajorCandidates.js';
import {
  detectRequestType,
  extractSopLanguage,
  extractSopReviewRound,
  getSopCategory,
  getSopWorkLogTitle
} from '../src/shared/sopReview.js';

test('SOP rules detect the request, default round and language, and reject ambiguous rounds', () => {
  assert.equal(detectRequestType('[업무요청] 양원재 SOP 감수요청'), 'sop_review');
  assert.equal(detectRequestType('양원재 자소서 2차감수 부탁드립니다'), 'sop_review');
  assert.equal(detectRequestType('양원재 PS 3차 감수 부탁드립니다'), 'sop_review');
  assert.equal(detectRequestType('양원재 ps감수 부탁드립니다'), 'sop_review');
  assert.equal(detectRequestType('앱 사용법 감수 부탁드립니다'), 'admissions');
  assert.deepEqual(extractSopReviewRound('SOP 감수 요청'), {
    value: 1,
    valid: true,
    explicit: false
  });
  assert.equal(extractSopReviewRound('SOP 3차 감수 요청').value, 3);
  assert.equal(extractSopReviewRound('SOP 1차/2차 감수 요청').valid, false);
  assert.equal(extractSopReviewRound('SOP 4차 감수 요청').valid, false);
  assert.equal(extractSopLanguage('SOP 감수 요청'), '영문');
  assert.equal(extractSopLanguage('SOP 국문 감수 요청'), '국문');
  assert.equal(getSopWorkLogTitle(2, '국문'), 'SOP 2차 감수(국문)');
  assert.equal(getSopCategory('영문'), 'SOP 감수(영문)');
});

test('SOP Major defaults to exact admissions 1 and never uses creation time as a fallback', async () => {
  const repositories = makeCandidateRepositories([
    workLog('work-2', '입학 요강 2', 'major-b'),
    workLog('work-1', '입학 요강 1', 'major-a')
  ]);
  const preview = await buildSopMajorCandidatePreview({ repositories, studentId: 'student-1' });

  assert.equal(preview.selectedMajorId, 'major-a');
  assert.equal(preview.selectionReason, 'admissions-1');

  const ambiguous = await buildSopMajorCandidatePreview({
    repositories: makeCandidateRepositories([
      workLog('old', '별도 제목', 'major-a'),
      workLog('new', '또 다른 제목', 'major-b')
    ]),
    studentId: 'student-1'
  });
  assert.equal(ambiguous.selectedMajorId, null);
});

test('SOP Major treats one plain admissions log as first only when numbered 2+ exists', async () => {
  const preview = await buildSopMajorCandidatePreview({
    repositories: makeCandidateRepositories([
      workLog('plain', '입학 요강', 'major-a'),
      workLog('second', '입학 요강 2', 'major-b')
    ]),
    studentId: 'student-1'
  });

  assert.equal(preview.selectedMajorId, 'major-a');
  assert.equal(preview.selectionReason, 'plain-as-first');
});

test('SOP Major prefers the immediately previous SOP round and keeps manual override available', async () => {
  const admissionsLogs = [
    workLog('admissions-1', '입학 요강 1', 'major-a'),
    workLog('admissions-2', '입학 요강 2', 'major-b')
  ];
  const sopLogs = [
    sopWorkLog('sop-1', 1, '영문', 'major-b'),
    sopWorkLog('sop-2', 2, '국문', 'major-a')
  ];
  const repositories = makeCandidateRepositories(admissionsLogs, sopLogs);

  const secondRound = await buildSopMajorCandidatePreview({
    repositories,
    studentId: 'student-1',
    reviewRound: 2
  });
  assert.equal(secondRound.selectedMajorId, 'major-b');
  assert.equal(secondRound.selectionReason, 'previous-sop-round');
  assert.equal(secondRound.selectionSourceRound, 1);

  const thirdRound = await buildSopMajorCandidatePreview({
    repositories,
    studentId: 'student-1',
    reviewRound: 3
  });
  assert.equal(thirdRound.selectedMajorId, 'major-a');
  assert.equal(thirdRound.selectionReason, 'previous-sop-round');
  assert.equal(thirdRound.selectionSourceRound, 2);

  const manuallyChanged = await buildSopMajorCandidatePreview({
    repositories,
    studentId: 'student-1',
    selectedMajorId: 'major-a',
    reviewRound: 2
  });
  assert.equal(manuallyChanged.selectedMajorId, 'major-a');
  assert.equal(manuallyChanged.selectionReason, 'manual');
});

test('SOP Major falls back to admissions rules when the previous round is ambiguous', async () => {
  const preview = await buildSopMajorCandidatePreview({
    repositories: makeCandidateRepositories(
      [workLog('admissions-1', '입학 요강 1', 'major-a')],
      [
        sopWorkLog('sop-1-a', 1, '영문', 'major-a'),
        sopWorkLog('sop-1-b', 1, '국문', 'major-b')
      ]
    ),
    studentId: 'student-1',
    reviewRound: 2
  });

  assert.equal(preview.selectedMajorId, 'major-a');
  assert.equal(preview.selectionReason, 'admissions-1');
});

test('SOP Major does not treat an incomplete previous round as a unique fallback candidate', async () => {
  const preview = await buildSopMajorCandidatePreview({
    repositories: makeCandidateRepositories([], [
      sopWorkLog('sop-1-valid', 1, '영문', 'major-a'),
      {
        ...sopWorkLog('sop-1-missing-major', 1, '국문', 'major-b'),
        majorIds: []
      }
    ]),
    studentId: 'student-1',
    reviewRound: 2
  });

  assert.equal(preview.selectedMajorId, null);
  assert.equal(preview.selectionReason, null);
  assert.deepEqual(preview.candidates.map((candidate) => candidate.id), ['major-a']);
});

test('SOP creation reuses Student and Major and creates exactly one Work Log', async () => {
  const created = [];
  const updated = [];
  const candidateRepositories = makeCandidateRepositories([
    workLog('admissions-1', '입학 요강 1', 'major-a')
  ]);
  const repositories = {
    ...candidateRepositories,
    agents: {
      async findByExactName() {
        return { status: 'matched', selected: { id: 'agent-1', name: '최승미' } };
      }
    },
    students: {
      async getExistingClientPreview() {
        return {
          candidates: [{ id: 'student-1', name: '양원재', url: 'https://notion.test/student-1', agentIds: ['agent-1'] }],
          selectedStudentId: 'student-1'
        };
      }
    },
    workLogs: {
      ...candidateRepositories.workLogs,
      async createWorkLog(payload) {
        created.push(payload);
        return { id: 'sop-log-1', title: payload.title, url: 'https://notion.test/sop-log-1' };
      },
      async ensureCreatedWorkLogTitle(payload) {
        updated.push(payload);
        return { id: payload.pageId, title: payload.title, url: 'https://notion.test/sop-log-1' };
      },
      async getById() {
        throw new Error('unexpected journal recovery');
      }
    }
  };
  const service = createNotionCreationService({
    repositories,
    schemaChecker: async () => ({ ok: true }),
    journal: createMemoryCreationJournal()
  });

  const result = await service.create({
    requestType: 'sop_review',
    clientMode: 'existing',
    requesterName: '최승미',
    requestDateTime: '2026-08-13T16:44:00+09:00',
    studentName: '양원재',
    selectedStudentId: 'student-1',
    selectedMajorId: 'major-a',
    sopReview: { round: 1, language: '국문' },
    extractionWarnings: [],
    programmes: []
  });

  assert.equal(result.student.action, 'reuse');
  assert.equal(result.majors[0].action, 'reuse');
  assert.equal(result.workLogs.length, 1);
  assert.deepEqual(created, [{
    title: 'SOP 1차 감수(국문)',
    deadline: '2026-08-17',
    category: 'SOP 감수(국문)',
    requestSeason: '2026/27',
    studentId: 'student-1',
    majorId: 'major-a'
  }]);
  assert.deepEqual(updated, [{ pageId: 'sop-log-1', title: 'SOP 1차 감수(국문)' }]);
});

test('SOP preview falls back to a new Student and Jandi Unknown when no requester-linked Student exists', async () => {
  const service = createNotionPreviewService({
    repositories: {
      agents: {
        async findByExactName() {
          return { status: 'matched', selected: { id: 'agent-1', name: '최승미' } };
        }
      },
      students: {
        async getExistingClientPreview() {
          return {
            baseName: '양원재',
            candidates: [{ id: 'wrong-student', name: '양원재', agentIds: ['agent-2'] }],
            selectedStudentId: 'wrong-student',
            selection: { type: 'single-candidate', studentId: 'wrong-student' }
          };
        },
        async getNewClientPreview() {
          return {
            baseName: '양원재',
            existingFamily: [{ id: 'wrong-student', name: '양원재' }],
            suggestedStudentName: '양원재 B'
          };
        }
      },
      ...makeCandidateRepositories([])
    }
  });

  const preview = await service.preview({
    requestType: 'sop_review',
    requesterName: '최승미',
    requestDateTime: '2026-08-13T16:44:00+09:00',
    studentName: '양원재',
    sopReview: { round: 1, language: '영문' },
    programmes: []
  });

  assert.equal(preview.student.mode, 'new');
  assert.equal(preview.student.suggestedStudentName, '양원재 B');
  assert.equal(preview.student.selectedStudentId, null);
  assert.equal(preview.sopReview.selectedMajorId, 'major-placeholder');
  assert.equal(preview.sopReview.selectionReason, 'placeholder');
  assert.equal(preview.sopReview.selected.university.name, 'Jandi');
  assert.equal(preview.sopReview.selected.name, 'Unknown');
  assert.deepEqual(preview.blockingIssues, []);
});

test('SOP creation creates a new Agent-linked Student and reuses Jandi Unknown', async () => {
  const createdStudents = [];
  const createdWorkLogs = [];
  const repositories = {
    ...makeCandidateRepositories([]),
    agents: {
      async findByExactName() {
        return { status: 'matched', selected: { id: 'agent-1', name: '최승미' } };
      }
    },
    students: {
      async getNewClientPreview() {
        return {
          mode: 'new',
          baseName: '신규학생',
          existingFamily: [],
          suggestedStudentName: '신규학생'
        };
      },
      async createStudent(payload) {
        createdStudents.push(payload);
        return { id: 'student-new', name: payload.name, url: 'https://notion.test/student-new', agentIds: [payload.agentId] };
      }
    },
    workLogs: {
      async createWorkLog(payload) {
        createdWorkLogs.push(payload);
        return { id: 'sop-new-log', title: payload.title, url: 'https://notion.test/sop-new-log' };
      },
      async ensureCreatedWorkLogTitle(payload) {
        return { id: payload.pageId, title: payload.title, url: 'https://notion.test/sop-new-log' };
      },
      async getById() {
        throw new Error('unexpected journal recovery');
      }
    }
  };
  const service = createNotionCreationService({
    repositories,
    schemaChecker: async () => ({ ok: true }),
    journal: createMemoryCreationJournal()
  });

  const result = await service.create({
    requestType: 'sop_review',
    clientMode: 'new',
    requesterName: '최승미',
    requestDateTime: '2026-08-29T16:44:00+09:00',
    studentName: '신규학생',
    selectedMajorId: 'major-placeholder',
    sopReview: { round: 2, language: '영문' },
    extractionWarnings: [],
    programmes: []
  });

  assert.deepEqual(createdStudents, [{ name: '신규학생', agentId: 'agent-1' }]);
  assert.equal(result.student.action, 'create');
  assert.equal(result.majors[0].id, 'major-placeholder');
  assert.equal(result.majors[0].action, 'reuse');
  assert.deepEqual(createdWorkLogs, [{
    title: 'SOP 2차 감수(영문)',
    deadline: '2026-09-01',
    category: 'SOP 감수(영문)',
    requestSeason: '2026/27',
    studentId: 'student-new',
    majorId: 'major-placeholder'
  }]);
});

function makeCandidateRepositories(logs, sopLogs = []) {
  return {
    workLogs: {
      async findAdmissionsLogsWithMajorsForStudent() {
        return logs;
      },
      async findSopLogsWithMajorsForStudent() {
        return sopLogs;
      }
    },
    majors: {
      async findByUniversityAndKey({ universityId, majorSearchKey }) {
        if (universityId === 'uni-placeholder' && majorSearchKey === 'unknown') {
          return {
            status: 'matched',
            selected: {
              id: 'major-placeholder',
              name: 'Unknown',
              url: 'https://notion.test/major-placeholder',
              universityIds: ['uni-placeholder']
            }
          };
        }
        return { status: 'missing', selected: null, candidates: [] };
      },
      async getById(id) {
        return {
          id,
          name: id === 'major-a' ? 'Corporate Finance MSc' : 'Finance MSc',
          url: `https://notion.test/${id}`,
          universityIds: [id === 'major-a' ? 'uni-a' : 'uni-b']
        };
      }
    },
    universities: {
      async findByExactName(name) {
        return name === 'Jandi'
          ? {
              status: 'matched',
              selected: { id: 'uni-placeholder', name: 'Jandi', url: 'https://notion.test/uni-placeholder' }
            }
          : { status: 'missing', selected: null, candidates: [] };
      },
      async getById(id) {
        return {
          id,
          name: id === 'uni-a' ? 'LSE' : 'Warwick',
          url: `https://notion.test/${id}`
        };
      }
    }
  };
}

function workLog(id, title, majorId) {
  return {
    id,
    title,
    category: '입학 요강',
    majorIds: [majorId],
    createdTime: id
  };
}

function sopWorkLog(id, round, language, majorId) {
  return {
    id,
    title: `SOP ${round}차 감수(${language})`,
    category: `SOP 감수(${language})`,
    majorIds: [majorId],
    requestSeason: '2026/27',
    createdTime: id
  };
}
