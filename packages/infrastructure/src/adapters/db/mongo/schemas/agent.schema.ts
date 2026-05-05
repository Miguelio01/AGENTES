import { Schema, Document } from 'mongoose';

export interface AgentDocument extends Document<string> {
  name: string;
  systemPrompt: string;
  tools: string[];
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const AgentSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  systemPrompt: { type: String, required: true },
  tools: [{ type: String }],
  config: { type: Object },
}, { timestamps: true });
