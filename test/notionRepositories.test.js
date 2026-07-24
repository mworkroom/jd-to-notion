import test from 'node:test';
import assert from 'node:assert/strict';
import { getMajorSearchKey } from '../src/shared/normalization.js';
import {
  ADMISSIONS_CATEGORY,
  WORK_LOG_TITLE_PREFIX
} from '../src/shared/workLog.js';
import { createAgentsRepository } from '../src/server/notion/repositories/agentsRepository.js';
import { createStudentsRepository } from '../src/server/notion/repositories/studentsRepository.js';
import { createUniversitiesRepository } from '../src/server/notion/repositories/universitiesRepository.js';
import { createMajorsRepository } from '../src/server/notion/repositories/majorsRepository.js';
import { createWorkLogsRepository } from '../src/server/notion/repositories/workLogsRepository.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

const dataSourceIds = {
  agents: 'agents-ds',
  students: 'students-ds',
  universities: 'universities-ds',
  majors: 'majors-ds',
  workLog: 'work-log-ds'
};

test('agent repository reports zero, one, duplicate, and paginated exact matches', async () => {
  const client = makeClient({
    pageSize: 1,
    data: {
      [dataSourceIds.agents]: [
        titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Other Agent'),
        titlePage('agent-2', NOTION_PROPERTY_NAMES.agents.name, 'Requester'),
        titlePage('agent-3', NOTION_PROPERTY_NAMES.agents.name, 'Requester')
      ]
    }
  });
  const repository = createAgentsRepository({ client, dataSourceId: dataSourceIds.agents });

  assert.equal((await repository.findByExactName('Missing')).status, 'missing');

  const oneMatchClient = makeClient({
    data: {
      [dataSourceIds.agents]: [
        titlePage('agent-2', NOTION_PROPERTY_NAMES.agents.name, 'Requester')
      ]
    }
  });
  const oneMatchRepository = createAgentsRepository({ client: oneMatchClient, dataSourceId: dataSourceIds.agents });
  const matched = await oneMatchRepository.findByExactName('Requester');
  assert.equal(matched.status, 'matched');
  assert.equal(matched.selected.id, 'agent-2');

  const duplicate = await repository.findByExactName('Requester');
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.candidateCount, 2);
  assert.equal(client.calls.query.length >= 3, true);
});

test('student repository uses strict same-name family matching and resolves Agent relation names', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.students]: [
        studentPage('student-1', 'Kim', ['agent-1']),
        studentPage('student-2', 'Kim B', ['agent-2']),
        studentPage('student-3', 'Kim D', ['agent-1']),
        studentPage('student-4', 'Kim 상담', ['agent-1']),
        studentPage('student-5', 'Kim_B', ['agent-1'])
      ],
      [dataSourceIds.agents]: [
        titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent One'),
        titlePage('agent-2', NOTION_PROPERTY_NAMES.agents.name, 'Agent Two')
      ]
    }
  });
  const agentsRepository = createAgentsRepository({ client, dataSourceId: dataSourceIds.agents });
  const studentsRepository = createStudentsRepository({
    client,
    dataSourceId: dataSourceIds.students,
    agentsRepository
  });

  const family = await studentsRepository.findFamily('Kim');

  assert.deepEqual(family.map((student) => student.name), ['Kim', 'Kim B', 'Kim D']);
  assert.deepEqual(family[0].agentNames, ['Agent One']);

  const preview = await studentsRepository.getNewClientPreview('Kim');
  assert.equal(preview.suggestedStudentName, 'Kim E');
  assert.equal(preview.proposedAction, 'create');
});

test('student repository preselects an existing unique candidate', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.students]: [studentPage('student-1', 'Kim', ['agent-1'])],
      [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent One')]
    }
  });
  const studentsRepository = createStudentsRepository({
    client,
    dataSourceId: dataSourceIds.students,
    agentsRepository: createAgentsRepository({ client, dataSourceId: dataSourceIds.agents })
  });

  const preview = await studentsRepository.getExistingClientPreview('Kim', 'agent-2');

  assert.equal(preview.selectedStudentId, 'student-1');
  assert.equal(preview.selection.type, 'single-candidate');
});

test('student repository preselects only one requester-Agent match and leaves ambiguity unresolved', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.students]: [
        studentPage('student-1', 'Kim', ['agent-1']),
        studentPage('student-2', 'Kim B', ['agent-2'])
      ],
      [dataSourceIds.agents]: [
        titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent One'),
        titlePage('agent-2', NOTION_PROPERTY_NAMES.agents.name, 'Agent Two')
      ]
    }
  });
  const studentsRepository = createStudentsRepository({
    client,
    dataSourceId: dataSourceIds.students,
    agentsRepository: createAgentsRepository({ client, dataSourceId: dataSourceIds.agents })
  });

  const selected = await studentsRepository.getExistingClientPreview('Kim', 'agent-2');
  assert.equal(selected.selectedStudentId, 'student-2');
  assert.equal(selected.selection.type, 'requester-agent-match');

  const unresolved = await studentsRepository.getExistingClientPreview('Kim', 'agent-3');
  assert.equal(unresolved.selectedStudentId, null);
  assert.equal(unresolved.selection, null);
});

test('university repository classifies matched, missing, duplicate, and case/whitespace defensive matches', async () => {
  const repository = createUniversitiesRepository({
    client: makeClient({
      data: {
        [dataSourceIds.universities]: [
          titlePage('uni-1', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')
        ]
      }
    }),
    dataSourceId: dataSourceIds.universities
  });

  assert.equal((await repository.findByExactName('  warwick  ')).status, 'matched');
  assert.equal((await repository.findByExactName('York')).status, 'missing');

  const duplicateRepository = createUniversitiesRepository({
    client: makeClient({
      data: {
        [dataSourceIds.universities]: [
          titlePage('uni-1', NOTION_PROPERTY_NAMES.universities.name, 'Warwick'),
          titlePage('uni-2', NOTION_PROPERTY_NAMES.universities.name, ' warwick ')
        ]
      }
    }),
    dataSourceId: dataSourceIds.universities
  });

  const duplicate = await duplicateRepository.findByExactName('Warwick');
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.candidates.length, 2);
});

test('major repository matches normalized Major identity with the correct University relation', async () => {
  const repository = createMajorsRepository({
    client: makeClient({
      data: {
        [dataSourceIds.majors]: [
          majorPage('major-1', 'Computer Science', ['uni-1']),
          majorPage('major-2', 'Computer Science MSc', ['uni-2'])
        ]
      }
    }),
    dataSourceId: dataSourceIds.majors
  });

  const matched = await repository.findByUniversityAndKey({
    universityId: 'uni-1',
    majorSearchKey: getMajorSearchKey('MSc Computer Science'),
    requestedOriginalName: 'MSc Computer Science',
    proposedCreateName: 'Computer Science MSc'
  });

  assert.equal(matched.status, 'matched');
  assert.equal(matched.selected.id, 'major-1');

  const differentUniversity = await repository.findByUniversityAndKey({
    universityId: 'uni-3',
    majorSearchKey: 'computer science',
    requestedOriginalName: 'MSc Computer Science',
    proposedCreateName: 'Computer Science MSc'
  });

  assert.equal(differentUniversity.status, 'missing');
  assert.equal(differentUniversity.proposedCreateName, 'Computer Science MSc');
});

test('major repository matches leading-degree official names to trailing-degree Notion titles', async () => {
  const repository = createMajorsRepository({
    client: makeClient({
      data: {
        [dataSourceIds.majors]: [
          majorPage('major-1', 'Computer Science MSc', ['uni-1'])
        ]
      }
    }),
    dataSourceId: dataSourceIds.majors
  });

  const result = await repository.findByUniversityAndKey({
    universityId: 'uni-1',
    majorSearchKey: getMajorSearchKey('MSc Computer Science'),
    requestedOriginalName: 'MSc Computer Science',
    proposedCreateName: 'Computer Science MSc'
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.selected.name, 'Computer Science MSc');
});

test('major repository reports duplicate matching Majors as ambiguous and paginates', async () => {
  const client = makeClient({
    pageSize: 1,
    data: {
      [dataSourceIds.majors]: [
        majorPage('major-1', 'Computer Science MSc', ['uni-1']),
        majorPage('major-2', 'Computer Science (MSc)', ['uni-1'])
      ]
    }
  });
  const repository = createMajorsRepository({ client, dataSourceId: dataSourceIds.majors });

  const result = await repository.findByUniversityAndKey({
    universityId: 'uni-1',
    majorSearchKey: 'computer science',
    requestedOriginalName: 'MSc Computer Science',
    proposedCreateName: 'Computer Science MSc'
  });

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
  assert.equal(client.calls.query.length, 2);
});

test('major repository blocks matching when University is unresolved', async () => {
  const repository = createMajorsRepository({
    client: makeClient({ data: { [dataSourceIds.majors]: [] } }),
    dataSourceId: dataSourceIds.majors
  });

  const result = await repository.findByUniversityAndKey({
    universityId: null,
    majorSearchKey: 'computer science',
    requestedOriginalName: 'MSc Computer Science',
    proposedCreateName: 'Computer Science MSc'
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.proposedCreateName, 'Computer Science MSc');
});

test('work log repository filters by Student and admissions category and calculates the next title', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.workLog]: [
        workLogPage('work-1', WORK_LOG_TITLE_PREFIX, ADMISSIONS_CATEGORY, ['student-1']),
        workLogPage('work-2', `${WORK_LOG_TITLE_PREFIX} 2`, ADMISSIONS_CATEGORY, ['student-1']),
        workLogPage('work-3', 'Visa', 'Visa', ['student-1']),
        workLogPage('work-4', WORK_LOG_TITLE_PREFIX, ADMISSIONS_CATEGORY, ['student-2'])
      ]
    }
  });
  const repository = createWorkLogsRepository({ client, dataSourceId: dataSourceIds.workLog });

  const logs = await repository.findAdmissionsLogsForStudent('student-1');
  const title = await repository.getNextTitleForStudent('student-1');

  assert.deepEqual(logs, [
    { id: 'work-1', title: WORK_LOG_TITLE_PREFIX, category: ADMISSIONS_CATEGORY },
    { id: 'work-2', title: `${WORK_LOG_TITLE_PREFIX} 2`, category: ADMISSIONS_CATEGORY }
  ]);
  assert.equal(title, `${WORK_LOG_TITLE_PREFIX} 3`);
  assert.equal(client.calls.query[0].filter.and[0].relation.contains, 'student-1');
  assert.equal(client.calls.query[0].filter.and[1].select.equals, ADMISSIONS_CATEGORY);
});

test('work log repository calculates the first title when no existing logs match', async () => {
  const repository = createWorkLogsRepository({
    client: makeClient({ data: { [dataSourceIds.workLog]: [] } }),
    dataSourceId: dataSourceIds.workLog
  });

  assert.equal(await repository.getNextTitleForStudent('student-1'), `${WORK_LOG_TITLE_PREFIX} 1`);
});

test('work log repository finalizes only the title of a newly created Work Log', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.workLog]: [
        workLogPage('work-1', WORK_LOG_TITLE_PREFIX, ADMISSIONS_CATEGORY, ['student-1'])
      ]
    }
  });
  const repository = createWorkLogsRepository({ client, dataSourceId: dataSourceIds.workLog });

  const result = await repository.ensureCreatedWorkLogTitle({
    pageId: 'work-1',
    title: `${WORK_LOG_TITLE_PREFIX} 1`
  });

  assert.equal(result.title, `${WORK_LOG_TITLE_PREFIX} 1`);
  assert.equal(client.calls.updatePage.length, 1);
  assert.deepEqual(
    Object.keys(client.calls.updatePage[0].properties),
    [NOTION_PROPERTY_NAMES.workLog.title]
  );
});

function makeClient({ data = {}, pageSize = 100 } = {}) {
  const calls = {
    query: [],
    retrievePage: [],
    updatePage: []
  };
  const allPages = Object.values(data).flat();

  return {
    calls,
    dataSources: {
      async query(request) {
        calls.query.push(request);
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
        calls.retrievePage.push(page_id);
        const page = allPages.find((candidate) => candidate.id === page_id);
        if (!page) {
          throw Object.assign(new Error('not found'), { status: 404 });
        }
        return page;
      },
      async update(request) {
        calls.updatePage.push(structuredClone(request));
        const page = allPages.find((candidate) => candidate.id === request.page_id);
        if (!page) {
          throw Object.assign(new Error('not found'), { status: 404 });
        }
        page.properties = {
          ...page.properties,
          ...structuredClone(request.properties)
        };
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
