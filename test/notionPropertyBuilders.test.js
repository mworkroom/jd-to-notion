import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMajorProperties,
  buildStudentProperties,
  buildUniversityProperties,
  buildWorkLogProperties,
  dateProperty,
  relationProperty,
  selectProperty,
  titleProperty
} from '../src/server/notion/propertyBuilders.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

test('Notion property builders create title, relation, select, and date payloads', () => {
  assert.deepEqual(titleProperty('  Kim   B  '), {
    title: [{
      type: 'text',
      text: { content: 'Kim B' }
    }]
  });
  assert.deepEqual(relationProperty(['page-1', 'page-1', 'page-2']), {
    relation: [{ id: 'page-1' }, { id: 'page-2' }]
  });
  assert.deepEqual(selectProperty(' 입학   요강 '), {
    select: { name: '입학 요강' }
  });
  assert.deepEqual(dateProperty(' 2026-07-28 '), {
    date: { start: '2026-07-28' }
  });
});

test('entity property builders use canonical property names only', () => {
  assert.deepEqual(buildStudentProperties({
    name: 'Kim',
    agentId: 'agent-1'
  }), {
    [NOTION_PROPERTY_NAMES.students.name]: titleProperty('Kim'),
    [NOTION_PROPERTY_NAMES.students.agentRelation]: relationProperty(['agent-1'])
  });

  assert.deepEqual(buildUniversityProperties({ name: 'Warwick' }), {
    [NOTION_PROPERTY_NAMES.universities.name]: titleProperty('Warwick')
  });

  assert.deepEqual(buildMajorProperties({
    name: 'Computer Science MSc',
    universityId: 'uni-1'
  }), {
    [NOTION_PROPERTY_NAMES.majors.name]: titleProperty('Computer Science MSc'),
    [NOTION_PROPERTY_NAMES.majors.universityRelation]: relationProperty(['uni-1'])
  });
});

test('Work Log builder writes only the Phase 3 canonical properties', () => {
  const properties = buildWorkLogProperties({
    title: '입학 요강 3',
    deadline: '2026-07-28',
    category: '입학 요강',
    requestSeason: '2026/27',
    studentId: 'student-1',
    majorId: 'major-1'
  });

  assert.deepEqual(Object.keys(properties).sort(), [
    NOTION_PROPERTY_NAMES.workLog.title,
    NOTION_PROPERTY_NAMES.workLog.deadline,
    NOTION_PROPERTY_NAMES.workLog.category,
    NOTION_PROPERTY_NAMES.workLog.requestSeason,
    NOTION_PROPERTY_NAMES.workLog.students,
    NOTION_PROPERTY_NAMES.workLog.major
  ].sort());
  assert.deepEqual(properties[NOTION_PROPERTY_NAMES.workLog.students], {
    relation: [{ id: 'student-1' }]
  });
  assert.deepEqual(properties[NOTION_PROPERTY_NAMES.workLog.major], {
    relation: [{ id: 'major-1' }]
  });
  assert.equal(properties.Status, undefined);
  assert.equal(properties.Hours, undefined);
});
