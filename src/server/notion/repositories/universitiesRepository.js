import { normalizeForComparison, normalizeWhitespace } from '../../../shared/normalization.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readTitleProperty } from '../pageValues.js';
import { buildUniversityProperties } from '../propertyBuilders.js';

export function createUniversitiesRepository({ client, dataSourceId }) {
  return {
    async findByExactName(name) {
      const requestedName = normalizeWhitespace(name);
      if (!requestedName) {
        return makeUniversityResult(requestedName, []);
      }

      const pages = await queryUniversitiesByTitle(client, dataSourceId, requestedName);
      const requestedKey = normalizeForComparison(requestedName);
      const candidates = pages
        .map(toUniversitySummary)
        .filter((university) => normalizeForComparison(university.name) === requestedKey);

      return makeUniversityResult(requestedName, candidates);
    },

    async getById(pageId) {
      try {
        const page = await client.pages.retrieve({ page_id: pageId });
        return toUniversitySummary(page);
      } catch (error) {
        throw mapNotionError(error, 'University page could not be retrieved.');
      }
    },

    async createUniversity({ name }) {
      try {
        const page = await client.pages.create({
          parent: { data_source_id: dataSourceId },
          properties: buildUniversityProperties({ name })
        });
        return toUniversitySummary(page);
      } catch (error) {
        throw mapNotionError(error, 'University page could not be created.');
      }
    }
  };
}

async function queryUniversitiesByTitle(client, dataSourceId, name) {
  try {
    return await queryDataSourcePages(client, {
      data_source_id: dataSourceId,
      filter: {
        property: NOTION_PROPERTY_NAMES.universities.name,
        title: {
          contains: name
        }
      }
    });
  } catch (error) {
    throw mapNotionError(error, 'Universities data source could not be queried.');
  }
}

function makeUniversityResult(requestedName, candidates) {
  if (candidates.length === 1) {
    return {
      status: 'matched',
      requestedName,
      selected: candidates[0],
      candidates: []
    };
  }

  return {
    status: candidates.length === 0 ? 'missing' : 'ambiguous',
    requestedName,
    proposedCreateName: candidates.length === 0 ? requestedName : null,
    selected: null,
    candidates
  };
}

function toUniversitySummary(page) {
  return {
    id: page.id,
    name: readTitleProperty(page, NOTION_PROPERTY_NAMES.universities.name),
    url: readPageUrl(page)
  };
}
