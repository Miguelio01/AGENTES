import { Schema } from 'mongoose';

export const ClientSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  emotionalState: {
    emotion: { type: String, required: true },
    intensity: { type: Number, required: true },
    reason: { type: String },
  },
  billingData: {
    documentType: { type: String, enum: ['CC', 'NIT', 'CE', 'PP', 'DUMMY'] },
    documentNumber: String,
    fullName: String,
    email: String,
    address: String,
    city: String,
    phone: String,
  },
  metadata: { type: Object },
  createdAt: { type: Date, required: true },
}, { timestamps: true });
