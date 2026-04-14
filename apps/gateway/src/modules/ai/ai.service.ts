import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider, Message } from '@agentes/domain';
import { GeminiProvider, OllamaProvider } from '@agentes/infrastructure';

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
    return this.provider.generateResponse(messages);
  }
}
