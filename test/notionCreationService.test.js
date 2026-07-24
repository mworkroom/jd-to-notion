import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCreationJournal } from '../src/server/notion/creationJournal.js';
import { createDefaultNotionCreationService } from '../src/server/notion/notionCreationService.js';
import {
  ADMISSIONS_CATEGORY,
  WORK_LOG_TITLE_PREFIX
} from '../src/shared/workLog.js';
import {
  NOTION_DATA_SOURCE_KEYS,
  NOTION_PROPERTY_NAMES,
  REQUIRED_NOTION_SCHEMAS
} from '../src/server/notion/schema.js';

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

test('creation service creates in Student-University-Major-Work Log order with final relations', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
      [dataSourceIds.students]: [],
      [dataSourceIds.universities]: [
        titlePage('uni-warwick', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')
      ],
      [dataSourceIds.majors]: [],
      [dataSourceIds.workLog]: []
    }
  });
  const journal = createMemoryCreationJournal();
  const service = createDefaultNotionCreationService({
    config,
    client,
    journal
  });

  const result = await service.create(makeNewClientRequest());

  assert.equal(result.ok, true);
  assert.equal(result.student.action, 'create');
  assert.equal(result.finalStudentName, 'Kim');
  assert.deepEqual(
    client.calls.filter((call) => call.operation === 'create').map((call) => call.entity),
    ['students', 'universities', 'majors', 'majors', 'workLog', 'workLog']
  );
  assert.equal(result.universities.filter((item) => item.action === 'create').length, 1);
  assert.equal(result.majors.length, 2);
  assert.notEqual(result.majors[0].universityId, result.majors[1].universityId);
  assert.deepEqual(
    result.workLogs.map((workLog) => workLog.title),
    [`${WORK_LOG_TITLE_PREFIX} 1`, `${WORK_LOG_TITLE_PREFIX} 2`]
  );
  assert.equal(result.workLogs[0].deadline, '2026-07-28');
  assert.equal(result.workLogs[0].category, ADMISSIONS_CATEGORY);
  assert.equal(result.workLogs[0].requestSeason, '2026/27');

  const workLogCreates = client.calls.filter(
    (call) => call.operation === 'create' && call.entity === 'workLog'
  );
  assert.equal(workLogCreates.length, 2);
  for (const [index, workLogCreate] of workLogCreates.entries()) {
    assert.deepEqual(
      workLogCreate.request.properties[NOTION_PROPERTY_NAMES.workLog.students].relation,
      [{ id: result.student.id }]
    );
    assert.deepEqual(
      workLogCreate.request.properties[NOTION_PROPERTY_NAMES.workLog.major].relation,
      [{ id: result.majors[index].id }]
    );
    assert.equal(workLogCreate.request.properties.Status, undefined);
  }
  const titleUpdates = client.calls.filter(
    (call) => call.operation === 'update' && call.entity === 'workLog'
  );
  assert.equal(titleUpdates.length, 2);
  for (const titleUpdate of titleUpdates) {
    assert.deepEqual(
      Object.keys(titleUpdate.request.properties),
      [NOTION_PROPERTY_NAMES.workLog.title]
    );
  }

  const serializedResult = JSON.stringify(result);
  assert.doesNotMatch(serializedResult, /secret-token/);
  assert.doesNotMatch(serializedResult, /properties/);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);

  const journalRecord = await journal.get(result.fingerprint);
  const serializedJournal = JSON.stringify(journalRecord);
  assert.equal(journalRecord.status, 'completed');
  assert.doesNotMatch(serializedJournal, /Requester|Kim|Warwick|Nottingham|Computer Science/);
  assert.doesNotMatch(serializedJournal, /secret-token|properties/);

  await assert.rejects(
    () => service.create(makeNewClientRequest()),
    { code: 'NOTION_CREATE_DUPLICATE', statusCode: 409 }
  );
  assert.equal(
    client.calls.filter((call) => call.operation === 'create').length,
    6
  );
});

test('creation service recovers from journal IDs without duplicating earlier pages', async () => {
  const client = makeClient({
    failOnceOnCreate: 'majors',
    data: {
      [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
      [dataSourceIds.students]: [],
      [dataSourceIds.universities]: [
        titlePage('uni-warwick', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')
      ],
      [dataSourceIds.majors]: [],
      [dataSourceIds.workLog]: []
    }
  });
  const journal = createMemoryCreationJournal();
  const service = createDefaultNotionCreationService({
    config,
    client,
    journal
  });

  await assert.rejects(
    () => service.create(makeNewClientRequest()),
    (error) => {
      assert.equal(error.code, 'NOTION_CREATE_PARTIAL_FAILURE');
      assert.equal(error.details.failedStep, 'majors');
      assert.equal(error.details.partialResult.student.action, 'create');
      assert.equal(error.details.partialResult.universities.length, 2);
      return true;
    }
  );

  const recovered = await service.create(makeNewClientRequest());
  const creates = client.calls.filter((call) => call.operation === 'create');

  assert.equal(recovered.ok, true);
  assert.equal(creates.filter((call) => call.entity === 'students').length, 1);
  assert.equal(creates.filter((call) => call.entity === 'universities').length, 1);
  assert.equal(creates.filter((call) => call.entity === 'majors').length, 3);
  assert.equal(creates.filter((call) => call.entity === 'workLog').length, 2);
  assert.deepEqual(
    recovered.workLogs.map((workLog) => workLog.title),
    [`${WORK_LOG_TITLE_PREFIX} 1`, `${WORK_LOG_TITLE_PREFIX} 2`]
  );
});

test('creation service resumes after a later Work Log failure without duplicating the first Work Log', async () => {
  const client = makeClient({
    failOnceOnCreateOccurrence: { entity: 'workLog', occurrence: 2 },
    data: {
      [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
      [dataSourceIds.students]: [],
      [dataSourceIds.universities]: [
        titlePage('uni-warwick', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')
      ],
      [dataSourceIds.majors]: [],
      [dataSourceIds.workLog]: []
    }
  });
  const journal = createMemoryCreationJournal();
  const service = createDefaultNotionCreationService({ config, client, journal });

  await assert.rejects(
    () => service.create(makeNewClientRequest()),
    (error) => {
      assert.equal(error.code, 'NOTION_CREATE_PARTIAL_FAILURE');
      assert.match(error.details.failedStep, /^work_log:/);
      assert.deepEqual(
        error.details.partialResult.workLogs.map((workLog) => workLog.title),
        [`${WORK_LOG_TITLE_PREFIX} 1`]
      );
      return true;
    }
  );

  const recovered = await service.create(makeNewClientRequest());

  assert.deepEqual(
    recovered.workLogs.map((workLog) => workLog.title),
    [`${WORK_LOG_TITLE_PREFIX} 1`, `${WORK_LOG_TITLE_PREFIX} 2`]
  );
  assert.equal(client.data[dataSourceIds.workLog].length, 2);
  assert.equal(
    client.calls.filter((call) => call.operation === 'create' && call.entity === 'workLog').length,
    3
  );
});

test('creation service blocks unresolved Agent, Student, and unconfirmed Major before writes', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.agents]: [],
      [dataSourceIds.students]: [],
      [dataSourceIds.universities]: [],
      [dataSourceIds.majors]: [],
      [dataSourceIds.workLog]: []
    }
  });
  const service = createDefaultNotionCreationService({
    config,
    client,
    journal: createMemoryCreationJournal()
  });

  await assert.rejects(
    () => service.create(makeNewClientRequest()),
    { code: 'AGENT_NOT_FOUND', statusCode: 409 }
  );
  assert.equal(client.calls.some((call) => call.operation === 'create'), false);

  client.data[dataSourceIds.agents].push(
    titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')
  );
  const unconfirmed = makeNewClientRequest();
  unconfirmed.programmes[0].majorNameConfirmed = false;
  await assert.rejects(
    () => service.create(unconfirmed),
    { code: 'MAJOR_NAME_UNCONFIRMED', statusCode: 409 }
  );
  assert.equal(client.calls.some((call) => call.operation === 'create'), false);
});

function makeNewClientRequest() {
  return {
    clientMode: 'new',
    requesterName: 'Requester',
    requestDateTime: '2026-07-24T10:00:00+09:00',
    studentName: 'Kim',
    extractionWarnings: [],
    programmes: [
      {
        universityName: 'Warwick',
        programmeNameOriginal: 'MSc Computer Science',
        programmeUrl: 'https://warwick.example/programme',
        reviewedMajorName: 'Computer Science MSc',
        majorNameConfirmed: true
      },
      {
        universityName: 'Nottingham',
        programmeNameOriginal: 'Computer Science MSc',
        programmeUrl: 'https://nottingham.example/programme',
        reviewedMajorName: 'Computer Science MSc',
        majorNameConfirmed: true
      }
    ]
  };
}

function makeClient({
  data = {},
  failOnceOnCreate = null,
  failOnceOnCreateOccurrence = null
} = {}) {
  const calls = [];
  let nextPageId = 1;
  let remainingFailure = failOnceOnCreate;
  const createCounts = new Map();
  const schemas = Object.fromEntries(
    NOTION_DATA_SOURCE_KEYS.map((key) => [
      dataSourceIds[key],
      makeDataSource(REQUIRED_NOTION_SCHEMAS[key])
    ])
  );
  const entityByDataSource = Object.fromEntries(
    Object.entries(dataSourceIds).map(([key, id]) => [id, key])
  );

  const client = {
    calls,
    data,
    dataSources: {
      async retrieve({ data_source_id }) {
        return schemas[data_source_id];
      },
      async query(request) {
        const pages = data[request.data_source_id] ?? [];
        const start = Number(request.start_cursor ?? 0);
        return {
          results: pages.slice(start, start + 100),
          has_more: false,
          next_cursor: null
        };
      }
    },
    pages: {
      async retrieve({ page_id }) {
        const page = Object.values(data)
          .flat()
          .find((candidate) => candidate.id === page_id);
        if (!page) {
          throw Object.assign(new Error('not found'), { status: 404 });
        }
        return page;
      },
      async create(request) {
        const dataSourceId = request.parent.data_source_id;
        const entity = entityByDataSource[dataSourceId];
        calls.push({
          operation: 'create',
          entity,
          request: structuredClone(request)
        });
        createCounts.set(entity, (createCounts.get(entity) ?? 0) + 1);

        const occurrenceFailure = failOnceOnCreateOccurrence?.entity === entity
          && failOnceOnCreateOccurrence.occurrence === createCounts.get(entity);
        if (remainingFailure === entity || occurrenceFailure) {
          remainingFailure = null;
          failOnceOnCreateOccurrence = null;
          throw Object.assign(new Error('controlled failure'), { status: 500 });
        }

        const page = {
          id: `created-${nextPageId++}`,
          url: `https://notion.test/created-${nextPageId - 1}`,
          properties: structuredClone(request.properties)
        };
        data[dataSourceId] ??= [];
        data[dataSourceId].push(page);
        return page;
      },
      async update(request) {
        for (const [dataSourceId, pages] of Object.entries(data)) {
          const page = pages.find((candidate) => candidate.id === request.page_id);
          if (!page) {
            continue;
          }
          calls.push({
            operation: 'update',
            entity: entityByDataSource[dataSourceId],
            request: structuredClone(request)
          });
          page.properties = {
            ...page.properties,
            ...structuredClone(request.properties)
          };
          return page;
        }
        throw Object.assign(new Error('not found'), { status: 404 });
      }
    }
  };

  return client;
}

function makeDataSource(requirements) {
  return {
    properties: Object.fromEntries(
      requirements.map((requirement) => [
        requirement.name,
        {
          id: requirement.name,
          type: requirement.type,
          ...(requirement.type === 'select'
            ? {
                select: {
                  options: (requirement.options ?? []).map((name) => ({ name }))
                }
              }
            : {})
        }
      ])
    )
  };
}

function titlePage(id, propertyName, title) {
  return {
    id,
    url: `https://notion.test/${id}`,
    properties: {
      [propertyName]: {
        type: 'title',
        title: [{ plain_text: title }]
      }
    }
  };
}
