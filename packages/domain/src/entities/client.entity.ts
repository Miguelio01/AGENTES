import { EmotionalState } from '../value-objects/emotional-state.vo';

export interface ClientProps {
  id: string; // WhatsApp number or ID
  name: string;
  emotionalState: EmotionalState;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class Client {
  private readonly props: ClientProps;

  constructor(props: ClientProps) {
    this.props = {
      ...props,
      emotionalState: props.emotionalState || EmotionalState.neutral(),
      createdAt: props.createdAt || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get emotionalState(): EmotionalState { return this.props.emotionalState; }
  get metadata(): Record<string, any> | undefined { return this.props.metadata; }
  get createdAt(): Date { return this.props.createdAt; }

  static create(id: string, name: string): Client {
    return new Client({
      id,
      name,
      emotionalState: EmotionalState.neutral(),
      createdAt: new Date(),
    });
  }

  updateEmotionalState(newState: EmotionalState): void {
    this.props.emotionalState = newState;
  }
}
