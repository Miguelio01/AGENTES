import { Client, IClientRepository, EmotionalState } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoClientRepository implements IClientRepository {
  constructor(private readonly clientModel: Model<any>) {}

  async save(client: Client): Promise<Client> {
    await this.clientModel.findByIdAndUpdate(
      client.id,
      {
        name: client.name,
        emotionalState: {
          emotion: client.emotionalState.emotion,
          intensity: client.emotionalState.intensity,
          reason: client.emotionalState.reason,
        },
        billingData: client.billingData,
        metadata: client.metadata,
        createdAt: client.createdAt,
      },
      { upsert: true, new: true }
    );
    return client;
  }

  async findById(id: string): Promise<Client | null> {
    const doc = await this.clientModel.findById(id);
    if (!doc) return null;
    return new Client({
      id: doc._id,
      name: doc.name,
      emotionalState: new EmotionalState(
        doc.emotionalState.emotion,
        doc.emotionalState.intensity,
        doc.emotionalState.reason
      ),
      billingData: doc.billingData,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    });
  }

  async findAll(): Promise<Client[]> {
    const docs = await this.clientModel.find();
    return docs.map(doc => new Client({
      id: doc._id,
      name: doc.name,
      emotionalState: new EmotionalState(
        doc.emotionalState.emotion,
        doc.emotionalState.intensity,
        doc.emotionalState.reason
      ),
      billingData: doc.billingData,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    }));
  }
}
