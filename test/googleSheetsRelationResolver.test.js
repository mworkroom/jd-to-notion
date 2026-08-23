import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSheetsRelationResolver } from '../src/server/googleSheets/relationResolver.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

test('retries a temporary Notion timeout and caches shared relation pages', async () => {
  const calls = [];
  const delays = [];
  let studentAttempts = 0;
  const pages = new Map([
    ['student-1', studentPage()],
    ['agent-1', titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent')],
    ['major-1', majorPage()],
    ['university-1', titlePage('university-1', NOTION_PROPERTY_NAMES.universities.name, 'University')]
  ]);
  const resolver = createGoogleSheetsRelationResolver({
    client: {
      pages: {
        async retrieve({ page_id }) {
          calls.push(page_id);
          if (page_id === 'student-1' && studentAttempts === 0) {
            studentAttempts += 1;
            throw Object.assign(new Error('timeout'), {
              code: 'notionhq_client_request_timeout'
            });
          }
          return structuredClone(pages.get(page_id));
        }
      }
    },
    sleep: async (milliseconds) => delays.push(milliseconds)
  });
  const workLog = {
    studentIds: ['student-1'],
    majorIds: ['major-1']
  };

  const first = await resolver.resolve(workLog);
  const second = await resolver.resolve(workLog);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(delays, [300]);
  assert.equal(calls.filter((id) => id === 'student-1').length, 2);
  assert.equal(calls.filter((id) => id === 'major-1').length, 1);
  assert.equal(calls.filter((id) => id === 'agent-1').length, 1);
  assert.equal(calls.filter((id) => id === 'university-1').length, 1);
});

test('holds a missing related page without retrying it', async () => {
  let attempts = 0;
  const resolver = createGoogleSheetsRelationResolver({
    client: {
      pages: {
        async retrieve() {
          attempts += 1;
          throw Object.assign(new Error('not found'), { status: 404 });
        }
      }
    },
    sleep: async () => {}
  });

  const result = await resolver.resolve({
    studentIds: ['student-1'],
    majorIds: ['major-1']
  });

  assert.equal(result.ok, false);
  assert.equal(result.issue.code, 'RELATION_PAGE_NOT_FOUND');
  assert.equal(attempts, 2);
});

function studentPage() {
  return {
    id: 'student-1',
    properties: {
      [NOTION_PROPERTY_NAMES.students.name]: titleProperty('Student'),
      [NOTION_PROPERTY_NAMES.students.agentRelation]: relationProperty(['agent-1'])
    }
  };
}

function majorPage() {
  return {
    id: 'major-1',
    properties: {
      [NOTION_PROPERTY_NAMES.majors.name]: titleProperty('Major'),
      [NOTION_PROPERTY_NAMES.majors.universityRelation]: relationProperty(['university-1'])
    }
  };
}

function titlePage(id, propertyName, value) {
  return { id, properties: { [propertyName]: titleProperty(value) } };
}

function titleProperty(value) {
  return { type: 'title', title: [{ plain_text: value }] };
}

function relationProperty(ids) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
