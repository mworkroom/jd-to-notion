import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTION_DATA_SOURCE_KEYS,
  NOTION_PROPERTY_NAMES,
  REQUIRED_NOTION_SCHEMAS,
  checkNotionSchema,
  validateDataSourceSchema
} from '../src/server/notion/schema.js';

test('schema validation accepts the required exact schema', () => {
  const result = validateDataSourceSchema(
    makeDataSource(REQUIRED_NOTION_SCHEMAS.workLog),
    REQUIRED_NOTION_SCHEMAS.workLog
  );

  assert.deepEqual(result, {
    accessible: true,
    missingProperties: [],
    typeMismatches: [],
    missingOptions: []
  });
});

test('schema constants use the documented live relation property names', () => {
  assert.equal(NOTION_PROPERTY_NAMES.students.agentRelation, 'Agent');
  assert.equal(NOTION_PROPERTY_NAMES.majors.universityRelation, 'University');
});

test('schema validation reports missing properties', () => {
  const requirements = REQUIRED_NOTION_SCHEMAS.students;
  const result = validateDataSourceSchema(
    makeDataSource([requirements[0]]),
    requirements
  );

  assert.deepEqual(result.missingProperties, [requirements[1].name]);
  assert.deepEqual(result.typeMismatches, []);
});

test('schema validation reports property type mismatches', () => {
  const requirements = REQUIRED_NOTION_SCHEMAS.majors;
  const result = validateDataSourceSchema(
    makeDataSource([
      requirements[0],
      { name: requirements[1].name, type: 'rich_text' }
    ]),
    requirements
  );

  assert.deepEqual(result.missingProperties, []);
  assert.deepEqual(result.typeMismatches, [{
    property: requirements[1].name,
    expected: 'relation',
    actual: 'rich_text'
  }]);
});

test('schema validation reports missing required select options and exact Major property name', () => {
  const workLog = makeDataSource(REQUIRED_NOTION_SCHEMAS.workLog);
  workLog.properties.Category.select.options = [];
  delete workLog.properties.Major;
  workLog.properties['Major '] = { id: 'Major ', type: 'relation' };

  const result = validateDataSourceSchema(
    workLog,
    REQUIRED_NOTION_SCHEMAS.workLog
  );

  assert.deepEqual(result.missingProperties, ['Major']);
  assert.deepEqual(result.missingOptions, [{
    property: 'Category',
    option: '입학 요강'
  }]);
});

test('schema inspection reports inaccessible data sources cleanly', async () => {
  const config = makeConfig();
  const client = makeSchemaClient(config, {
    majors: Object.assign(new Error('object_not_found'), { status: 404 })
  });

  const result = await checkNotionSchema({ client, config });

  assert.equal(result.ok, false);
  assert.equal(result.dataSources.workLog.accessible, true);
  assert.equal(result.dataSources.majors.accessible, false);
  assert.equal(result.dataSources.majors.error.code, 'NOTION_NOT_FOUND');
  assert.doesNotMatch(JSON.stringify(result), /token/);
});

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

function makeConfig() {
  return {
    token: 'secret-token',
    dataSourceIds: Object.fromEntries(
      NOTION_DATA_SOURCE_KEYS.map((key) => [key, `${key}-id`])
    )
  };
}

function makeSchemaClient(config, failures = {}) {
  const dataSourcesById = Object.fromEntries(
    NOTION_DATA_SOURCE_KEYS.map((key) => [
      config.dataSourceIds[key],
      makeDataSource(REQUIRED_NOTION_SCHEMAS[key])
    ])
  );

  return {
    dataSources: {
      async retrieve({ data_source_id }) {
        const key = NOTION_DATA_SOURCE_KEYS.find(
          (candidate) => config.dataSourceIds[candidate] === data_source_id
        );

        if (failures[key]) {
          throw failures[key];
        }

        return dataSourcesById[data_source_id];
      }
    }
  };
}
