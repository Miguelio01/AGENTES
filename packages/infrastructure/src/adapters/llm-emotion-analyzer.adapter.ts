import { IEmotionAnalyzer, EmotionalState, ILLMProvider, Emotion, Message } from '@agentes/domain';
import axios from 'axios';

export class LlmEmotionAnalyzerAdapter implements IEmotionAnalyzer {
  constructor(
    private readonly llmProvider: ILLMProvider,
    private readonly adkUrl?: string
  ) {}

  async analyze(text: string): Promise<EmotionalState> {
    if (this.adkUrl) {
      try {
        const response = await axios.post(`${this.adkUrl}/analyze-emotion`, {
          message: text
        }, { timeout: 5000 });
        
        const data = response.data;
        return new EmotionalState(
          data.emotion as Emotion,
          data.intensity,
          data.reason
        );
      } catch (error: any) {
        console.warn('Fallback to LLM for emotion analysis due to ADK error:', error.message);
      }
    }

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

      // Limpiar la respuesta de bloques de código markdown y otros ruidos
      let jsonStr = responseContent.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in LLM response');
      }

      // Reemplazar saltos de línea dentro de los valores de string para evitar errores de parseo
      const sanitizedJson = jsonMatch[0].replace(/\n/g, ' ');
      const data = JSON.parse(sanitizedJson);
      
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
