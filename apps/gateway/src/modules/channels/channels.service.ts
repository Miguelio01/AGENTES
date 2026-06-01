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
import { MongoClient } from 'mongodb';

@Injectable()
export class ChannelsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelsService.name);
  private whatsapp: WhatsAppAdapter;
  private telegram: TelegramAdapter;
  private telegramOrders: TelegramAdapter;
  private mongoClient: MongoClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestratorService: OrchestratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('notification.send')
  async handleNotificationEvent(payload: {
    recipientId: string;
    channel: 'whatsapp' | 'telegram' | 'telegram-orders';
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
    const telegramOrdersToken = this.configService.get<string>(
      'TELEGRAM_ORDERS_BOT_TOKEN',
    );

    if (whatsappEnabled) {
      const mongoUri = this.configService.get<string>('MONGODB_URI');

      if (mongoUri) {
        this.logger.log(
          '📦 Inicializando persistencia de WhatsApp en MongoDB...',
        );
        this.mongoClient = new MongoClient(mongoUri);
        await this.mongoClient.connect();

        this.whatsapp = new WhatsAppAdapter(
          { mongoClient: this.mongoClient },
          this.handleIncomingMessage.bind(this),
        );
      } else {
        this.logger.warn(
          '⚠️ No MONGODB_URI found. Falling back to local file session.',
        );
        const sessionPath = path.join(process.cwd(), 'sessions/whatsapp');
        this.whatsapp = new WhatsAppAdapter(
          { path: sessionPath },
          this.handleIncomingMessage.bind(this),
        );
      }

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

    if (telegramOrdersToken) {
      this.logger.log('🤖 Iniciando Bot de Pedidos Manuales...');
      this.telegramOrders = new TelegramAdapter(
        telegramOrdersToken,
        async (originalMessage, senderId) => {
          // Re-instanciar el mensaje con el canal correcto para preservar los getters y métodos de clase
          const ordersMessage = Message.create({
            content: originalMessage.content,
            role: originalMessage.role,
            channel: 'telegram-orders',
            metadata: originalMessage.metadata,
          });
          await this.handleIncomingMessage(ordersMessage, senderId);
        },
      );
      await this.telegramOrders.start();
    }
  }

  async onModuleDestroy() {
    await this.whatsapp?.stop();
    await this.telegram?.stop();
    await this.telegramOrders?.stop();
    await this.mongoClient?.close();
  }

  private async handleIncomingMessage(message: Message, senderId: string) {
    this.logger.log(
      `📩 Message received from ${senderId} via ${message.channel}`,
    );

    // Lógica para Bot de Pedidos Manuales - Delegar completamente al orquestador para permitir el Wizard
    if (message.channel === 'telegram-orders') {
      // No interceptamos aquí, dejamos que el orquestador y el TelegramOrdersService gestionen el flujo
    }

    // LOGICA DE ADMIN TELEGRAM (CANAL PRINCIPAL)
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

      if (contentLow.startsWith('/enviado')) {
        const parts = message.content.split(' ');
        const orderId = parts[1];
        if (orderId) {
          this.logger.log(`🚛 Admin marked order as shipped: ${orderId}`);
          this.eventEmitter.emit('order.shipped', {
            orderId,
            adminId: senderId,
          });
          const confirmation = Message.create({
            content: `¡Entendido jefe! Marcando pedido ${orderId} como enviado. Notificando al cliente...`,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(confirmation, senderId, 'telegram');
          return;
        } else {
          const errorMsg = Message.create({
            content: `Jefe, por favor dígame el ID del pedido: \`/enviado ID-PEDIDO\``,
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
          this.eventEmitter.emit('order.rejected', {
            orderId,
            adminId: senderId,
          });
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

      if (contentLow === '/exportar-catalogo') {
        this.logger.log('📦 Admin solicitó exportación de catálogo...');
        try {
          if (this.whatsapp) {
            const products = await this.whatsapp.exportCatalog();
            const count = Array.isArray(products) ? products.length : 'varios';
            await this.sendMessage(
              Message.create({
                content: `✅ ¡Listo jefe! Se han exportado ${count} productos del catálogo de WhatsApp Business a un archivo JSON.`,
                role: 'assistant',
                channel: 'telegram',
              }),
              senderId,
              'telegram',
            );
          }
        } catch (error: any) {
          this.logger.error(`❌ Error exportando catálogo: ${error.message}`);
          const cleanError = error.message.replace(/[_*`[\]]/g, '\\$&');
          await this.sendMessage(
            Message.create({
              content: `❌ Error en el envío: ${cleanError}`,
              role: 'assistant',
              channel: 'telegram',
            }),
            senderId,
            'telegram',
          );
        }
        return;
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

      if (contentLow === '/desconectar') {
        this.logger.log('🚪 Admin solicitó cierre de sesión de WhatsApp...');
        const initMsg = Message.create({
          content:
            '🚪 Cerrando sesión de WhatsApp y eliminando credenciales...',
          role: 'assistant',
          channel: 'telegram',
        });
        await this.sendMessage(initMsg, senderId, 'telegram');

        try {
          if (this.whatsapp) {
            await this.whatsapp.logout();
            const successMsg = Message.create({
              content:
                '✅ Sesión cerrada. Use `/reconectar` para generar un nuevo código QR.',
              role: 'assistant',
              channel: 'telegram',
            });
            await this.sendMessage(successMsg, senderId, 'telegram');
          }
        } catch (error) {
          this.logger.error(`❌ Error en logout: ${error.message}`);
          await this.sendMessage(
            Message.create({
              content: `❌ Error: ${error.message}`,
              role: 'assistant',
              channel: 'telegram',
            }),
            senderId,
            'telegram',
          );
        }
        return;
      }

      if (contentLow === '/reconectar') {
        this.logger.log('🔄 Admin solicitó reconexión de WhatsApp...');
        const initMsg = Message.create({
          content:
            '🔄 Reintentando conexión con WhatsApp... Espere un momento.',
          role: 'assistant',
          channel: 'telegram',
        });
        await this.sendMessage(initMsg, senderId, 'telegram');

        try {
          if (this.whatsapp) {
            await this.whatsapp.stop();
            // Pequeña pausa para asegurar liberación de recursos
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.whatsapp.start();

            const successMsg = Message.create({
              content:
                '✅ ¡WhatsApp ha sido reiniciado! Verifique si el servicio se ha restaurado.',
              role: 'assistant',
              channel: 'telegram',
            });
            await this.sendMessage(successMsg, senderId, 'telegram');
          } else {
            throw new Error('El adaptador de WhatsApp no está inicializado.');
          }
        } catch (error) {
          this.logger.error(`❌ Error en reconexión: ${error.message}`);
          const errorMsg = Message.create({
            content: `❌ No se pudo reconectar WhatsApp: ${error.message}`,
            role: 'assistant',
            channel: 'telegram',
          });
          await this.sendMessage(errorMsg, senderId, 'telegram');
        }
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
    channelName: 'whatsapp' | 'telegram' | 'telegram-orders',
  ) {
    if (channelName === 'whatsapp' && this.whatsapp) {
      await this.whatsapp.send(message, recipientId);
    } else if (channelName === 'telegram' && this.telegram) {
      await this.telegram.send(message, recipientId);
    } else if (channelName === 'telegram-orders' && this.telegramOrders) {
      await this.telegramOrders.send(message, recipientId);
    } else {
      this.logger.warn(`⚠️ Channel ${channelName} is not available or enabled`);
    }
  }
}
