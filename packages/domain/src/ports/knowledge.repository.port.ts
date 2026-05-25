export interface KnowledgeChunk {
  id?: string;
  content: string;
  source: string;
  embedding: number[];
  metadata?: Record<string, any>;
  checksum: string;
  updatedAt: Date;
}

export const KNOWLEDGE_REPOSITORY_PORT = 'IKnowledgeRepository';

export interface IKnowledgeRepository {
  save(chunk: KnowledgeChunk): Promise<void>;
  findBySource(source: string): Promise<KnowledgeChunk[]>;
  deleteBySource(source: string): Promise<void>;
  vectorSearch(embedding: number[], limit?: number): Promise<KnowledgeChunk[]>;
  getAllSources(): Promise<string[]>;
}
