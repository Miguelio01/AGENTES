import { ILLMProvider, LLMResponse, Message } from '@agentes/domain';
import axios from 'axios';

export class OllamaProvider implements ILLMProvider {
  constructor(
    private readonly baseUrl: string = 'http://localhost:11434',
    private readonly model: string = 'llama3'
  ) {}

  getProviderName(): string {
    return `ollama-${this.model}`;
  }

  async generateResponse(messages: Message[], options?: Record<string, any>): Promise<LLMResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model: this.model,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        stream: false,
      }, {
        timeout: 90000 // 90 segundos para dar margen a la IA local
      });

      return {
        content: response.data.message.content,
        usage: {
          promptTokens: response.data.prompt_eval_count || 0,
          completionTokens: response.data.eval_count || 0,
          totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0),
          model: this.model,
        }
      };
    } catch (error: any) {
      console.error('Ollama Error:', error.message);
      throw error;
    }
  }
}
