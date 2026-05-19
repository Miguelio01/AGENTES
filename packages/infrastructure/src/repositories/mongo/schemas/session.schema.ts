import { Schema } from 'mongoose';

export const SessionSchema = new Schema({
  _id: { type: String, required: true },
  clientId: { type: String, required: true, index: true },
  agentId: { type: String, required: true },
  history: [{
    id: String,
    content: String,
    role: String,
    timestamp: Date,
    channel: String,
    metadata: Object,
  }],
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  flowState: { type: String, default: 'IDLE' },
  emotionalState: {
    emotion: { type: String, required: true, default: 'neutral' },
    intensity: { type: Number, required: true, default: 0.5 },
    reason: { type: String },
  },
  lastActivity: { type: Date, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
