import { Schema } from 'mongoose';

export const KnowledgeSchema = new Schema({
  content: { type: String, required: true },
  source: { type: String, required: true, index: true },
  embedding: { type: [Number], required: true },
  metadata: { type: Object },
  checksum: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'knowledge_base'
});

// Nota: El índice vectorial (Atlas Vector Search) se debe configurar manualmente en el panel de Atlas
// o mediante un script de administración, ya que Mongoose no lo crea automáticamente de forma nativa
// en versiones estándar de la misma manera que los índices HSN.
