import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';
import {
  ADMISSIONS_CATEGORY,
  WORK_LOG_TITLE_PREFIX
} from '../src/shared/workLog.js';
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

test('/api/notion/preview validates input', async () => {
  const server = createAppServer({
    notionConfig: config,
    notionClient: makeClient()
  });
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientMode: 'bad', programmes: [] })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, 'INVALID_PREVIEW_REQUEST');
    assert.match(payload.error.details.errors.join('\n'), /clientMode/);
  } finally {
    await close(server);
  }
});

test('/api/notion/preview returns normalized data and performs no Notion write calls', async () => {
  const client = makeClient({
    data: {
      [dataSourceIds.agents]: [titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Requester')],
      [dataSourceIds.students]: [],
      [dataSourceIds.universities]: [titlePage('uni-1', NOTION_PROPERTY_NAMES.universities.name, 'Warwick')],
      [dataSourceIds.majors]: [],
      [dataSourceIds.workLog]: []
    }
  });
  const server = createAppServer({
    notionConfig: config,
    notionClient: client
  });
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMode: 'new',
        requesterName: 'Requester',
        studentName: 'Kim',
        requestDateTime: '2026-06-17T17:04:00+09:00',
        programmes: [{
          universityName: 'Warwick',
          programmeNameOriginal: 'MSc Computer Science'
        }]
      })
    });
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.programmes[0].major.status, 'missing');
    assert.equal(payload.workLog.title, `${WORK_LOG_TITLE_PREFIX} 1`);
    assert.equal(payload.workLog.category, ADMISSIONS_CATEGORY);
    assert.doesNotMatch(serialized, /secret-token/);
    assert.doesNotMatch(serialized, /properties/);
    assert.equal(client.calls.write, 0);
  } finally {
    await close(server);
  }
});

test('/api/notion/work-log-title calculates the selected Student title', async () => {
  const server = createAppServer({
    notionConfig: config,
    notionClient: makeClient({
      data: {
        [dataSourceIds.workLog]: [
          workLogPage('work-1', WORK_LOG_TITLE_PREFIX, ADMISSIONS_CATEGORY, ['student-1'])
        ]
      }
    })
  });
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/work-log-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedStudentId: 'student-1' })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.workLog.title, `${WORK_LOG_TITLE_PREFIX} 2`);
  } finally {
    await close(server);
  }
});

test('Phase 1 extraction still works when Notion is unconfigured', async () => {
  const savedEnv = snapshotNotionEnv();
  clearNotionEnv();
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: [
          '담당자',
          '2026/06/17 PM 05:04',
          '[업무요청] 테스트학생 입학요강',
          '',
          '🍀University of Warwick',
          '- Medical Biotechnology and Business Management (MSc)',
          'https://warwick.ac.uk/study/postgraduate/courses/msc-medical-biotechnology-business-management/'
        ].join('\n')
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.extraction.studentName, '테스트학생');
  } finally {
    restoreNotionEnv(savedEnv);
    await close(server);
  }
});

function makeClient({ data = {}, pageSize = 100 } = {}) {
  const allPages = Object.values(data).flat();
  const calls = {
    write: 0
  };

  return {
    calls,
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
      },
      async create() {
        calls.write += 1;
      },
      async update() {
        calls.write += 1;
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

function snapshotNotionEnv() {
  return Object.fromEntries(
    [
      'NOTION_TOKEN',
      'NOTION_WORK_LOG_DATA_SOURCE_ID',
      'NOTION_STUDENTS_DATA_SOURCE_ID',
      'NOTION_AGENTS_DATA_SOURCE_ID',
      'NOTION_UNIVERSITIES_DATA_SOURCE_ID',
      'NOTION_MAJORS_DATA_SOURCE_ID'
    ].map((key) => [key, process.env[key]])
  );
}

function clearNotionEnv() {
  for (const key of Object.keys(snapshotNotionEnv())) {
    delete process.env[key];
  }
}

function restoreNotionEnv(savedEnv) {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
