import { Message } from './message.entity';

export type SessionFlowState = 
  | 'IDLE' 
  | 'AWAITING_ORDER' 
  | 'AWAITING_E_BILLING_CHOICE'
  | 'AWAITING_DOC_TYPE'
  | 'AWAITING_DOC_NUMBER'
  | 'AWAITING_ADDRESS' 
  | 'AWAITING_FULL_NAME' 
  | 'AWAITING_PAYMENT_PROOF'
  | 'AWAITING_ADMIN_APPROVAL';

export interface SessionProps {
  id: string;
  clientId: string;
  agentId: string;
  history: Message[];
  status: 'active' | 'closed';
  flowState: SessionFlowState;
  lastActivity: Date;
}

export class Session {
  private readonly props: SessionProps;

  constructor(props: SessionProps) {
    this.props = {
      ...props,
      history: props.history || [],
      flowState: props.flowState || 'IDLE',
      lastActivity: props.lastActivity || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get clientId(): string { return this.props.clientId; }
  get agentId(): string { return this.props.agentId; }
  get history(): Message[] { return [...this.props.history]; }
  get status(): 'active' | 'closed' { return this.props.status; }
  get flowState(): SessionFlowState { return this.props.flowState; }
  get lastActivity(): Date { return this.props.lastActivity; }

  static create(props: Omit<SessionProps, 'id' | 'history' | 'status' | 'lastActivity' | 'flowState'>): Session {
    return new Session({
      ...props,
      id: crypto.randomUUID(),
      history: [],
      status: 'active',
      flowState: 'IDLE',
      lastActivity: new Date(),
    });
  }

  addMessage(message: Message): void {
    this.props.history.push(message);
    this.props.lastActivity = new Date();
  }

  setFlowState(state: SessionFlowState): void {
    this.props.flowState = state;
    this.props.lastActivity = new Date();
  }

  close(): void {
    this.props.status = 'closed';
    this.props.lastActivity = new Date();
  }
}
