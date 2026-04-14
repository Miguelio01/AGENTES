export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface MessageProps {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: Date;
  channel: string;
  metadata?: Record<string, any>;
}

export class Message {
  private readonly props: MessageProps;

  constructor(props: MessageProps) {
    this.props = {
      ...props,
      timestamp: props.timestamp || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get content(): string { return this.props.content; }
  get role(): MessageRole { return this.props.role; }
  get timestamp(): Date { return this.props.timestamp; }
  get channel(): string { return this.props.channel; }
  get metadata(): Record<string, any> | undefined { return this.props.metadata; }

  static create(props: Omit<MessageProps, 'id' | 'timestamp'>): Message {
    return new Message({
      ...props,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    });
  }
}
