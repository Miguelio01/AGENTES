import { Schema } from 'mongoose';

export const ClientSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  lid: { type: String, index: true },
  fullName: String,
  documentType: { type: String, enum: ['CC', 'NIT', 'CE', 'PP', 'DUMMY'] },
  documentNumber: String,
  email: String,
  address: String,
  city: String,
  registrationSource: String,
  metadata: { type: Object },
  createdAt: { type: Date, required: true },
}, { timestamps: true });
