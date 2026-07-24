import { createAgentsRepository } from './agentsRepository.js';
import { createStudentsRepository } from './studentsRepository.js';
import { createUniversitiesRepository } from './universitiesRepository.js';
import { createMajorsRepository } from './majorsRepository.js';
import { createWorkLogsRepository } from './workLogsRepository.js';

export function createNotionRepositories({ client, config }) {
  const agents = createAgentsRepository({
    client,
    dataSourceId: config.dataSourceIds.agents
  });

  return {
    agents,
    students: createStudentsRepository({
      client,
      dataSourceId: config.dataSourceIds.students,
      agentsRepository: agents
    }),
    universities: createUniversitiesRepository({
      client,
      dataSourceId: config.dataSourceIds.universities
    }),
    majors: createMajorsRepository({
      client,
      dataSourceId: config.dataSourceIds.majors
    }),
    workLogs: createWorkLogsRepository({
      client,
      dataSourceId: config.dataSourceIds.workLog
    })
  };
}
