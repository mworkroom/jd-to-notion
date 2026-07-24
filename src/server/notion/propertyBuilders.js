import { normalizeWhitespace } from '../../shared/normalization.js';
import { NOTION_PROPERTY_NAMES } from './schema.js';

export function titleProperty(value) {
  return {
    title: [{
      type: 'text',
      text: {
        content: normalizeWhitespace(value)
      }
    }]
  };
}

export function relationProperty(pageIds = []) {
  return {
    relation: [...new Set(pageIds.filter(Boolean))].map((id) => ({ id }))
  };
}

export function selectProperty(value) {
  return {
    select: {
      name: normalizeWhitespace(value)
    }
  };
}

export function dateProperty(value) {
  return {
    date: {
      start: normalizeWhitespace(value)
    }
  };
}

export function buildStudentProperties({ name, agentId }) {
  return {
    [NOTION_PROPERTY_NAMES.students.name]: titleProperty(name),
    [NOTION_PROPERTY_NAMES.students.agentRelation]: relationProperty([agentId])
  };
}

export function buildUniversityProperties({ name }) {
  return {
    [NOTION_PROPERTY_NAMES.universities.name]: titleProperty(name)
  };
}

export function buildMajorProperties({ name, universityId }) {
  return {
    [NOTION_PROPERTY_NAMES.majors.name]: titleProperty(name),
    [NOTION_PROPERTY_NAMES.majors.universityRelation]: relationProperty([universityId])
  };
}

export function buildWorkLogProperties({
  title,
  deadline,
  category,
  requestSeason,
  studentId,
  majorIds
}) {
  return {
    [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(title),
    [NOTION_PROPERTY_NAMES.workLog.deadline]: dateProperty(deadline),
    [NOTION_PROPERTY_NAMES.workLog.category]: selectProperty(category),
    [NOTION_PROPERTY_NAMES.workLog.requestSeason]: selectProperty(requestSeason),
    [NOTION_PROPERTY_NAMES.workLog.students]: relationProperty([studentId]),
    [NOTION_PROPERTY_NAMES.workLog.major]: relationProperty(majorIds)
  };
}
