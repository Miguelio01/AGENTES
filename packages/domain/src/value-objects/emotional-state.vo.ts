export type Emotion = 'happy' | 'angry' | 'sad' | 'neutral' | 'excited' | 'confused';

export class EmotionalState {
  constructor(
    public readonly emotion: Emotion,
    public readonly intensity: number, // 0 to 1
    public readonly reason?: string
  ) {
    if (intensity < 0 || intensity > 1) {
      throw new Error('Intensity must be between 0 and 1');
    }
  }

  static neutral(): EmotionalState {
    return new EmotionalState('neutral', 0.5);
  }

  isHighIntensity(): boolean {
    return this.intensity > 0.8;
  }
}
