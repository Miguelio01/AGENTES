import { ILLMProvider, LLMResponse, Message } from '@agentes/domain';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiProvider implements ILLMProvider {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string, modelName: string = 'gemini-1.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  getProviderName(): string {
    return 'gemini';
  }

  async generateResponse(messages: Message[], options?: Record<string, any>): Promise<LLMResponse> {
    const chat = this.model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const lastMessage = messages[messages.length - 1].content;
    const result = await chat.sendMessage(lastMessage);
    const response = await result.response;
    const usage = response.usageMetadata;
    
    return {
      content: response.text(),
      usage: {
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
        model: 'gemini-1.5-flash',
      }
    };
  }
}
