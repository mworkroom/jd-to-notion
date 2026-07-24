import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';
import {
  NOTION_DATA_SOURCE_KEYS,
  REQUIRED_NOTION_SCHEMAS
} from '../src/server/notion/schema.js';

test('/api/notion/schema returns a browser-safe schema summary', async () => {
  const config = makeConfig();
  const server = createAppServer({
    notionConfig: config,
    notionClient: makeSchemaClient(config)
  });
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/schema`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.dataSources.workLog.accessible, true);
    assert.doesNotMatch(JSON.stringify(payload), /secret-token/);
    assert.equal(payload.dataSources.workLog.missingProperties.length, 0);
  } finally {
    await close(server);
  }
});

test('/api/notion/schema reports missing Notion configuration only on the Notion endpoint', async () => {
  const savedEnv = snapshotNotionEnv();
  clearNotionEnv();
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);

    const response = await fetch(`${baseUrl}/api/notion/schema`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'NOTION_CONFIG_MISSING');
    assert.match(JSON.stringify(payload.error.details.missing), /NOTION_TOKEN/);
  } finally {
    restoreNotionEnv(savedEnv);
    await close(server);
  }
});

function makeConfig() {
  return {
    token: 'secret-token',
    dataSourceIds: Object.fromEntries(
      NOTION_DATA_SOURCE_KEYS.map((key) => [key, `${key}-id`])
    )
  };
}

function makeSchemaClient(config) {
  const dataSourcesById = Object.fromEntries(
    NOTION_DATA_SOURCE_KEYS.map((key) => [
      config.dataSourceIds[key],
      {
        properties: Object.fromEntries(
          REQUIRED_NOTION_SCHEMAS[key].map((requirement) => [
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
      }
    ])
  );

  return {
    dataSources: {
      async retrieve({ data_source_id }) {
        return dataSourcesById[data_source_id];
      }
    }
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
