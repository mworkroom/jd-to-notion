import test from 'node:test';
import assert from 'node:assert/strict';
import { getNotionConfig, validateNotionConfig } from '../src/server/notion/config.js';

const completeEnv = {
  NOTION_TOKEN: 'secret-token',
  NOTION_WORK_LOG_DATA_SOURCE_ID: 'work-log-id',
  NOTION_STUDENTS_DATA_SOURCE_ID: 'students-id',
  NOTION_AGENTS_DATA_SOURCE_ID: 'agents-id',
  NOTION_UNIVERSITIES_DATA_SOURCE_ID: 'universities-id',
  NOTION_MAJORS_DATA_SOURCE_ID: 'majors-id'
};

test('detects missing Notion environment variables', () => {
  assert.throws(
    () => validateNotionConfig({
      NOTION_TOKEN: 'secret-token',
      NOTION_STUDENTS_DATA_SOURCE_ID: 'students-id'
    }),
    (error) => {
      assert.equal(error.code, 'NOTION_CONFIG_MISSING');
      assert.deepEqual(error.details.missing, [
        'NOTION_WORK_LOG_DATA_SOURCE_ID',
        'NOTION_AGENTS_DATA_SOURCE_ID',
        'NOTION_UNIVERSITIES_DATA_SOURCE_ID',
        'NOTION_MAJORS_DATA_SOURCE_ID'
      ]);
      return true;
    }
  );
});

test('does not reveal configured secret values in validation errors', () => {
  assert.throws(
    () => validateNotionConfig({
      ...completeEnv,
      NOTION_TOKEN: 'super-secret-token',
      NOTION_MAJORS_DATA_SOURCE_ID: ''
    }),
    (error) => {
      const serialized = JSON.stringify(error);
      assert.doesNotMatch(serialized, /super-secret-token/);
      assert.deepEqual(error.details.missing, ['NOTION_MAJORS_DATA_SOURCE_ID']);
      return true;
    }
  );
});

test('trims Notion token and data source IDs', () => {
  const config = getNotionConfig({
    NOTION_TOKEN: '  secret-token  ',
    NOTION_WORK_LOG_DATA_SOURCE_ID: ' work-log-id ',
    NOTION_STUDENTS_DATA_SOURCE_ID: ' students-id ',
    NOTION_AGENTS_DATA_SOURCE_ID: ' agents-id ',
    NOTION_UNIVERSITIES_DATA_SOURCE_ID: ' universities-id ',
    NOTION_MAJORS_DATA_SOURCE_ID: ' majors-id '
  });

  assert.equal(config.token, 'secret-token');
  assert.deepEqual(config.dataSourceIds, {
    workLog: 'work-log-id',
    students: 'students-id',
    agents: 'agents-id',
    universities: 'universities-id',
    majors: 'majors-id'
  });
});
