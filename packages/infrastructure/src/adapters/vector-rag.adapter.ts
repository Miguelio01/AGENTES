import { IKnowledgeBase, KnowledgeResult, ILLMProvider, IKnowledgeRepository } from '@agentes/domain';

export class VectorRAGAdapter implements IKnowledgeBase {
  constructor(
    private readonly llmProvider: ILLMProvider,
    private readonly knowledgeRepository: IKnowledgeRepository
  ) {}

  async search(query: string, limit: number = 3): Promise<KnowledgeResult[]> {
    try {
      console.log(`[VectorRAG] Generating embedding for query: "${query}"`);
      const queryEmbedding = await this.llmProvider.generateEmbeddings(query);
      
      const chunks = await this.knowledgeRepository.vectorSearch(queryEmbedding, limit);
      
      return chunks.map(c => ({
        content: c.content,
        source: c.source,
        score: (c as any).score || 0,
        metadata: c.metadata
      }));
    } catch (error: any) {
      console.error(`[VectorRAG] Search error: ${error.message}`);
      return [];
    }
  }

  async getDocument(path: string): Promise<string | null> {
    const chunks = await this.knowledgeRepository.findBySource(path);
    if (chunks.length === 0) return null;
    return chunks.map(c => c.content).join('\n\n');
  }

  async addKnowledge(title: string, content: string, metadata?: Record<string, any>): Promise<void> {
    // Para simplificar, tratamos el addKnowledge como una adición manual que requiere embedding
    const embedding = await this.llmProvider.generateEmbeddings(content);
    await this.knowledgeRepository.save({
      content,
      source: title,
      embedding,
      metadata,
      checksum: 'manual', // Opcional: calcular hash
      updatedAt: new Date()
    });
  }
}
