import { mapNotionError } from '../notion/errors.js';
import { readRelationPageIds, readTitleProperty } from '../notion/pageValues.js';
import { NOTION_PROPERTY_NAMES } from '../notion/schema.js';

export function createGoogleSheetsRelationResolver({ client, sleep = wait }) {
  const pageCache = new Map();

  async function retrievePage(pageId) {
    if (!pageCache.has(pageId)) {
      pageCache.set(pageId, retrievePageWithRetry(client, pageId, sleep));
    }

    try {
      return await pageCache.get(pageId);
    } catch (error) {
      pageCache.delete(pageId);
      throw mapNotionError(error, 'A related Notion page could not be retrieved.');
    }
  }

  return {
    async resolve(workLog) {
      const relationIssue = validateSingleRelations(workLog);
      if (relationIssue) {
        return { ok: false, issue: relationIssue };
      }

      try {
        const studentId = workLog.studentIds[0];
        const majorId = workLog.majorIds[0];
        const [studentPage, majorPage] = await Promise.all([
          retrievePage(studentId),
          retrievePage(majorId)
        ]);
        const studentName = readTitleProperty(studentPage, NOTION_PROPERTY_NAMES.students.name);
        const agentIds = readRelationPageIds(
          studentPage,
          NOTION_PROPERTY_NAMES.students.agentRelation
        );
        const majorName = readTitleProperty(majorPage, NOTION_PROPERTY_NAMES.majors.name);
        const universityIds = readRelationPageIds(
          majorPage,
          NOTION_PROPERTY_NAMES.majors.universityRelation
        );

        if (!studentName) {
          return relationFailure('STUDENT_NAME_MISSING', 'Student 이름이 비어 있습니다.');
        }
        if (agentIds.length !== 1) {
          return relationFailure(
            agentIds.length === 0 ? 'AGENT_MISSING' : 'AGENT_AMBIGUOUS',
            `Student에 연결된 Agent가 ${agentIds.length}명입니다.`
          );
        }
        if (!majorName) {
          return relationFailure('MAJOR_NAME_MISSING', 'Major 이름이 비어 있습니다.');
        }
        if (universityIds.length !== 1) {
          return relationFailure(
            universityIds.length === 0 ? 'UNIVERSITY_MISSING' : 'UNIVERSITY_AMBIGUOUS',
            `Major에 연결된 University가 ${universityIds.length}개입니다.`
          );
        }

        const [agentPage, universityPage] = await Promise.all([
          retrievePage(agentIds[0]),
          retrievePage(universityIds[0])
        ]);
        const agentName = readTitleProperty(agentPage, NOTION_PROPERTY_NAMES.agents.name);
        const universityName = readTitleProperty(
          universityPage,
          NOTION_PROPERTY_NAMES.universities.name
        );

        if (!agentName) {
          return relationFailure('AGENT_NAME_MISSING', 'Agent 이름이 비어 있습니다.');
        }
        if (!universityName) {
          return relationFailure('UNIVERSITY_NAME_MISSING', 'University 이름이 비어 있습니다.');
        }

        return {
          ok: true,
          value: {
            student: { id: studentId, name: studentName },
            agent: { id: agentIds[0], name: agentName },
            major: { id: majorId, name: majorName },
            university: { id: universityIds[0], name: universityName }
          }
        };
      } catch (error) {
        if (error?.code === 'NOTION_NOT_FOUND') {
          return relationFailure(
            'RELATION_PAGE_NOT_FOUND',
            '연결된 Notion 페이지를 찾을 수 없습니다.'
          );
        }
        throw error;
      }
    },

    getCacheSize() {
      return pageCache.size;
    }
  };
}

async function retrievePageWithRetry(client, pageId, sleep) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.pages.retrieve({ page_id: pageId });
    } catch (error) {
      if (!isRetryableNotionRead(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw new Error('Notion relation read retry loop ended unexpectedly.');
}

function isRetryableNotionRead(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return error?.code === 'notionhq_client_request_timeout'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNRESET'
    || status === 429
    || (status >= 500 && status <= 504);
}

function getRetryDelayMs(error, attempt) {
  const retryAfter = error?.headers?.get?.('retry-after')
    ?? error?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(2000, 300 * (2 ** (attempt - 1)));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateSingleRelations(workLog) {
  if (workLog.studentIds.length !== 1) {
    return makeIssue(
      workLog.studentIds.length === 0 ? 'STUDENT_MISSING' : 'STUDENT_AMBIGUOUS',
      `Work Log에 연결된 Student가 ${workLog.studentIds.length}명입니다.`
    );
  }

  if (workLog.majorIds.length !== 1) {
    return makeIssue(
      workLog.majorIds.length === 0 ? 'MAJOR_MISSING' : 'MAJOR_AMBIGUOUS',
      `Work Log에 연결된 Major가 ${workLog.majorIds.length}개입니다.`
    );
  }

  return null;
}

function relationFailure(code, message) {
  return { ok: false, issue: makeIssue(code, message) };
}

function makeIssue(code, message) {
  return { code, message };
}
