import { getNotionConfig } from './config.js';
import { getDefaultNotionClient } from './client.js';
import { mapNotionError, safeErrorPayload } from './errors.js';

export const NOTION_DATA_SOURCE_KEYS = Object.freeze([
  'workLog',
  'students',
  'agents',
  'universities',
  'majors'
]);

export const NOTION_PROPERTY_NAMES = Object.freeze({
  workLog: Object.freeze({
    title: '작업 내용',
    students: 'Students',
    major: 'Major',
    category: 'Category',
    deadline: '마감일',
    requestSeason: '요청 시즌'
  }),
  students: Object.freeze({
    name: 'Name',
    agentRelation: 'Agent'
  }),
  agents: Object.freeze({
    name: 'Name'
  }),
  universities: Object.freeze({
    name: 'Name'
  }),
  majors: Object.freeze({
    name: 'Name',
    universityRelation: 'University'
  })
});

export const REQUIRED_NOTION_SCHEMAS = Object.freeze({
  workLog: Object.freeze([
    { name: NOTION_PROPERTY_NAMES.workLog.title, type: 'title' },
    { name: NOTION_PROPERTY_NAMES.workLog.students, type: 'relation' },
    { name: NOTION_PROPERTY_NAMES.workLog.major, type: 'relation' },
    {
      name: NOTION_PROPERTY_NAMES.workLog.category,
      type: 'select',
      options: ['입학 요강', 'SOP 감수(영문)', 'SOP 감수(국문)']
    },
    { name: NOTION_PROPERTY_NAMES.workLog.deadline, type: 'date' },
    {
      name: NOTION_PROPERTY_NAMES.workLog.requestSeason,
      type: 'select',
      options: ['2026/27']
    }
  ]),
  students: Object.freeze([
    { name: NOTION_PROPERTY_NAMES.students.name, type: 'title' },
    { name: NOTION_PROPERTY_NAMES.students.agentRelation, type: 'relation' }
  ]),
  agents: Object.freeze([
    { name: NOTION_PROPERTY_NAMES.agents.name, type: 'title' }
  ]),
  universities: Object.freeze([
    { name: NOTION_PROPERTY_NAMES.universities.name, type: 'title' }
  ]),
  majors: Object.freeze([
    { name: NOTION_PROPERTY_NAMES.majors.name, type: 'title' },
    { name: NOTION_PROPERTY_NAMES.majors.universityRelation, type: 'relation' }
  ])
});

export async function checkNotionSchema({
  client = getDefaultNotionClient(),
  config = getNotionConfig()
} = {}) {
  const dataSources = {};

  for (const key of NOTION_DATA_SOURCE_KEYS) {
    dataSources[key] = await inspectDataSource({
      client,
      dataSourceId: config.dataSourceIds[key],
      requirements: REQUIRED_NOTION_SCHEMAS[key]
    });
  }

  return {
    ok: Object.values(dataSources).every((result) => result.accessible
      && result.missingProperties.length === 0
      && result.typeMismatches.length === 0
      && result.missingOptions.length === 0),
    dataSources
  };
}

export function validateDataSourceSchema(dataSource, requirements) {
  const properties = dataSource?.properties ?? {};
  const missingProperties = [];
  const typeMismatches = [];
  const missingOptions = [];

  for (const requirement of requirements) {
    const property = properties[requirement.name];
    if (!property) {
      missingProperties.push(requirement.name);
      continue;
    }

    if (property.type !== requirement.type) {
      typeMismatches.push({
        property: requirement.name,
        expected: requirement.type,
        actual: property.type ?? 'unknown'
      });
      continue;
    }

    if (Array.isArray(requirement.options)) {
      const availableOptions = new Set(
        (property.select?.options ?? []).map((option) => option.name)
      );
      for (const option of requirement.options) {
        if (!availableOptions.has(option)) {
          missingOptions.push({
            property: requirement.name,
            option
          });
        }
      }
    }
  }

  return {
    accessible: true,
    missingProperties,
    typeMismatches,
    missingOptions
  };
}

async function inspectDataSource({ client, dataSourceId, requirements }) {
  try {
    const dataSource = await client.dataSources.retrieve({ data_source_id: dataSourceId });
    return validateDataSourceSchema(dataSource, requirements);
  } catch (error) {
    const mapped = mapNotionError(error, 'Notion data source could not be inspected.');
    return {
      accessible: false,
      missingProperties: [],
      typeMismatches: [],
      missingOptions: [],
      error: safeErrorPayload(mapped)
    };
  }
}
