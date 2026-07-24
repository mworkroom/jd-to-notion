import { NotionAppError } from './errors.js';

export const NOTION_ENV_KEYS = Object.freeze({
  token: 'NOTION_TOKEN',
  workLog: 'NOTION_WORK_LOG_DATA_SOURCE_ID',
  students: 'NOTION_STUDENTS_DATA_SOURCE_ID',
  agents: 'NOTION_AGENTS_DATA_SOURCE_ID',
  universities: 'NOTION_UNIVERSITIES_DATA_SOURCE_ID',
  majors: 'NOTION_MAJORS_DATA_SOURCE_ID'
});

const DATA_SOURCE_KEYS = ['workLog', 'students', 'agents', 'universities', 'majors'];

export function validateNotionConfig(env = process.env) {
  const missing = [];
  const token = readEnvValue(env, NOTION_ENV_KEYS.token);
  const dataSourceIds = {};

  if (!token) {
    missing.push(NOTION_ENV_KEYS.token);
  }

  for (const key of DATA_SOURCE_KEYS) {
    const envKey = NOTION_ENV_KEYS[key];
    const value = readEnvValue(env, envKey);
    if (!value) {
      missing.push(envKey);
    }
    dataSourceIds[key] = value;
  }

  if (missing.length > 0) {
    throw new NotionAppError({
      code: 'NOTION_CONFIG_MISSING',
      statusCode: 503,
      message: 'Notion is not configured.',
      details: { missing }
    });
  }

  return {
    token,
    dataSourceIds
  };
}

export function getNotionConfig(env = process.env) {
  return validateNotionConfig(env);
}

function readEnvValue(env, key) {
  return String(env?.[key] ?? '').trim();
}
