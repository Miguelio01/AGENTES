import { ILLMProvider, LLMResponse, Message } from '@agentes/domain';
import axios from 'axios';

export class NvidiaNimProvider implements ILLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://integrate.api.nvidia.com/v1',
    private readonly model: string = 'meta/llama-3.3-70b-instruct',
    private readonly embeddingModel: string = 'nvidia/llama-3.2-nv-embedqc-24b'
  ) {}

  getProviderName(): string {
    return `nvidia-${this.model}`;
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/embeddings`,
        {
          model: this.embeddingModel,
          input: [text],
          encoding_format: 'float'
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return response.data.data[0].embedding;
    } catch (error: any) {
      console.error(
        'NVIDIA NIM Embedding Error:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async generateResponse(
    messages: Message[],
    options?: Record<string, any>,
  ): Promise<LLMResponse> {
    try {
      // Limpieza y validación estricta de mensajes para evitar {} que rompen la API
      const sanitizedMessages = messages
        .map((m: any) => {
          // Extraer contenido y rol, manejando tanto instancias de clase como objetos planos
          const role = m.role || (m.props && m.props.role);
          const content = m.content || (m.props && m.props.content);

          if (!role || !content) return null;

          return {
            role: role.toLowerCase(),
            content: String(content),
          };
        })
        .filter((m) => m !== null); // Eliminar mensajes malformados

      if (sanitizedMessages.length === 0) {
        throw new Error('No valid messages to send to NVIDIA NIM');
      }

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: sanitizedMessages,
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
        usage: {
          promptTokens: response.data.usage?.prompt_tokens || 0,
          completionTokens: response.data.usage?.completion_tokens || 0,
          totalTokens: response.data.usage?.total_tokens || 0,
          model: this.model,
        },
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
