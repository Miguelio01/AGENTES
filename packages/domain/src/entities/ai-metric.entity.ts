export interface AiMetricProps {
  id?: string;
  timestamp: Date;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  systemTokens?: number;
  historyTokens?: number;
  ragTokens?: number;
  latencyMs: number;
  promptSnippet?: string;
  responseSnippet?: string;
  status: 'SUCCESS' | 'ERROR';
}

export class AiMetric {
  constructor(public readonly props: AiMetricProps) {}

  static create(props: Omit<AiMetricProps, 'timestamp'>): AiMetric {
    return new AiMetric({
      ...props,
      timestamp: new Date(),
    });
  }

  get id() { return this.props.id; }
  get timestamp() { return this.props.timestamp; }
  get provider() { return this.props.provider; }
  get model() { return this.props.model; }
  get promptTokens() { return this.props.promptTokens; }
  get completionTokens() { return this.props.completionTokens; }
  get totalTokens() { return this.props.totalTokens; }
  get systemTokens() { return this.props.systemTokens; }
  get historyTokens() { return this.props.historyTokens; }
  get ragTokens() { return this.props.ragTokens; }
  get latencyMs() { return this.props.latencyMs; }
  get promptSnippet() { return this.props.promptSnippet; }
  get responseSnippet() { return this.props.responseSnippet; }
  get status() { return this.props.status; }
}
