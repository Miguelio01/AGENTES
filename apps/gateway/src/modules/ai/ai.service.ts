import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider, Message, AiMetric, AI_METRIC_REPOSITORY_PORT } from '@agentes/domain';
import type { IAiMetricRepository } from '@agentes/domain';
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

  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_METRIC_REPOSITORY_PORT)
    private readonly metricRepository: IAiMetricRepository,
  ) {}

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
    
    const startTime = Date.now();
    try {
      const response = await this.provider.generateResponse(optimizedMessages);
      const latencyMs = Date.now() - startTime;

      // Guardar métrica de forma asíncrona (no bloqueante)
      this.recordMetric(optimizedMessages, response, latencyMs).catch(err => 
        this.logger.error('Error recording AI metric:', err.message)
      );

      return response;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      this.recordErrorMetric(optimizedMessages, error, latencyMs).catch(() => {});
      this.logger.error(`❌ Error en proveedor LLM: ${error.message}`);
      throw error;
    }
  }

  private async recordMetric(messages: Message[], response: any, latencyMs: number) {
    try {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      
      const metric = AiMetric.create({
        provider: this.provider.getProviderName(),
        model: response.usage?.model || 'unknown',
        promptTokens: response.usage?.promptTokens || 0,
        completionTokens: response.usage?.completionTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
        latencyMs,
        promptSnippet: lastUserMessage?.content?.substring(0, 500),
        responseSnippet: response.content?.substring(0, 500),
        status: 'SUCCESS'
      });
      
      await this.metricRepository.save(metric);
    } catch (e: any) {
      this.logger.error('Failed to save success metric:', e.message);
    }
  }

  private async recordErrorMetric(messages: Message[], error: any, latencyMs: number) {
    try {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      const metric = AiMetric.create({
        provider: this.provider?.getProviderName() || 'unknown',
        model: 'error',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
        promptSnippet: lastUserMessage?.content?.substring(0, 500),
        responseSnippet: error.message?.substring(0, 500),
        status: 'ERROR'
      });
      await this.metricRepository.save(metric);
    } catch (e: any) {
       this.logger.error('Failed to save error metric:', e.message);
    }
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
