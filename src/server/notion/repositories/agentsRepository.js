import { normalizeWhitespace } from '../../../shared/normalization.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readTitleProperty } from '../pageValues.js';

export function createAgentsRepository({ client, dataSourceId }) {
  return {
    async findByExactName(name) {
      const requestedName = normalizeWhitespace(name);
      if (!requestedName) {
        return makeMatchResult([]);
      }

      const pages = await queryAgentsByTitle(client, dataSourceId, requestedName);
      const candidates = pages
        .map(toAgentSummary)
        .filter((agent) => normalizeWhitespace(agent.name) === requestedName);

      return makeMatchResult(candidates);
    },

    async resolveAgentNamesByIds(agentIds = []) {
      const uniqueIds = [...new Set(agentIds.filter(Boolean))];
      const agents = [];

      for (const id of uniqueIds) {
        try {
          const page = await client.pages.retrieve({ page_id: id });
          agents.push(toAgentSummary(page, id));
        } catch {
          agents.push({
            id,
            name: 'Unknown Agent',
            url: null
          });
        }
      }

      return agents;
    }
  };
}

async function queryAgentsByTitle(client, dataSourceId, name) {
  try {
    return await queryDataSourcePages(client, {
      data_source_id: dataSourceId,
      filter: {
        property: NOTION_PROPERTY_NAMES.agents.name,
        title: {
          equals: name
        }
      }
    });
  } catch (error) {
    throw mapNotionError(error, 'Agents data source could not be queried.');
  }
}

function makeMatchResult(candidates) {
  if (candidates.length === 1) {
    return {
      status: 'matched',
      candidateCount: 1,
      selected: candidates[0],
      candidates: []
    };
  }

  return {
    status: candidates.length === 0 ? 'missing' : 'ambiguous',
    candidateCount: candidates.length,
    selected: null,
    candidates
  };
}

function toAgentSummary(page, fallbackId = null) {
  return {
    id: page?.id ?? fallbackId,
    name: readTitleProperty(page, NOTION_PROPERTY_NAMES.agents.name),
    url: readPageUrl(page)
  };
}
