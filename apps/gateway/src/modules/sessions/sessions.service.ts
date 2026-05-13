import { Injectable, Inject } from '@nestjs/common';
import { Session, SESSION_REPOSITORY_PORT } from '@agentes/domain';
import type { ISessionRepository } from '@agentes/domain';

@Injectable()
export class SessionsService {
  private readonly SESSION_TIMEOUT_MINUTES = 30;

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
    const session = await this.sessionRepository.findActiveByClientId(clientId);

    if (session) {
      const now = new Date();
      const diffMs = now.getTime() - session.lastActivity.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes > this.SESSION_TIMEOUT_MINUTES) {
        // La sesión ha expirado, la cerramos
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
}
