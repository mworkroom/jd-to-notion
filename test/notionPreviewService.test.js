import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMISSIONS_CATEGORY,
  WORK_LOG_TITLE_PREFIX
} from '../src/shared/workLog.js';
import { createDefaultNotionPreviewService } from '../src/server/notion/notionPreviewService.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

const dataSourceIds = {
  agents: 'agents-ds',
  students: 'students-ds',
  universities: 'universities-ds',
  majors: 'majors-ds',
  workLog: 'work-log-ds'
};

const config = {
  token: 'secret-token',
  dataSourceIds
};

test('preview service builds a new-client read-only preview with recalculated Major fields', async () => {
  const service = createDefaultNotionPreviewService({
    config,
    client: makeClient({
      data: {
        [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
        [dataSourceIds.students]: [
          studentPage('student-1', 'Kim', ['agent-1']),
          studentPage('student-2', 'Kim B', ['agent-1'])
        ],
        [dataSourceIds.universities]: [titlePage('uni-1', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')],
        [dataSourceIds.majors]: []
      }
    })
  });

  const preview = await service.preview({
    clientMode: 'new',
    requesterName: ' Requester ',
    studentName: 'Kim',
    requestDateTime: '2026-06-17T17:04:00+09:00',
    programmes: [{
      universityName: 'Warwick',
      programmeNameOriginal: 'MSc Computer Science',
      majorSearchKey: 'wrong browser value',
      notionMajorNameProposed: 'wrong browser value'
    }]
  });

  assert.equal(preview.agent.status, 'matched');
  assert.equal(preview.student.suggestedStudentName, 'Kim C');
  assert.equal(preview.programmes[0].major.status, 'missing');
  assert.equal(preview.programmes[0].major.searchKey, 'computer science');
  assert.equal(preview.programmes[0].major.proposedCreateName, 'Computer Science MSc');
  assert.equal(preview.workLog.title, `${WORK_LOG_TITLE_PREFIX} 1`);
  assert.equal(preview.workLog.category, ADMISSIONS_CATEGORY);
  assert.equal(preview.workLog.deadline, '2026-06-19');
  assert.deepEqual(preview.phase3Plan.majorsToCreate, [{
    name: 'Computer Science MSc',
    universityName: 'Warwick'
  }]);
});

test('preview service selects an existing requester-Agent Student and calculates the real work-log title', async () => {
  const service = createDefaultNotionPreviewService({
    config,
    client: makeClient({
      data: {
        [dataSourceIds.agents]: [titlePage('agent-2', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
        [dataSourceIds.students]: [
          studentPage('student-1', 'Kim', ['agent-1']),
          studentPage('student-2', 'Kim B', ['agent-2'])
        ],
        [dataSourceIds.universities]: [titlePage('uni-1', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')],
        [dataSourceIds.majors]: [majorPage('major-1', 'Computer Science MSc', ['uni-1'])],
        [dataSourceIds.workLog]: [
          workLogPage('work-1', WORK_LOG_TITLE_PREFIX, ADMISSIONS_CATEGORY, ['student-2']),
          workLogPage('work-2', `${WORK_LOG_TITLE_PREFIX} 2`, ADMISSIONS_CATEGORY, ['student-2'])
        ]
      }
    })
  });

  const preview = await service.preview({
    clientMode: 'existing',
    requesterName: 'Requester',
    studentName: 'Kim',
    requestDateTime: '2026-06-17T17:04:00+09:00',
    programmes: [{
      universityName: 'Warwick',
      programmeNameOriginal: 'MSc Computer Science'
    }]
  });

  assert.equal(preview.student.selectedStudentId, 'student-2');
  assert.equal(preview.student.selection.type, 'requester-agent-match');
  assert.equal(preview.programmes[0].major.status, 'matched');
  assert.equal(preview.workLog.title, `${WORK_LOG_TITLE_PREFIX} 3`);
  assert.equal(preview.phase3Plan.studentAction, 'reuse');
});

test('preview service does not calculate a work-log title for unresolved existing Student ambiguity', async () => {
  const service = createDefaultNotionPreviewService({
    config,
    client: makeClient({
      data: {
        [dataSourceIds.agents]: [titlePage('agent-3', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
        [dataSourceIds.students]: [
          studentPage('student-1', 'Kim', ['agent-1']),
          studentPage('student-2', 'Kim B', ['agent-2'])
        ],
        [dataSourceIds.universities]: [],
        [dataSourceIds.majors]: [],
        [dataSourceIds.workLog]: []
      }
    })
  });

  const preview = await service.preview({
    clientMode: 'existing',
    requesterName: 'Requester',
    studentName: 'Kim',
    requestDateTime: '2026-06-17T17:04:00+09:00',
    programmes: [{
      universityName: 'Missing University',
      programmeNameOriginal: 'MSc Computer Science'
    }]
  });

  assert.equal(preview.student.selectedStudentId, null);
  assert.equal(preview.workLog.title, '기존 학생 선택 필요');
  assert.match(preview.blockingIssues.join('\n'), /Existing Student selection is unresolved/);
});

test('work-log title helper validates selected Student IDs', async () => {
  const service = createDefaultNotionPreviewService({
    config,
    client: makeClient({ data: { [dataSourceIds.workLog]: [] } })
  });

  await assert.rejects(
    () => service.getWorkLogTitleForStudent(''),
    { code: 'INVALID_PREVIEW_REQUEST', statusCode: 400 }
  );
});

function makeClient({ data = {}, pageSize = 100 } = {}) {
  const allPages = Object.values(data).flat();

  return {
    dataSources: {
      async query(request) {
        const pages = data[request.data_source_id] ?? [];
        const start = Number(request.start_cursor ?? 0);
        const results = pages.slice(start, start + pageSize);
        const next = start + pageSize;

        return {
          results,
          has_more: next < pages.length,
          next_cursor: next < pages.length ? String(next) : null
        };
      }
    },
    pages: {
      async retrieve({ page_id }) {
        const page = allPages.find((candidate) => candidate.id === page_id);
        if (!page) {
          throw Object.assign(new Error('not found'), { status: 404 });
        }
        return page;
      }
    }
  };
}

function titlePage(id, propertyName, title) {
  return {
    id,
    url: `https://notion.test/${id}`,
    properties: {
      [propertyName]: titleProperty(title)
    }
  };
}

function studentPage(id, name, agentIds) {
  return {
    ...titlePage(id, NOTION_PROPERTY_NAMES.students.name, name),
    properties: {
      [NOTION_PROPERTY_NAMES.students.name]: titleProperty(name),
      [NOTION_PROPERTY_NAMES.students.agentRelation]: relationProperty(agentIds)
    }
  };
}

function majorPage(id, name, universityIds) {
  return {
    ...titlePage(id, NOTION_PROPERTY_NAMES.majors.name, name),
    properties: {
      [NOTION_PROPERTY_NAMES.majors.name]: titleProperty(name),
      [NOTION_PROPERTY_NAMES.majors.universityRelation]: relationProperty(universityIds)
    }
  };
}

function workLogPage(id, title, category, studentIds) {
  return {
    ...titlePage(id, NOTION_PROPERTY_NAMES.workLog.title, title),
    properties: {
      [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(title),
      [NOTION_PROPERTY_NAMES.workLog.category]: selectProperty(category),
      [NOTION_PROPERTY_NAMES.workLog.students]: relationProperty(studentIds)
    }
  };
}

function titleProperty(value) {
  return {
    type: 'title',
    title: [{ plain_text: value }]
  };
}

function relationProperty(ids) {
  return {
    type: 'relation',
    relation: ids.map((id) => ({ id }))
  };
}

function selectProperty(name) {
  return {
    type: 'select',
    select: { name }
  };
}
