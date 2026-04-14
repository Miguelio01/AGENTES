import { Agent } from '../entities/agent.entity';

export const AGENT_REPOSITORY_PORT = 'IAgentRepository';

export interface IAgentRepository {
  save(agent: Agent): Promise<Agent>;
  findAll(): Promise<Agent[]>;
  findById(id: string): Promise<Agent | null>;
  delete(id: string): Promise<void>;
}
