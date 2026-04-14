import { Schema } from 'mongoose';

export const AgentSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  systemPrompt: { type: String, required: true },
  tools: [{ type: String }],
  config: { type: Object },
}, { timestamps: true });
