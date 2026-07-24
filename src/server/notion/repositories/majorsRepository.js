import { getMajorSearchKey } from '../../../shared/normalization.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readRelationPageIds, readTitleProperty } from '../pageValues.js';
import { buildMajorProperties } from '../propertyBuilders.js';

export function createMajorsRepository({ client, dataSourceId }) {
  return {
    async findByUniversityAndKey({
      universityId,
      majorSearchKey,
      requestedOriginalName,
      proposedCreateName
    }) {
      if (!universityId) {
        return {
          status: 'blocked',
          requestedOriginalName,
          searchKey: majorSearchKey,
          proposedCreateName,
          selected: null,
          candidates: []
        };
      }

      const pages = await queryAllMajors(client, dataSourceId);
      const candidates = pages
        .map(toMajorSummary)
        .filter((major) => major.searchKey === majorSearchKey)
        .filter((major) => major.universityIds.includes(universityId));

      if (candidates.length === 1) {
        return {
          status: 'matched',
          requestedOriginalName,
          searchKey: majorSearchKey,
          proposedCreateName: null,
          selected: candidates[0],
          candidates: []
        };
      }

      return {
        status: candidates.length === 0 ? 'missing' : 'ambiguous',
        requestedOriginalName,
        searchKey: majorSearchKey,
        proposedCreateName: candidates.length === 0 ? proposedCreateName : null,
        selected: null,
        candidates
      };
    },

    async getById(pageId) {
      try {
        const page = await client.pages.retrieve({ page_id: pageId });
        return toMajorSummary(page);
      } catch (error) {
        throw mapNotionError(error, 'Major page could not be retrieved.');
      }
    },

    async createMajor({ name, universityId }) {
      try {
        const page = await client.pages.create({
          parent: { data_source_id: dataSourceId },
          properties: buildMajorProperties({ name, universityId })
        });
        return toMajorSummary(page);
      } catch (error) {
        throw mapNotionError(error, 'Major page could not be created.');
      }
    }
  };
}

async function queryAllMajors(client, dataSourceId) {
  try {
    return await queryDataSourcePages(client, {
      data_source_id: dataSourceId
    });
  } catch (error) {
    throw mapNotionError(error, 'Majors data source could not be queried.');
  }
}

function toMajorSummary(page) {
  const name = readTitleProperty(page, NOTION_PROPERTY_NAMES.majors.name);
  return {
    id: page.id,
    name,
    url: readPageUrl(page),
    searchKey: getMajorSearchKey(name),
    universityIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.majors.universityRelation)
  };
}
