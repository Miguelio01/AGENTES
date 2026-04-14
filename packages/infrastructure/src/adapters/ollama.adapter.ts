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
    const response = await axios.post(`${this.baseUrl}/api/chat`, {
      model: this.model,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream: false,
    });

    return {
      content: response.data.message.content,
    };
  }
}
