import { Schema } from 'mongoose';

export const AiMetricSchema = new Schema({
  timestamp: { type: Date, required: true, index: true },
  provider: { type: String, required: true, index: true },
  model: { type: String, required: true, index: true },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  systemTokens: { type: Number, default: 0 },
  historyTokens: { type: Number, default: 0 },
  ragTokens: { type: Number, default: 0 },
  latencyMs: { type: Number, default: 0 },
  promptSnippet: String,
  responseSnippet: String,
  status: { type: String, enum: ['SUCCESS', 'ERROR'], required: true },
}, { 
  collection: 'ai_metrics',
  versionKey: false 
});
