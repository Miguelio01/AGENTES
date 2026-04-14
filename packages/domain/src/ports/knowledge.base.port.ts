export const KNOWLEDGE_BASE_PORT = 'IKnowledgeBase';

export interface KnowledgeResult {
  content: string;
  source: string; // File path or URL
  score: number; // Relevance score
  metadata?: Record<string, any>;
}

export interface IKnowledgeBase {
  /**
   * Realiza una búsqueda semántica (RAG) en la base de conocimientos (Obsidian)
   */
  search(query: string, limit?: number): Promise<KnowledgeResult[]>;

  /**
   * Obtiene un documento específico por su ID o ruta
   */
  getDocument(path: string): Promise<string | null>;
}
