import { ADMISSIONS_CATEGORY, getNextWorkLogTitle } from '../../../shared/workLog.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readRelationPageIds, readSelectName, readTitleProperty } from '../pageValues.js';
import { buildWorkLogProperties, titleProperty } from '../propertyBuilders.js';

export function createWorkLogsRepository({ client, dataSourceId }) {
  return {
    async findAdmissionsLogsForStudent(studentId) {
      const pages = await queryWorkLogsForStudent(client, dataSourceId, studentId);
      return pages
        .map(toWorkLogSummary)
        .filter((entry) => entry.studentIds.includes(studentId))
        .filter((entry) => entry.category === ADMISSIONS_CATEGORY)
        .map(({ id, title, category }) => ({ id, title, category }));
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
        await client.pages.update({
          page_id: pageId,
          properties: {
            [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(title)
          }
        });
        const page = await client.pages.retrieve({ page_id: pageId });
        const storedTitle = readTitleProperty(page, NOTION_PROPERTY_NAMES.workLog.title);
        if (storedTitle !== title) {
          throw new Error(`Work Log title verification failed for page ${pageId}.`);
        }
        return {
          id: page.id,
          title: storedTitle,
          url: readPageUrl(page)
        };
      } catch (error) {
        throw mapNotionError(error, 'Created Work Log title could not be finalized.');
      }
    }
  };
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
    studentIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.workLog.students)
  };
}
