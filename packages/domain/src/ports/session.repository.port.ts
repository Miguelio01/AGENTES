import { Session } from '../entities/session.entity';

export const SESSION_REPOSITORY_PORT = 'ISessionRepository';

export interface ISessionRepository {
  save(session: Session): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findActiveByClientId(clientId: string): Promise<Session | null>;
  findLastByClientId(clientId: string): Promise<Session | null>;
  findActiveByState(state: string): Promise<Session[]>;
  findAll(): Promise<Session[]>;
}
