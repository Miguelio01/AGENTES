import { AiMetric, IAiMetricRepository } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoAiMetricRepository implements IAiMetricRepository {
  constructor(private readonly metricModel: Model<any>) {}

  async save(metric: AiMetric): Promise<void> {
    const doc = new this.metricModel({
      timestamp: metric.timestamp,
      provider: metric.provider,
      model: metric.model,
      promptTokens: metric.promptTokens,
      completionTokens: metric.completionTokens,
      totalTokens: metric.totalTokens,
      latencyMs: metric.latencyMs,
      promptSnippet: metric.promptSnippet,
      responseSnippet: metric.responseSnippet,
      status: metric.status,
    });
    await doc.save();
  }

  async getUsageSummary(days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.metricModel.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { provider: '$provider', model: '$model' },
          totalCalls: { $sum: 1 },
          totalPromptTokens: { $sum: '$promptTokens' },
          totalCompletionTokens: { $sum: '$completionTokens' },
          totalTokens: { $sum: '$totalTokens' },
          avgLatencyMs: { $avg: '$latencyMs' },
          successRate: {
            $avg: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          provider: '$_id.provider',
          model: '$_id.model',
          totalCalls: 1,
          totalPromptTokens: 1,
          totalCompletionTokens: 1,
          totalTokens: 1,
          avgLatencyMs: { $round: ['$avgLatencyMs', 2] },
          successRate: { $round: [{ $multiply: ['$successRate', 100] }, 2] },
        },
      },
      { $sort: { totalTokens: -1 } },
    ]);

    return {
      periodDays: days,
      since: startDate,
      usage: stats,
    };
  }
}
