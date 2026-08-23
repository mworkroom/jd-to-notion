import { ADMISSIONS_CATEGORY } from '../../shared/workLog.js';

export function buildGoogleSheetsPreviewRows(items, { targetSheetId }) {
  const held = [];
  const rows = [];
  const admissionsGroups = new Map();

  for (const item of items) {
    const baseIssues = validateBaseItem(item);
    if (baseIssues.length > 0) {
      held.push(toHeldItem(item, baseIssues));
      continue;
    }

    if (item.category === ADMISSIONS_CATEGORY) {
      const groupKey = [
        targetSheetId,
        item.relations.agent.id,
        item.relations.student.id,
        ADMISSIONS_CATEGORY
      ].join('|');
      const group = admissionsGroups.get(groupKey) ?? {
        key: groupKey,
        items: []
      };
      group.items.push(item);
      admissionsGroups.set(groupKey, group);
      continue;
    }

    if (!isValidHours(item.hours)) {
      held.push(toHeldItem(item, [hoursIssue()]));
      continue;
    }

    rows.push(toSingleRow(item));
  }

  for (const group of admissionsGroups.values()) {
    group.items.sort(compareAdmissionsItems);
    const invalidHours = group.items.filter((item) => !isValidHours(item.hours));

    if (invalidHours.length > 0) {
      held.push({
        kind: 'admissions_group',
        outputGroupKey: group.key,
        pageIds: group.items.map((item) => item.id),
        title: ADMISSIONS_CATEGORY,
        reasons: [hoursIssue()]
      });
      continue;
    }

    rows.push(toAdmissionsRow(group));
  }

  rows.sort(compareOutputRows);

  return {
    rows,
    held,
    readyPageCount: rows.reduce((sum, row) => sum + row.pageIds.length, 0),
    heldPageCount: held.reduce((sum, item) => sum + item.pageIds.length, 0)
  };
}

function validateBaseItem(item) {
  const issues = [];
  if (!item.title) {
    issues.push({ code: 'WORK_LOG_TITLE_MISSING', message: 'Work Log 제목이 비어 있습니다.' });
  }
  if (!item.relations) {
    issues.push(item.relationIssue ?? {
      code: 'WORK_LOG_RELATION_INVALID',
      message: 'Work Log 관계를 해석할 수 없습니다.'
    });
  }
  return issues;
}

function toSingleRow(item) {
  return {
    kind: 'single',
    outputGroupKey: `single|${item.id}`,
    pageIds: [item.id],
    firstCreatedTime: item.createdTime,
    values: {
      C: normalizeHours(item.hours),
      D: item.relations.agent.name,
      E: item.relations.student.name,
      F: `${item.relations.university.name} - ${item.relations.major.name}`,
      G: item.title
    }
  };
}

function toAdmissionsRow(group) {
  const first = group.items[0];
  return {
    kind: 'admissions_group',
    outputGroupKey: group.key,
    pageIds: group.items.map((item) => item.id),
    firstCreatedTime: first.createdTime,
    values: {
      C: sumHours(group.items.map((item) => item.hours)),
      D: first.relations.agent.name,
      E: first.relations.student.name,
      F: group.items
        .map((item) => `${item.relations.university.name} - ${item.relations.major.name}`)
        .join('\n'),
      G: ADMISSIONS_CATEGORY
    }
  };
}

function toHeldItem(item, reasons) {
  return {
    kind: 'work_log',
    outputGroupKey: null,
    pageIds: [item.id],
    title: item.title,
    reasons
  };
}

function isValidHours(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hoursIssue() {
  return {
    code: 'HOURS_INVALID',
    message: 'Hours가 비어 있거나 0 이상의 숫자가 아닙니다.'
  };
}

function compareAdmissionsItems(left, right) {
  const leftNumber = admissionsSequence(left.title);
  const rightNumber = admissionsSequence(right.title);
  return leftNumber - rightNumber
    || String(left.createdTime).localeCompare(String(right.createdTime))
    || String(left.id).localeCompare(String(right.id));
}

function admissionsSequence(title) {
  const match = /^입학\s*요강\s+(\d+)$/u.exec(String(title).trim());
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function compareOutputRows(left, right) {
  return String(left.firstCreatedTime).localeCompare(String(right.firstCreatedTime))
    || String(left.outputGroupKey).localeCompare(String(right.outputGroupKey));
}

function sumHours(values) {
  const scale = 1_000_000;
  return values.reduce((sum, value) => sum + Math.round(value * scale), 0) / scale;
}

function normalizeHours(value) {
  return sumHours([value]);
}
