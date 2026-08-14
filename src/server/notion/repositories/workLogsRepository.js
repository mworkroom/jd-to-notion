import { ADMISSIONS_CATEGORY, getNextWorkLogTitle } from '../../../shared/workLog.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readRelationPageIds, readSelectName, readTitleProperty } from '../pageValues.js';
import { buildWorkLogProperties, titleProperty } from '../propertyBuilders.js';

const TITLE_FINALIZATION_MAX_ATTEMPTS = 5;

export function createWorkLogsRepository({ client, dataSourceId, sleep = wait }) {
  return {
    async findAdmissionsLogsForStudent(studentId) {
      const pages = await queryWorkLogsForStudent(client, dataSourceId, studentId);
      return pages
        .map(toWorkLogSummary)
        .filter((entry) => entry.studentIds.includes(studentId))
        .filter((entry) => entry.category === ADMISSIONS_CATEGORY)
        .map(({ id, title, category }) => ({ id, title, category }));
    },

    async findAdmissionsLogsWithMajorsForStudent(studentId) {
      const pages = await queryWorkLogsForStudent(client, dataSourceId, studentId);
      return pages
        .map(toWorkLogSummary)
        .filter((entry) => entry.studentIds.includes(studentId))
        .filter((entry) => entry.category === ADMISSIONS_CATEGORY)
        .map(({ id, title, category, majorIds, createdTime }) => ({
          id,
          title,
          category,
          majorIds,
          createdTime
        }));
    },

    async getNextTitleForStudent(studentId) {
      const existingLogs = await this.findAdmissionsLogsForStudent(studentId);
      return getNextWorkLogTitle(existingLogs);
    },

    async getById(pageId) {
      try {
        const page = await client.pages.retrieve({ page_id: pageId });
        return {
          id: page.id,
          title: readTitleProperty(page, NOTION_PROPERTY_NAMES.workLog.title),
          url: readPageUrl(page)
        };
      } catch (error) {
        throw mapNotionError(error, 'Work Log page could not be retrieved.');
      }
    },

    async createWorkLog({
      title,
      deadline,
      category,
      requestSeason,
      studentId,
      majorId
    }) {
      try {
        const page = await client.pages.create({
          parent: { data_source_id: dataSourceId },
          properties: buildWorkLogProperties({
            title,
            deadline,
            category,
            requestSeason,
            studentId,
            majorId
          })
        });

        return {
          id: page.id,
          title,
          url: readPageUrl(page)
        };
      } catch (error) {
        throw mapNotionError(error, 'Work Log page could not be created.');
      }
    },

    async ensureCreatedWorkLogTitle({ pageId, title }) {
      try {
        return await retryTemporaryNotionFailure(async () => {
          await client.pages.update({
            page_id: pageId,
            properties: {
              [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(title)
            }
          });
          const page = await client.pages.retrieve({ page_id: pageId });
          const storedTitle = readTitleProperty(page, NOTION_PROPERTY_NAMES.workLog.title);
          if (storedTitle !== title) {
            const mismatch = new Error(`Work Log title verification failed for page ${pageId}.`);
            mismatch.retryable = true;
            throw mismatch;
          }
          return {
            id: page.id,
            title: storedTitle,
            url: readPageUrl(page)
          };
        }, { sleep });
      } catch (error) {
        throw mapNotionError(error, 'Created Work Log title could not be finalized.');
      }
    }
  };
}

async function retryTemporaryNotionFailure(operation, { sleep }) {
  for (let attempt = 1; attempt <= TITLE_FINALIZATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableNotionFailure(error) || attempt === TITLE_FINALIZATION_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(getRetryDelayMs(error, attempt));
    }
  }
  throw new Error('Notion retry loop ended unexpectedly.');
}

function isRetryableNotionFailure(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return error?.retryable === true
    || status === 409
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
  return Math.min(4000, 500 * (2 ** (attempt - 1)));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function queryWorkLogsForStudent(client, dataSourceId, studentId) {
  try {
    return await queryDataSourcePages(client, {
      data_source_id: dataSourceId,
      filter: {
        and: [
          {
            property: NOTION_PROPERTY_NAMES.workLog.students,
            relation: {
              contains: studentId
            }
          },
          {
            property: NOTION_PROPERTY_NAMES.workLog.category,
            select: {
              equals: ADMISSIONS_CATEGORY
            }
          }
        ]
      }
    });
  } catch (error) {
    throw mapNotionError(error, 'Work Log data source could not be queried.');
  }
}

function toWorkLogSummary(page) {
  return {
    id: page.id,
    title: readTitleProperty(page, NOTION_PROPERTY_NAMES.workLog.title),
    category: readSelectName(page, NOTION_PROPERTY_NAMES.workLog.category),
    studentIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.workLog.students),
    majorIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.workLog.major),
    createdTime: page.created_time ?? ''
  };
}
