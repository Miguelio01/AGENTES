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
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private provider: ILLMProvider;

  constructor(
    private readonly configService: ConfigService,
    @Inject(AI_METRIC_REPOSITORY_PORT)
    private readonly metricRepository: IAiMetricRepository,
  ) {
    this.initializeProvider();
  }

  private initializeProvider() {
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

  async getResponse(messages: Message[], promptTag?: string) {
    if (!this.provider) {
      throw new Error('LLM Provider not initialized');
    }

    // --- ESTIMACIÓN INICIAL DE TOKENS ---
    const usageBreakdown = {
      system: 0,
      history: 0,
      rag: 0
    };

    // 1. Capa de Optimización de Tokens (Historial dinámico)
    let optimizedMessages = this.optimizeMessages(messages);
    
    // Calcular tokens de sistema e historial inicial
    optimizedMessages.forEach(m => {
      const tokens = this.estimateTokens(m.content || (m as any).props?.content);
      if (m.role === 'system') usageBreakdown.system += tokens;
      else usageBreakdown.history += tokens;
    });

    // 2. Capa de Optimización RAG
    const vaultPath = this.configService.get<string>('OBSIDIAN_VAULT_PATH');
    if (vaultPath) {
      try {
        const lastUserMessage = [...optimizedMessages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          const ragAdapter = new ObsidianRAGAdapter(vaultPath);
          // LIMITAMOS A 2 FRAGMENTOS PARA AHORRAR TOKENS
          const results = await ragAdapter.search(lastUserMessage.content, 2);

          if (results.length > 0) {
            const context = results
              .map((r) => `[Fte: ${r.source}]\n${r.content.substring(0, 500)}...`)
              .join('\n---\n');
            
            usageBreakdown.rag = this.estimateTokens(context);

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
            this.logger.log(`🧠 RAG: Inyectados ${results.length} fragmentos (~${usageBreakdown.rag} tokens).`);
          }
        }
      } catch (error: any) {
        this.logger.error('Error RAG:', error.message);
      }
    }

    this.logger.log(
      `🤖 Generando respuesta con ${this.provider.getProviderName()} (${optimizedMessages.length} msg, Tag: ${promptTag || 'none'}, Est. P: ${usageBreakdown.system + usageBreakdown.history + usageBreakdown.rag} tokens)...`,
    );
    
    const startTime = Date.now();
    try {
      const response = await this.provider.generateResponse(optimizedMessages);
      const latencyMs = Date.now() - startTime;

      // Guardar métrica de forma asíncrona (no bloqueante)
      this.recordMetric(optimizedMessages, response, latencyMs, usageBreakdown, promptTag).catch(err => 
        this.logger.error('Error recording AI metric:', err.message)
      );

      return response;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      this.recordErrorMetric(optimizedMessages, error, latencyMs, promptTag).catch(() => {});
      this.logger.error(`❌ Error en proveedor LLM: ${error.message}`);
      throw error;
    }
  }

  async generateText(prompt: string, promptTag?: string): Promise<string> {
    const message = Message.create({
      role: 'user',
      content: prompt,
      channel: 'system'
    });
    
    const response = await this.getResponse([message], promptTag);
    return response.content;
  }

  private estimateTokens(text: string): number {
    const content = String(text || '');
    if (!content) return 0;
    // Estimación conservadora: 4 caracteres por token
    return Math.ceil(content.length / 4);
  }

  private async recordMetric(messages: Message[], response: any, latencyMs: number, breakdown?: any, promptTag?: string) {
    try {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      
      const metric = AiMetric.create({
        provider: this.provider.getProviderName(),
        model: response.usage?.model || 'unknown',
        promptTag,
        promptTokens: response.usage?.promptTokens || 0,
        completionTokens: response.usage?.completionTokens || 0,
        totalTokens: response.usage?.totalTokens || 0,
        systemTokens: breakdown?.system || 0,
        historyTokens: breakdown?.history || 0,
        ragTokens: breakdown?.rag || 0,
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

  private async recordErrorMetric(messages: Message[], error: any, latencyMs: number, promptTag?: string) {
    try {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      const metric = AiMetric.create({
        provider: this.provider?.getProviderName() || 'unknown',
        model: 'error',
        promptTag,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        systemTokens: 0,
        historyTokens: 0,
        ragTokens: 0,
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
    // Filtrar mensajes que no tengan contenido válido para evitar errores
    const validMessages = messages.filter(m => {
      const content = m.content || (m as any).props?.content;
      return content !== undefined && content !== null;
    });

    const systemPrompt = validMessages.find(m => m.role === 'system');
    const others = validMessages.filter(m => m.role !== 'system');

    // Límite de caracteres para el historial (aprox 1250 tokens)
    const MAX_HISTORY_CHARS = 5000;
    let currentChars = 0;
    const window: Message[] = [];

    // Recorrer desde el más reciente
    for (let i = others.length - 1; i >= 0; i--) {
      const msg = others[i];
      const content = msg.content || (msg as any).props?.content;
      const len = String(content || '').length;
      
      if (currentChars + len > MAX_HISTORY_CHARS && window.length >= 2) {
        break; // Mantener al menos los últimos 2 mensajes si es posible
      }
      
      window.unshift(msg);
      currentChars += len;
      
      // No más de 10 mensajes de historial incluso si son cortos
      if (window.length >= 10) break;
    }

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
