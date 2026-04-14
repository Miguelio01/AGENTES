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
      });

      await this.onMessageReceived(domainMessage, senderId);
    });

    this.bot.launch();
    console.log('✅ Telegram bot started successfully');
  }

  async send(message: Message, recipientId: string): Promise<void> {
    await this.bot.telegram.sendMessage(recipientId, message.content);
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }
}
