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
  lastActivity: { type: Date, required: true },
}, { timestamps: true });
