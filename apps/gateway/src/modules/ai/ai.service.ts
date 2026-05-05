import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider, Message } from '@agentes/domain';
import { GeminiProvider, OllamaProvider, ObsidianRAGAdapter } from '@agentes/infrastructure';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private provider: ILLMProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    const useOllama = this.configService.get<string>('USE_OLLAMA') === 'true';
    const ollamaUrl = this.configService.get<string>('OLLAMA_URL') || 'http://localhost:11434';
    const ollamaModel = this.configService.get<string>('OLLAMA_MODEL') || 'llama3';

    if (useOllama) {
      this.logger.log(`🤖 Using Ollama provider at ${ollamaUrl} with model ${ollamaModel}`);
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

    // Task 3: Semantic RAG (Obsidian Base)
    const vaultPath = this.configService.get<string>('OBSIDIAN_VAULT_PATH');
    if (vaultPath) {
      try {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          const ragAdapter = new ObsidianRAGAdapter(vaultPath);
          const results = await ragAdapter.search(lastMessage.content);
          
          if (results.length > 0) {
            const context = results.map(r => `[Source: ${r.source}]\n${r.content}`).join('\n---\n');
            const systemMessage = Message.create({
              role: 'system',
              content: `Utiliza la siguiente información de la base de conocimientos de la empresa para responder: \n\n${context}`,
              channel: lastMessage.channel || 'system'
            });
            
            // Inject context at the beginning
            messages.unshift(systemMessage);
            this.logger.log(`🧠 RAG Context injected from ${results.length} files`);
          }
        }
      } catch (error) {
        this.logger.error('Error injecting RAG context:', error);
      }
    }

    this.logger.log(`🤖 Generating response with provider for ${messages.length} messages...`);
    return this.provider.generateResponse(messages);
  }

  getProvider(): ILLMProvider {
    return this.provider;
  }

  getKnowledgeBase(): ObsidianRAGAdapter {
    const vaultPath = this.configService.get<string>('OBSIDIAN_VAULT_PATH') || './brain';
    return new ObsidianRAGAdapter(vaultPath);
  }
}
