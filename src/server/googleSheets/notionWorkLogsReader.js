import { mapNotionError } from '../notion/errors.js';
import { queryDataSourcePages } from '../notion/pagination.js';
import {
  readNumberProperty,
  readRelationPageIds,
  readSelectName,
  readTitleProperty
} from '../notion/pageValues.js';
import { NOTION_PROPERTY_NAMES } from '../notion/schema.js';

export async function readWorkLogsCreatedSince({ client, dataSourceId, syncStartAt }) {
  try {
    const pages = await queryDataSourcePages(client, {
      data_source_id: dataSourceId,
      filter: {
        timestamp: 'created_time',
        created_time: { on_or_after: syncStartAt }
      },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      page_size: 100
    });

    return pages.map((page) => ({
      id: page.id,
      createdTime: page.created_time ?? '',
      title: readTitleProperty(page, NOTION_PROPERTY_NAMES.workLog.title),
      category: readSelectName(page, NOTION_PROPERTY_NAMES.workLog.category),
      hours: readNumberProperty(page, NOTION_PROPERTY_NAMES.workLog.hours),
      studentIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.workLog.students),
      majorIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.workLog.major)
    }));
  } catch (error) {
    throw mapNotionError(error, 'Work Log pages could not be queried for Google Sheets preview.');
  }
}
