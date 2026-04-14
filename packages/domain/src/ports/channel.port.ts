import { Message } from '../entities/message.entity';

export const CHANNEL_PORT = 'IChannel';

export interface IChannel {
  /**
   * Envía un mensaje a través del canal específico
   */
  send(message: Message, recipientId: string): Promise<void>;

  /**
   * Inicia el canal y escucha mensajes entrantes
   */
  start(): Promise<void>;

  /**
   * Detiene el canal
   */
  stop(): Promise<void>;

  /**
   * Obtiene el nombre del canal (whatsapp, telegram, etc.)
   */
  getName(): string;
}
