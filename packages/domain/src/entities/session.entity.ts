import { Message } from './message.entity';
import { EmotionalState } from '../value-objects/emotional-state.vo';

export type SessionFlowState = 
  | 'IDLE' 
  | 'AWAITING_NAME'
  | 'AWAITING_ORDER' 
  | 'AWAITING_E_BILLING_CHOICE'
  | 'AWAITING_DOC_TYPE'
  | 'AWAITING_DOC_NUMBER'
  | 'AWAITING_ADDRESS' 
  | 'AWAITING_FULL_NAME' 
  | 'AWAITING_EMAIL'
  | 'AWAITING_PAYMENT_PROOF'
  | 'AWAITING_ADMIN_APPROVAL'
  | 'READY_FOR_DELIVERY'
  | 'COMPLETED';

export interface SessionProps {
  id: string;
  clientId: string;
  agentId: string;
  history: Message[];
  status: 'active' | 'closed';
  flowState: SessionFlowState;
  emotionalState: EmotionalState;
  metadata?: Record<string, any>;
  lastActivity: Date;
}

export class Session {
  private readonly props: SessionProps;

  constructor(props: SessionProps) {
    this.props = {
      ...props,
      history: props.history || [],
      flowState: props.flowState || 'IDLE',
      emotionalState: props.emotionalState || EmotionalState.neutral(),
      metadata: props.metadata || {},
      lastActivity: props.lastActivity || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get clientId(): string { return this.props.clientId; }
  get agentId(): string { return this.props.agentId; }
  get history(): Message[] { return [...this.props.history]; }
  get status(): 'active' | 'closed' { return this.props.status; }
  get flowState(): SessionFlowState { return this.props.flowState; }
  get emotionalState(): EmotionalState { return this.props.emotionalState; }
  get metadata(): Record<string, any> | undefined { return this.props.metadata; }
  get lastActivity(): Date { return this.props.lastActivity; }

  set metadata(value: Record<string, any> | undefined) {
    this.props.metadata = value;
  }

  static create(props: Omit<SessionProps, 'id' | 'history' | 'status' | 'lastActivity' | 'flowState' | 'emotionalState' | 'metadata'>): Session {
    return new Session({
      ...props,
      id: crypto.randomUUID(),
      history: [],
      status: 'active',
      flowState: 'IDLE',
      emotionalState: EmotionalState.neutral(),
      metadata: {},
      lastActivity: new Date(),
    });
  }

  addMessage(message: Message): void {
    this.props.history.push(message);
    this.props.lastActivity = new Date();
    
    // Mantener ventana deslizante de contexto (últimos 15 mensajes)
    if (this.props.history.length > 15) {
      this.props.history.shift();
    }
  }

  addMessages(messages: Message[]): void {
    this.props.history.push(...messages);
    this.props.lastActivity = new Date();
    
    if (this.props.history.length > 15) {
      this.props.history = this.props.history.slice(-15);
    }
  }

  updateEmotionalState(newState: EmotionalState): void {
    this.props.emotionalState = newState;
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
