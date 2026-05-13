import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider, Message } from '@agentes/domain';
import {
  GeminiProvider,
  OllamaProvider,
  NvidiaNimProvider,
  ObsidianRAGAdapter,
} from '@agentes/infrastructure';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private provider: ILLMProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const providerType = this.configService.get<string>('LLM_PROVIDER') || 'OLLAMA';
    
    if (providerType === 'NVIDIA') {
      const nvidiaKey = this.configService.get<string>('NVIDIA_API_KEY');
      const nvidiaUrl = this.configService.get<string>('NVIDIA_BASE_URL');
      const nvidiaModel = this.configService.get<string>('NVIDIA_MODEL');
      
      if (nvidiaKey) {
        this.logger.log(`🚀 Using NVIDIA NIM provider with model ${nvidiaModel}`);
        this.provider = new NvidiaNimProvider(nvidiaKey, nvidiaUrl, nvidiaModel);
        return;
      }
    }

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    const useOllama = this.configService.get<string>('USE_OLLAMA') === 'true' || providerType === 'OLLAMA';
    const ollamaUrl =
      this.configService.get<string>('OLLAMA_URL') || 'http://localhost:11434';
    const ollamaModel =
      this.configService.get<string>('OLLAMA_MODEL') || 'llama3';

    if (useOllama) {
      this.logger.log(
        `🤖 Using Ollama provider at ${ollamaUrl} with model ${ollamaModel}`,
      );
      this.provider = new OllamaProvider(ollamaUrl, ollamaModel);
    } else if (geminiKey) {
      this.logger.log('✨ Using Gemini provider');
      this.provider = new GeminiProvider(geminiKey);
    } else {
      this.logger.warn('⚠️ No LLM provider configured');
    }
  }

  async getResponse(messages: Message[]) {
    if (!this.provider) {
      throw new Error('LLM Provider not initialized');
    }

    // 1. Capa de Optimización de Tokens (Antes de RAG para tener espacio)
    let optimizedMessages = this.optimizeMessages(messages);

    // 2. Capa de Optimización RAG
    const vaultPath = this.configService.get<string>('OBSIDIAN_VAULT_PATH');
    if (vaultPath) {
      try {
        const lastUserMessage = [...optimizedMessages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          const ragAdapter = new ObsidianRAGAdapter(vaultPath);
          const results = await ragAdapter.search(lastUserMessage.content);

          if (results.length > 0) {
            const context = results
              .map((r) => `[Fte: ${r.source}]\n${r.content.substring(0, 600)}...`)
              .join('\n---\n');
            
            const systemMessage = Message.create({
              role: 'system',
              content: `INFORMACIÓN DE RESPALDO:\n${context}`,
              channel: lastUserMessage.channel || 'system',
            });

            // Inyectar justo después del prompt del sistema original
            const sysIdx = optimizedMessages.findIndex(m => m.role === 'system');
            if (sysIdx !== -1) {
              optimizedMessages.splice(sysIdx + 1, 0, systemMessage);
            } else {
              optimizedMessages.unshift(systemMessage);
            }
            this.logger.log(`🧠 RAG: Inyectados ${results.length} fragmentos.`);
          }
        }
      } catch (error: any) {
        this.logger.error('Error RAG:', error.message);
      }
    }

    this.logger.log(
      `🤖 Generando respuesta con ${this.provider.getProviderName()} para ${optimizedMessages.length} mensajes...`,
    );
    
    return this.provider.generateResponse(optimizedMessages);
  }

  private optimizeMessages(messages: Message[]): Message[] {
    if (messages.length <= 6) return messages;

    const systemPrompt = messages.find(m => m.role === 'system');
    const others = messages.filter(m => m.role !== 'system');

    // Mantener los últimos 8 mensajes para no perder el hilo
    const window = others.slice(-8);

    const result = systemPrompt ? [systemPrompt, ...window] : window;
    return result;
  }

  getProvider(): ILLMProvider {
    return this.provider;
  }

  getKnowledgeBase(): ObsidianRAGAdapter {
    const vaultPath =
      this.configService.get<string>('OBSIDIAN_VAULT_PATH') || './brain';
    return new ObsidianRAGAdapter(vaultPath);
  }
}
