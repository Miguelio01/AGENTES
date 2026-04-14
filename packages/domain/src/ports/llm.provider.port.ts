import { Message } from '../entities/message.entity';

export const LLM_PROVIDER_PORT = 'ILLMProvider';

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
}

export interface ILLMProvider {
  /**
   * Genera una respuesta basada en el historial de mensajes
   */
  generateResponse(messages: Message[], options?: Record<string, any>): Promise<LLMResponse>;

  /**
   * Obtiene el nombre del proveedor (gemini, ollama, etc.)
   */
  getProviderName(): string;
}
