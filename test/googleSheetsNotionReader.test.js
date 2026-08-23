import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkLogsCreatedSince } from '../src/server/googleSheets/notionWorkLogsReader.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

test('queries all Work Log pages from the cutoff and preserves Hours zero', async () => {
  const calls = [];
  const pages = [workLogPage('work-1', 0), workLogPage('work-2', 0.5)];
  const client = {
    dataSources: {
      async query(request) {
        calls.push(request);
        const index = request.start_cursor ? 1 : 0;
        return {
          results: [pages[index]],
          has_more: index === 0,
          next_cursor: index === 0 ? '1' : null
        };
      }
    }
  };

  const result = await readWorkLogsCreatedSince({
    client,
    dataSourceId: 'work-log-ds',
    syncStartAt: '2026-08-24T00:00:00+09:00'
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].hours, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filter, {
    timestamp: 'created_time',
    created_time: { on_or_after: '2026-08-24T00:00:00+09:00' }
  });
  assert.equal(calls[0].page_size, 100);
});

function workLogPage(id, hours) {
  return {
    id,
    created_time: '2026-08-24T01:00:00.000Z',
    properties: {
      [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(`입학 요강 ${id.at(-1)}`),
      [NOTION_PROPERTY_NAMES.workLog.category]: {
        type: 'select',
        select: { name: '입학 요강' }
      },
      [NOTION_PROPERTY_NAMES.workLog.hours]: { type: 'number', number: hours },
      [NOTION_PROPERTY_NAMES.workLog.students]: relationProperty(['student-1']),
      [NOTION_PROPERTY_NAMES.workLog.major]: relationProperty([`major-${id}`])
    }
  };
}

function titleProperty(value) {
  return { type: 'title', title: [{ plain_text: value }] };
}

function relationProperty(ids) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
