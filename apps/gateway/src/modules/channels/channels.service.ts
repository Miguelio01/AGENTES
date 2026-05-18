import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsAppAdapter, TelegramAdapter } from '@agentes/infrastructure';
import { Message, AdminPaymentApprovedEvent } from '@agentes/domain';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { OnEvent } from '@nestjs/event-emitter';
import * as path from 'path';

@Injectable()
export class ChannelsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelsService.name);
  private whatsapp: WhatsAppAdapter;
  private telegram: TelegramAdapter;

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestratorService: OrchestratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('notification.send')
  async handleNotificationEvent(payload: {
    recipientId: string;
    channel: 'whatsapp' | 'telegram';
    content: string;
  }) {
    this.logger.log(
      `📢 Sending notification to ${payload.recipientId} via ${payload.channel}`,
    );
    const message = Message.create({
      content: payload.content,
      role: 'assistant',
      channel: payload.channel,
    });
    await this.sendMessage(message, payload.recipientId, payload.channel);
  }

  async onModuleInit() {
    const whatsappEnabled = !!this.configService.get('WHATSAPP_API_TOKEN');
    const telegramEnabled = !!this.configService.get('TELEGRAM_BOT_TOKEN');

    if (whatsappEnabled) {
      const sessionPath = path.join(process.cwd(), 'sessions/whatsapp');
      this.whatsapp = new WhatsAppAdapter(
        sessionPath,
        this.handleIncomingMessage.bind(this),
      );
      await this.whatsapp.start();
    }

    if (telegramEnabled) {
      const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')!;
      this.telegram = new TelegramAdapter(
        token,
        this.handleIncomingMessage.bind(this),
      );
      await this.telegram.start();
    }
  }

  async onModuleDestroy() {
    await this.whatsapp?.stop();
    await this.telegram?.stop();
  }

  private async handleIncomingMessage(message: Message, senderId: string) {
    this.logger.log(
      `📩 Message received from ${senderId} via ${message.channel}`,
    );

    // LOGICA DE ADMIN TELEGRAM
    const adminId = this.configService.get<string>('TELEGRAM_ADMIN_ID');
    if (message.channel === 'telegram' && senderId === adminId) {
      const contentLow = message.content.toLowerCase();
      
      if (contentLow.startsWith('/aprobado')) {
        const parts = message.content.split(' ');
        const orderId = parts[1];
        if (orderId) {
          this.logger.log(`✅ Admin approved order: ${orderId}`);
          const targetClientId = parts[2]; 
          this.eventEmitter.emit(
            'order.approved',
            new AdminPaymentApprovedEvent(orderId, senderId, targetClientId),
          );

          const confirmation = Message.create({
            content: `¡Entendido jefe! Procesando aprobación para el pedido ${orderId}...`,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(confirmation, senderId, 'telegram');
          return;
        } else {
          const errorMsg = Message.create({
            content: `Jefe, por favor dígame el ID del pedido, así: \`/aprobado ID-PEDIDO\``,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(errorMsg, senderId, 'telegram');
          return;
        }
      }

      if (contentLow.startsWith('/rechazado')) {
        const parts = message.content.split(' ');
        const orderId = parts[1];
        if (orderId) {
          this.logger.log(`❌ Admin rejected order: ${orderId}`);
          this.eventEmitter.emit('order.rejected', { orderId, adminId: senderId });
          const confirmation = Message.create({
            content: `¡Entendido jefe! Pedido ${orderId} rechazado. El stock será devuelto al inventario.`,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(confirmation, senderId, 'telegram');
          return;
        } else {
          const errorMsg = Message.create({
            content: `Jefe, por favor dígame el ID del pedido para devolver el stock: \`/rechazado ID-PEDIDO\``,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(errorMsg, senderId, 'telegram');
          return;
        }
      }

      if (message.content.toLowerCase().includes('/atendido')) {
        const parts = message.content.split(' ');
        const targetClientId = parts[1]; // Opcional

        // Obtener el nombre de quien atiende desde los datos de Telegram
        const firstName = message.metadata?.from?.first_name || '';
        const lastName = message.metadata?.from?.last_name || '';
        const resolverName = `${firstName} ${lastName}`.trim() || 'Socio';

        this.logger.log(`👷 ${resolverName} marcó el caso como atendido.`);

        this.eventEmitter.emit('escalation.resolve', {
          clientId: targetClientId,
          resolvedBy: resolverName,
        });
        return;
      }
    }

    await this.orchestratorService.handleIncomingMessage(
      message,
      senderId,
      async (reply) => {
        await this.sendMessage(reply, senderId, message.channel as any);
      },
      async (isTyping) => {
        await this.setPresence(senderId, message.channel as any, isTyping);
      },
    );
  }

  async setPresence(
    recipientId: string,
    channelName: 'whatsapp' | 'telegram',
    isTyping: boolean,
  ) {
    if (channelName === 'whatsapp' && this.whatsapp) {
      await this.whatsapp.setTyping(recipientId, isTyping);
    }
  }

  async sendMessage(
    message: Message,
    recipientId: string,
    channelName: 'whatsapp' | 'telegram',
  ) {
    if (channelName === 'whatsapp' && this.whatsapp) {
      await this.whatsapp.send(message, recipientId);
    } else if (channelName === 'telegram' && this.telegram) {
      await this.telegram.send(message, recipientId);
    } else {
      this.logger.warn(`⚠️ Channel ${channelName} is not available or enabled`);
    }
  }
}
