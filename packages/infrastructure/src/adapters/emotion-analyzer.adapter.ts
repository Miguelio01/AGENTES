import { IEmotionAnalyzer, EmotionalState, Emotion } from '@agentes/domain';

export class SimpleEmotionAnalyzerAdapter implements IEmotionAnalyzer {
  async analyze(text: string): Promise<EmotionalState> {
    const lowerText = text.toLowerCase();
    
    let emotion: Emotion = 'neutral';
    let intensity = 0.5;
    let reason = 'Análisis de texto básico';

    // Reglas simples para detectar emociones (esto será reemplazado por LLM en el futuro)
    if (this.containsAny(lowerText, ['feliz', 'gracias', 'excelente', 'bien', 'bueno', 'genial', '😀', '😊'])) {
      emotion = 'happy';
      intensity = 0.8;
    } else if (this.containsAny(lowerText, ['enojado', 'mal', 'peor', 'terrible', 'basura', '😡', '🤬', 'mierda', 'hdp'])) {
      emotion = 'angry';
      intensity = 0.9;
    } else if (this.containsAny(lowerText, ['triste', 'lástima', 'pobre', '😢', '😭'])) {
      emotion = 'sad';
      intensity = 0.7;
    } else if (this.containsAny(lowerText, ['?', 'cómo', 'que', 'confundido', 'no entiendo', '🤔'])) {
      emotion = 'confused';
      intensity = 0.6;
    }

    return new EmotionalState(emotion, intensity, reason);
  }

  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }
}
