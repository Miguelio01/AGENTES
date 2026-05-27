import { IChannel, Message } from '@agentes/domain';
import { Telegraf } from 'telegraf';
import axios from 'axios';

export class TelegramAdapter implements IChannel {
  private bot: Telegraf;
  private onMessageReceived: (message: Message, senderId: string) => Promise<void>;

  constructor(
    private readonly token: string,
    callback: (message: Message, senderId: string) => Promise<void>
  ) {
    this.bot = new Telegraf(token);
    this.onMessageReceived = callback;
  }

  getName(): string {
    return 'telegram';
  }

  async start(): Promise<void> {
    this.bot.on('message', async (ctx: any) => {
      const senderId = ctx.from.id.toString();
      const message = ctx.message;
      
      console.log(`📩 [Telegram] Mensaje recibido de ${senderId}. Tipo: ${message.text ? 'Texto' : 'Otro'}`);

      // 1. Manejo de Fotos (Comprobantes)
      if (message.photo) {
        const content = message.caption || '[Imagen]';
        console.log(`📸 [Telegram] Detectada foto de ${senderId}. Descargando...`);
        
        try {
          const photo = message.photo[message.photo.length - 1];
          const fileLink = await ctx.telegram.getFileLink(photo.file_id);
          
          const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);

          console.log(`✅ [Telegram] Comprobante descargado: ${buffer.length} bytes`);

          const domainMessage = Message.create({
            content,
            role: 'user',
            channel: this.getName(),
            metadata: { 
              from: ctx.from,
              media: buffer,
              mimeType: 'image/jpeg'
            }
          });

          return await this.onMessageReceived(domainMessage, senderId);
        } catch (error: any) {
          console.error('❌ [Telegram] Error procesando foto:', error.message);
        }
      }

      // 2. Manejo de Texto
      if (message.text) {
        const domainMessage = Message.create({
          content: message.text,
          role: 'user',
          channel: this.getName(),
          metadata: { from: ctx.from }
        });

        return await this.onMessageReceived(domainMessage, senderId);
      }
    });

    this.bot.launch();
    console.log(`✅ Telegram bot (${this.getName()}) started successfully`);
  }

  async send(message: Message, recipientId: string): Promise<void> {
    const execute = async (retries = 3): Promise<void> => {
      try {
        if (message.metadata?.media) {
          await this.bot.telegram.sendPhoto(recipientId, { source: message.metadata.media }, {
            caption: message.content,
            parse_mode: 'Markdown'
          });
        } else {
          await this.bot.telegram.sendMessage(recipientId, message.content, { parse_mode: 'Markdown' });
        }
      } catch (error: any) {
        if (error.response?.error_code === 429 && retries > 0) {
          const retryAfterSeconds = error.response?.parameters?.retry_after || 5;
          const retryAfterMs = (retryAfterSeconds + 2) * 1000;
          console.warn(`⚠️ Telegram rate limit (429): retry after ${retryAfterSeconds}s. Waiting ${retryAfterMs}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, retryAfterMs));
          return execute(retries - 1);
        }
        throw error;
      }
    };

    return execute();
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }
}
