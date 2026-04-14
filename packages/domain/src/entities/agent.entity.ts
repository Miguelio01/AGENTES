export interface AgentProps {
  id: string;
  name: string;
  systemPrompt: string;
  tools: string[];
  config?: Record<string, any>;
}

export class Agent {
  constructor(private readonly props: AgentProps) {}

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get systemPrompt(): string { return this.props.systemPrompt; }
  get tools(): string[] { return this.props.tools; }
  get config(): Record<string, any> | undefined { return this.props.config; }

  static create(props: Omit<AgentProps, 'id'>): Agent {
    return new Agent({
      ...props,
      id: crypto.randomUUID(),
    });
  }
}
