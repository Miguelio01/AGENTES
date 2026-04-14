import { Injectable, Logger } from '@nestjs/common';
import { Message, Session, Client, EmotionalState } from '@agentes/domain';
import { AiService } from '../ai/ai.service';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { SimpleEmotionAnalyzerAdapter } from '@agentes/infrastructure';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly emotionAnalyzer = new SimpleEmotionAnalyzerAdapter();

  constructor(
    private readonly aiService: AiService,
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
  ) {}

  async handleIncomingMessage(message: Message, senderId: string, replyCallback: (reply: Message) => Promise<void>) {
    this.logger.log(`🌀 Orchestrating message from ${senderId} [${message.channel}]`);

    // 1. Obtener o crear cliente
    let client = await this.clientsService.findOne(senderId);
    if (!client) {
      client = Client.create(senderId, 'Usuario WhatsApp');
      await this.clientsService.create(client);
    }

    // 2. Analizar emoción del mensaje actual
    const emotion = await this.emotionAnalyzer.analyze(message.content);
    client.updateEmotionalState(emotion);
    this.logger.log(`🎭 Client emotion: ${emotion.emotion} (intensity: ${emotion.intensity})`);

    // 3. Obtener o crear sesión activa
    let session = await this.sessionsService.findActiveByClientId(senderId);
    if (!session) {
      session = Session.create({ clientId: senderId, agentId: 'default-agent' });
      await this.sessionsService.create(session);
    }

    // 4. Agregar mensaje al historial
    session.addMessage(message);

    // 5. Generar respuesta con IA (Gemini u Ollama)
    // Inyectamos contexto emocional en el sistema si es necesario
    const contextPrompt = Message.create({
      content: `[SISTEMA]: El cliente está ${emotion.emotion} con una intensidad de ${emotion.intensity}. Ajusta tu tono.`,
      role: 'system',
      channel: 'system',
    });

    const response = await this.aiService.getResponse([...session.history, contextPrompt]);

    // 6. Crear mensaje de respuesta y guardar
    const replyMessage = Message.create({
      content: response.content,
      role: 'assistant',
      channel: message.channel,
    });

    session.addMessage(replyMessage);
    await this.sessionsService.update(session);

    // 7. Enviar respuesta al canal original
    await replyCallback(replyMessage);

    // 8. Notificar a Miguel por Telegram si la emoción es crítica (opcional)
    if (emotion.emotion === 'angry' && emotion.intensity > 0.7) {
      this.logger.warn(`🚨 URGENTE: Cliente ${senderId} está muy enojado. Notificando a Miguel.`);
      // Aquí se llamaría al TelegramService (pendiente de implementar formalmente)
    }
  }
}
