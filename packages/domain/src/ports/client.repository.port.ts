import { Client } from '../entities/client.entity';

export const CLIENT_REPOSITORY_PORT = 'IClientRepository';

export interface IClientRepository {
  save(client: Client): Promise<Client>;
  findById(id: string): Promise<Client | null>;
  findByPhone(phone: string): Promise<Client | null>;
  findByLid(lid: string): Promise<Client | null>;
  findAll(): Promise<Client[]>;
}
