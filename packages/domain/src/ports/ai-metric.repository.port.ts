import { AiMetric } from '../entities/ai-metric.entity';

export const AI_METRIC_REPOSITORY_PORT = 'IAiMetricRepository';

export interface IAiMetricRepository {
  save(metric: AiMetric): Promise<void>;
  getUsageSummary(days?: number): Promise<any>;
  getPromptEfficiency(days?: number): Promise<any[]>;
  getRecentLogs(limit?: number): Promise<AiMetric[]>;
}
