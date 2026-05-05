import { Injectable, Inject } from '@nestjs/common';
import { Session, SESSION_REPOSITORY_PORT } from '@agentes/domain';
import type { ISessionRepository } from '@agentes/domain';

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_REPOSITORY_PORT) private readonly sessionRepository: ISessionRepository,
  ) {}

  async create(session: Session) {
    return this.sessionRepository.save(session);
  }

  async update(session: Session) {
    return this.sessionRepository.save(session);
  }

  async findActiveByClientId(clientId: string): Promise<Session | null> {
    return this.sessionRepository.findActiveByClientId(clientId);
  }
}
