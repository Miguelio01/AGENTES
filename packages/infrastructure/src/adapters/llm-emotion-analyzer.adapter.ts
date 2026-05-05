import { IEmotionAnalyzer, EmotionalState, ILLMProvider, Emotion, Message } from '@agentes/domain';

export class LlmEmotionAnalyzerAdapter implements IEmotionAnalyzer {
  constructor(private readonly llmProvider: ILLMProvider) {}

  async analyze(text: string): Promise<EmotionalState> {
    const promptText = `
      Analiza el siguiente mensaje de un cliente y determina su estado emocional.
      Debes priorizar la detección de emociones relevantes para la atención al cliente.
      
      Mensaje: "${text}"
      
      Responde ÚNICAMENTE con un objeto JSON válido con el siguiente formato:
      {
        "emotion": "happy" | "angry" | "sad" | "neutral" | "excited" | "confused",
        "intensity": número entre 0 y 1,
        "reason": "una breve explicación del porqué"
      }
    `;

    try {
      if (!this.llmProvider) {
        throw new Error('LLM Provider is not initialized');
      }
      const response = await this.llmProvider.generateResponse([
        Message.create({
          role: 'user',
          content: promptText,
          channel: 'system'
        })
      ]);

      const responseContent = response.content;

      // Limpiar la respuesta por si el LLM incluye markdown o texto extra
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in LLM response');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return new EmotionalState(
        data.emotion as Emotion,
        data.intensity,
        data.reason
      );
    } catch (error) {
      console.error('Error analyzing emotion with LLM:', error);
      // Fallback a neutral en caso de error
      return EmotionalState.neutral();
    }
  }
}
