import { KnowledgeChunk, IKnowledgeRepository } from '@agentes/domain';
import { Model } from 'mongoose';

export class MongoKnowledgeRepository implements IKnowledgeRepository {
  constructor(private readonly knowledgeModel: Model<any>) {}

  async save(chunk: KnowledgeChunk): Promise<void> {
    await this.knowledgeModel.updateOne(
      { content: chunk.content, source: chunk.source },
      {
        $set: {
          embedding: chunk.embedding,
          metadata: chunk.metadata,
          checksum: chunk.checksum,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async findBySource(source: string): Promise<KnowledgeChunk[]> {
    const docs = await this.knowledgeModel.find({ source }).lean();
    return docs.map(this.mapToEntity);
  }

  async deleteBySource(source: string): Promise<void> {
    await this.knowledgeModel.deleteMany({ source });
  }

  async vectorSearch(embedding: number[], limit: number = 3): Promise<KnowledgeChunk[]> {
    // Pipeline para Atlas Vector Search
    // IMPORTANTE: Requiere un índice definido en Atlas llamado 'vector_index'
    const results = await this.knowledgeModel.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: limit * 10,
          limit: limit
        }
      },
      {
        $project: {
          content: 1,
          source: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]);

    return results.map(r => ({
      ...this.mapToEntity(r),
      score: r.score
    }));
  }

  async getAllSources(): Promise<string[]> {
    return this.knowledgeModel.distinct('source');
  }

  private mapToEntity(doc: any): KnowledgeChunk {
    return {
      id: doc._id.toString(),
      content: doc.content,
      source: doc.source,
      embedding: doc.embedding,
      metadata: doc.metadata,
      checksum: doc.checksum,
      updatedAt: doc.updatedAt
    };
  }
}
