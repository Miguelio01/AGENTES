import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppAdapter, TelegramAdapter } from '@agentes/infrastructure';
import { Message } from '@agentes/domain';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import * as path from 'path';

@Injectable()
export class ChannelsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelsService.name);
  private whatsapp: WhatsAppAdapter;
  private telegram: TelegramAdapter;

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestratorService: OrchestratorService,
  ) {}

  async onModuleInit() {
    const whatsappEnabled = !!this.configService.get('WHATSAPP_API_TOKEN');
    const telegramEnabled = !!this.configService.get('TELEGRAM_BOT_TOKEN');

    if (whatsappEnabled) {
      const sessionPath = path.join(process.cwd(), 'sessions/whatsapp');
      this.whatsapp = new WhatsAppAdapter(sessionPath, this.handleIncomingMessage.bind(this));
      await this.whatsapp.start();
    }

    if (telegramEnabled) {
      const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')!;
      this.telegram = new TelegramAdapter(token, this.handleIncomingMessage.bind(this));
      await this.telegram.start();
    }
  }

  async onModuleDestroy() {
    await this.whatsapp?.stop();
    await this.telegram?.stop();
  }

  private async handleIncomingMessage(message: Message, senderId: string) {
    this.logger.log(`📩 Message received from ${senderId} via ${message.channel}`);
    
    await this.orchestratorService.handleIncomingMessage(
      message,
      senderId,
      async (reply) => {
        await this.sendMessage(reply, senderId, message.channel as any);
      }
    );
  }

  async sendMessage(message: Message, recipientId: string, channelName: 'whatsapp' | 'telegram') {
    if (channelName === 'whatsapp' && this.whatsapp) {
      await this.whatsapp.send(message, recipientId);
    } else if (channelName === 'telegram' && this.telegram) {
      await this.telegram.send(message, recipientId);
    } else {
      this.logger.warn(`⚠️ Channel ${channelName} is not available or enabled`);
    }
  }
}
