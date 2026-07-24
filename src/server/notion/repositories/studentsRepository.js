import { normalizeWhitespace, suggestNextStudentName } from '../../../shared/normalization.js';
import { mapNotionError } from '../errors.js';
import { NOTION_PROPERTY_NAMES } from '../schema.js';
import { queryDataSourcePages } from '../pagination.js';
import { readPageUrl, readRelationPageIds, readSelectName, readTitleProperty } from '../pageValues.js';
import { buildStudentProperties } from '../propertyBuilders.js';

export function createStudentsRepository({ client, dataSourceId, agentsRepository }) {
  return {
    async findFamily(baseName) {
      const cleanBaseName = normalizeWhitespace(baseName);
      if (!cleanBaseName) {
        return [];
      }

      const pages = await queryStudentsByTitle(client, dataSourceId, cleanBaseName);
      const familyPattern = new RegExp(`^${escapeRegExp(cleanBaseName)}(?: [A-Z]+)?$`);
      const familyPages = pages
        .map(toStudentSummary)
        .filter((student) => familyPattern.test(normalizeWhitespace(student.name)));

      return Promise.all(
        familyPages.map(async (student) => {
          const agents = agentsRepository
            ? await agentsRepository.resolveAgentNamesByIds(student.agentIds)
            : [];

          return {
            ...student,
            agentNames: agents.map((agent) => agent.name).filter(Boolean),
            agents
          };
        })
      );
    },

    async getNewClientPreview(baseName) {
      const existingFamily = await this.findFamily(baseName);
      return {
        mode: 'new',
        baseName: normalizeWhitespace(baseName),
        existingFamily,
        suggestedStudentName: suggestNextStudentName(
          baseName,
          existingFamily.map((student) => student.name)
        ),
        proposedAction: 'create'
      };
    },

    async getExistingClientPreview(baseName, requesterAgentId = null) {
      const candidates = await this.findFamily(baseName);
      const selectedStudentId = selectExistingStudent(candidates, requesterAgentId);

      return {
        mode: 'existing',
        baseName: normalizeWhitespace(baseName),
        candidates,
        selectedStudentId,
        selection: selectedStudentId
          ? {
              type: getSelectionType(candidates, requesterAgentId, selectedStudentId),
              studentId: selectedStudentId
            }
          : null
      };
    },

    async getById(pageId) {
      try {
        const page = await client.pages.retrieve({ page_id: pageId });
        return toStudentSummary(page);
      } catch (error) {
        throw mapNotionError(error, 'Student page could not be retrieved.');
      }
    },

    async createStudent({ name, agentId }) {
      try {
        const page = await client.pages.create({
          parent: { data_source_id: dataSourceId },
          properties: buildStudentProperties({ name, agentId })
        });
        return toStudentSummary(page);
      } catch (error) {
        throw mapNotionError(error, 'Student page could not be created.');
      }
    }
  };
}

async function queryStudentsByTitle(client, dataSourceId, baseName) {
  try {
    return await queryDataSourcePages(client, {
      data_source_id: dataSourceId,
      filter: {
        property: NOTION_PROPERTY_NAMES.students.name,
        title: {
          contains: baseName
        }
      }
    });
  } catch (error) {
    throw mapNotionError(error, 'Students data source could not be queried.');
  }
}

function toStudentSummary(page) {
  return {
    id: page.id,
    name: readTitleProperty(page, NOTION_PROPERTY_NAMES.students.name),
    url: readPageUrl(page),
    agentIds: readRelationPageIds(page, NOTION_PROPERTY_NAMES.students.agentRelation),
    agentNames: [],
    agents: [],
    status: readSelectName(page, 'Status')
  };
}

function selectExistingStudent(candidates, requesterAgentId) {
  if (candidates.length === 1) {
    return candidates[0].id;
  }

  if (!requesterAgentId) {
    return null;
  }

  const agentMatches = candidates.filter((student) => student.agentIds.includes(requesterAgentId));
  return agentMatches.length === 1 ? agentMatches[0].id : null;
}

function getSelectionType(candidates, requesterAgentId, selectedStudentId) {
  if (candidates.length === 1) {
    return 'single-candidate';
  }

  const selected = candidates.find((student) => student.id === selectedStudentId);
  if (requesterAgentId && selected?.agentIds.includes(requesterAgentId)) {
    return 'requester-agent-match';
  }

  return 'manual-required';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
