import { Injectable, Inject } from '@nestjs/common';
import { Client, CLIENT_REPOSITORY_PORT } from '@agentes/domain';
import type { IClientRepository } from '@agentes/domain';

@Injectable()
export class ClientsService {
  constructor(
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
  ) {}

  async create(client: Client) {
    return this.clientRepository.save(client);
  }

  async findOne(id: string): Promise<Client | null> {
    return this.clientRepository.findById(id);
  }

  async findByPhone(phone: string): Promise<Client | null> {
    return this.clientRepository.findByPhone(phone);
  }

  async findByLid(lid: string): Promise<Client | null> {
    return this.clientRepository.findByLid(lid);
  }
}
