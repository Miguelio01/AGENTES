import { ILLMProvider, LLMResponse, Message } from '@agentes/domain';
import axios from 'axios';

export class NvidiaNimProvider implements ILLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://integrate.api.nvidia.com/v1',
    private readonly model: string = 'meta/llama-3.3-70b-instruct',
  ) {}

  getProviderName(): string {
    return `nvidia-${this.model}`;
  }

  async generateResponse(
    messages: Message[],
    options?: Record<string, any>,
  ): Promise<LLMResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options?.temperature ?? 0.5,
          top_p: options?.top_p ?? 0.7,
          max_tokens: options?.max_tokens ?? 1024,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      return {
        content: response.data.choices[0].message.content,
      };
    } catch (error: any) {
      console.error(
        'NVIDIA NIM Error:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}
