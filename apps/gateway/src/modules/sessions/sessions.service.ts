import { Injectable, Inject } from '@nestjs/common';
import { Session, SESSION_REPOSITORY_PORT } from '@agentes/domain';
import type { ISessionRepository } from '@agentes/domain';

@Injectable()
export class SessionsService {
  private readonly SESSION_TIMEOUT_MINUTES = 120;

  constructor(
    @Inject(SESSION_REPOSITORY_PORT)
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async create(session: Session) {
    return this.sessionRepository.save(session);
  }

  async update(session: Session) {
    return this.sessionRepository.save(session);
  }

  async findActiveByClientId(clientId: string): Promise<Session | null> {
    // 1. Intentar por ID directo (LID o Phone)
    let session = await this.sessionRepository.findActiveByClientId(clientId);

    // 2. Si no hay, y el ID parece un LID, intentar buscar por el teléfono si logramos extraerlo
    if (!session && clientId.includes('@')) {
       const phone = clientId.split('@')[0];
       session = await this.sessionRepository.findActiveByClientId(phone);
    }

    if (session) {
      const now = new Date();
      const diffMs = now.getTime() - session.lastActivity.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes > this.SESSION_TIMEOUT_MINUTES) {
        session.close();
        await this.sessionRepository.save(session);
        return null;
      }
    }

    return session;
  }

  async findLastByClientId(clientId: string): Promise<Session | null> {
    return this.sessionRepository.findLastByClientId(clientId);
  }

  async findActiveSessionsByState(state: string): Promise<Session[]> {
    return this.sessionRepository.findActiveByState(state);
  }
}
