import { Message } from './message.entity';

export interface SessionProps {
  id: string;
  clientId: string;
  agentId: string;
  history: Message[];
  status: 'active' | 'closed';
  lastActivity: Date;
}

export class Session {
  private readonly props: SessionProps;

  constructor(props: SessionProps) {
    this.props = {
      ...props,
      history: props.history || [],
      lastActivity: props.lastActivity || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get clientId(): string { return this.props.clientId; }
  get agentId(): string { return this.props.agentId; }
  get history(): Message[] { return [...this.props.history]; }
  get status(): 'active' | 'closed' { return this.props.status; }
  get lastActivity(): Date { return this.props.lastActivity; }

  static create(props: Omit<SessionProps, 'id' | 'history' | 'status' | 'lastActivity'>): Session {
    return new Session({
      ...props,
      id: crypto.randomUUID(),
      history: [],
      status: 'active',
      lastActivity: new Date(),
    });
  }

  addMessage(message: Message): void {
    this.props.history.push(message);
    this.props.lastActivity = new Date();
  }

  close(): void {
    this.props.status = 'closed';
    this.props.lastActivity = new Date();
  }
}
