import { Agent, IAgentRepository } from '@agentes/domain';
import { Model } from 'mongoose';
import { AgentDocument } from './schemas/agent.schema';

export class MongoAgentRepository implements IAgentRepository {
  constructor(private readonly agentModel: Model<AgentDocument>) {}

  async save(agent: Agent): Promise<Agent> {
    await this.agentModel.findByIdAndUpdate(
      agent.id,
      {
        name: agent.name,
        systemPrompt: agent.systemPrompt,
        tools: agent.tools,
        config: agent.config,
      },
      { upsert: true, new: true }
    );
    return agent;
  }

  async findAll(): Promise<Agent[]> {
    const docs = await this.agentModel.find();
    return docs.map(doc => new Agent({
      id: doc._id,
      name: doc.name,
      systemPrompt: doc.systemPrompt,
      tools: doc.tools,
      config: doc.config,
    }));
  }

  async findById(id: string): Promise<Agent | null> {
    const doc = await this.agentModel.findById(id);
    if (!doc) return null;
    return new Agent({
      id: doc._id,
      name: doc.name,
      systemPrompt: doc.systemPrompt,
      tools: doc.tools,
      config: doc.config,
    });
  }

  async delete(id: string): Promise<void> {
    await this.agentModel.findByIdAndDelete(id);
  }
}
