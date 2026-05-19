import { IChannel, Message } from '@agentes/domain';
import { Telegraf } from 'telegraf';

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
    this.bot.on('text', async (ctx) => {
      const senderId = ctx.from.id.toString();
      const content = ctx.message.text;

      const domainMessage = Message.create({
        content,
        role: 'user',
        channel: 'telegram',
        metadata: { from: ctx.from }
      });

      await this.onMessageReceived(domainMessage, senderId);
    });

    this.bot.launch();
    console.log('✅ Telegram bot started successfully');
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
