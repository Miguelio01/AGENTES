import { Session, ISessionRepository, Message } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoSessionRepository implements ISessionRepository {
  constructor(private readonly sessionModel: Model<any>) {}

  async save(session: Session): Promise<Session> {
    await this.sessionModel.findByIdAndUpdate(
      session.id,
      {
        clientId: session.clientId,
        agentId: session.agentId,
        history: session.history.map(m => ({
          id: m.id,
          content: m.content,
          role: m.role,
          timestamp: m.timestamp,
          channel: m.channel,
          metadata: m.metadata,
        })),
        status: session.status,
        flowState: session.flowState,
        lastActivity: session.lastActivity,
      },
      { upsert: true, new: true }
    );
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const doc = await this.sessionModel.findById(id);
    if (!doc) return null;
    return new Session({
      id: doc._id,
      clientId: doc.clientId,
      agentId: doc.agentId,
      history: doc.history.map((m: any) => new Message(m)),
      status: doc.status,
      flowState: doc.flowState,
      lastActivity: doc.lastActivity,
    });
  }

  async findActiveByClientId(clientId: string): Promise<Session | null> {
    const doc = await this.sessionModel.findOne({ clientId, status: 'active' });
    if (!doc) return null;
    return new Session({
      id: doc._id,
      clientId: doc.clientId,
      agentId: doc.agentId,
      history: doc.history.map((m: any) => new Message(m)),
      status: doc.status,
      flowState: doc.flowState,
      lastActivity: doc.lastActivity,
    });
  }

  async findAll(): Promise<Session[]> {
    const docs = await this.sessionModel.find();
    return docs.map(doc => new Session({
      id: doc._id,
      clientId: doc.clientId,
      agentId: doc.agentId,
      history: doc.history.map((m: any) => new Message(m)),
      status: doc.status,
      flowState: doc.flowState,
      lastActivity: doc.lastActivity,
    }));
  }
}
