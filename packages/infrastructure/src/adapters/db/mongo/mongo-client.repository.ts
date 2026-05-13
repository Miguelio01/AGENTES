import { Client, IClientRepository } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoClientRepository implements IClientRepository {
  constructor(private readonly clientModel: Model<any>) {}

  async save(client: Client): Promise<Client> {
    await this.clientModel.findByIdAndUpdate(
      client.id,
      {
        name: client.name,
        phone: client.phone,
        fullName: client.fullName,
        documentType: client.documentType,
        documentNumber: client.documentNumber,
        email: client.email,
        address: client.address,
        city: client.city,
        registrationSource: client.registrationSource,
        metadata: client.metadata,
        createdAt: client.createdAt,
      },
      { upsert: true, returnDocument: 'after' }
    );
    return client;
  }

  async findById(id: string): Promise<Client | null> {
    const doc = await this.clientModel.findById(id);
    if (!doc) return null;
    return new Client({
      id: doc._id,
      name: doc.name,
      phone: doc.phone || doc._id.split('@')[0],
      fullName: doc.fullName,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      email: doc.email,
      address: doc.address,
      city: doc.city,
      registrationSource: doc.registrationSource,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    });
  }

  async findAll(): Promise<Client[]> {
    const docs = await this.clientModel.find();
    return docs.map(doc => new Client({
      id: doc._id,
      name: doc.name,
      phone: doc.phone || doc._id.split('@')[0],
      fullName: doc.fullName,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      email: doc.email,
      address: doc.address,
      city: doc.city,
      registrationSource: doc.registrationSource,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    }));
  }
}
