import { EmotionalState } from '../value-objects/emotional-state.vo';

export const EMOTION_ANALYZER_PORT = 'IEmotionAnalyzer';

export interface IEmotionAnalyzer {
  /**
   * Analiza el texto para detectar la emoción y su intensidad
   */
  analyze(text: string): Promise<EmotionalState>;
}
