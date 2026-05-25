import { AiMetric, IAiMetricRepository } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoAiMetricRepository implements IAiMetricRepository {
  constructor(private readonly metricModel: Model<any>) {}

  async save(metric: AiMetric): Promise<void> {
    const doc = new this.metricModel({
      timestamp: metric.timestamp,
      provider: metric.provider,
      model: metric.model,
      promptTag: metric.promptTag,
      promptTokens: metric.promptTokens,
      completionTokens: metric.completionTokens,
      totalTokens: metric.totalTokens,
      systemTokens: metric.systemTokens,
      historyTokens: metric.historyTokens,
      ragTokens: metric.ragTokens,
      latencyMs: metric.latencyMs,
      promptSnippet: metric.promptSnippet,
      responseSnippet: metric.responseSnippet,
      status: metric.status,
    });
    await doc.save();
  }

  async getPromptEfficiency(days: number = 7): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.metricModel.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { promptTag: '$promptTag' },
          totalCalls: { $sum: 1 },
          avgLatencyMs: { $avg: '$latencyMs' },
          avgPromptTokens: { $avg: '$promptTokens' },
          avgCompletionTokens: { $avg: '$completionTokens' },
          totalTokens: { $sum: '$totalTokens' },
          successRate: {
            $avg: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          promptTag: { $ifNull: ['$_id.promptTag', 'unlabeled'] },
          totalCalls: 1,
          totalTokens: 1,
          avgLatencyMs: { $round: ['$avgLatencyMs', 2] },
          avgPromptTokens: { $round: ['$avgPromptTokens', 0] },
          avgCompletionTokens: { $round: ['$avgCompletionTokens', 0] },
          successRate: { $round: [{ $multiply: ['$successRate', 100] }, 2] },
        },
      },
      { $sort: { totalCalls: -1 } },
    ]);
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
          avgSystemTokens: { $avg: '$systemTokens' },
          avgHistoryTokens: { $avg: '$historyTokens' },
          avgRagTokens: { $avg: '$ragTokens' },
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
          avgSystemTokens: { $round: ['$avgSystemTokens', 0] },
          avgHistoryTokens: { $round: ['$avgHistoryTokens', 0] },
          avgRagTokens: { $round: ['$avgRagTokens', 0] },
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

  async getRecentLogs(limit: number = 20): Promise<AiMetric[]> {
    const docs = await this.metricModel
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return docs.map(d => new AiMetric({
      id: d._id.toString(),
      timestamp: d.timestamp,
      provider: d.provider,
      model: d.model,
      promptTag: d.promptTag,
      promptTokens: d.promptTokens,
      completionTokens: d.completionTokens,
      totalTokens: d.totalTokens,
      systemTokens: d.systemTokens,
      historyTokens: d.historyTokens,
      ragTokens: d.ragTokens,
      latencyMs: d.latencyMs,
      promptSnippet: d.promptSnippet,
      responseSnippet: d.responseSnippet,
      status: d.status,
    }));
  }
}
