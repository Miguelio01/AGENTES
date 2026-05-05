import { Injectable, Inject } from '@nestjs/common';
import { Agent, AGENT_REPOSITORY_PORT } from '@agentes/domain';
import type { IAgentRepository } from '@agentes/domain';

@Injectable()
export class AgentsService {
  constructor(
    @Inject(AGENT_REPOSITORY_PORT) private readonly agentRepository: IAgentRepository,
  ) {}

  async create(name: string, systemPrompt: string, tools: string[]) {
    const agent = Agent.create({ name, systemPrompt, tools });
    return this.agentRepository.save(agent);
  }

  async findAll() {
    return this.agentRepository.findAll();
  }

  async findOne(id: string) {
    return this.agentRepository.findById(id);
  }
}
