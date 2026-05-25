import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { INVENTORY_PROVIDER_PORT, Message } from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { ChannelsService } from '../channels/channels.service';
import { forwardRef } from '@nestjs/common';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) { }

  @Cron(CronExpression.EVERY_HOUR) // Ejecutar cada hora
  async handlePaymentReminders() {
    this.logger.log('⏰ Iniciando escaneo de recordatorios de pago...');

    // Obtener todas las sesiones activas (simplificado: el servicio debería filtrar por flowState)
    // Como SessionsService podría no tener un método findAll, usaremos su repo o lógica interna
    // Para este caso, asumimos que SessionsService puede devolver sesiones por estado
    const sessions = await this.sessionsService.findActiveSessionsByState('AWAITING_PAYMENT_PROOF');

    this.logger.log(`🔍 Encontradas ${sessions.length} sesiones esperando pago.`);

    const now = new Date();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const config = await this.inventoryProvider.getConfig();

    for (const session of sessions) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();

      // Si ha pasado más de 2 horas y no hemos enviado un recordatorio hoy
      if (timeSinceActivity > TWO_HOURS && !session.metadata?.lastReminderSent) {
        const client = await this.clientsService.findOne(session.clientId);
        if (!client) continue;

        const isNewClient = !client.address || !client.documentNumber;
        const deliveryDate = this.calculateNextDeliveryDate(config, session.metadata?.orderDate);

        let reminderText = '';
        if (isNewClient) {
          reminderText = `¡Hola sumercé! 👋 Paso por aquí para recordarle su pedido en *Frescoh!*. 🍎\n\n` +
            `Aún no hemos recibido la confirmación de su pago. Recuerde que para agendar su entrega para el día *${deliveryDate}*, ` +
            `necesitamos el soporte de pago y sus datos de entrega (dirección, documento, email sumercé).\n\n` +
            `¡Quedo atento para ayudarle!`;
        } else {
          reminderText = `¡Buenas tardes sumercé! ¿Cómo se encuentra? 😊\n\n` +
            `Paso por aquí para comentarle que aún no recibo el soporte de pago de su pedido. Por favor, compártamelo por este medio para confirmar su entrega ` +
            `para el próximo *${deliveryDate}*. ¡Muchas gracias!`;
        }

        this.logger.log(`📢 Enviando recordatorio a ${client.name} (${client.id})`);

        const message = Message.create({
          content: reminderText,
          role: 'assistant',
          channel: 'whatsapp' // Por defecto asumimos WhatsApp para estos recordatorios
        });

        try {
          await this.channelsService.sendMessage(message, client.id, 'whatsapp');

          // Marcar que ya enviamos el recordatorio para no repetir
          session.metadata = session.metadata || {};
          session.metadata.lastReminderSent = now.toISOString();
          await this.sessionsService.update(session);
        } catch (error) {
          this.logger.error(`❌ Error enviando recordatorio a ${client.id}: ${error.message}`);
        }
      }
    }
  }

  private calculateNextDeliveryDate(config: Record<string, string>, orderDateStr?: string): string {
    if (config['FECHA_ENTREGA_EXACTA'] && config['FECHA_ENTREGA_EXACTA'].length > 3) {
      return config['FECHA_ENTREGA_EXACTA'];
    }

    const d1 = config['DIAS_ENTREGA_1'] || 'Jueves';
    const d2 = config['DIAS_ENTREGA_2'] || 'Lunes';

    // Usar la fecha del pedido si existe, sino la actual
    const baseDate = orderDateStr ? new Date(orderDateStr) : new Date();
    const today = baseDate.getDay();

    // Lógica solicitada:
    // Martes (2) o Miércoles (3) -> Jueves
    // Viernes (5) o Sábado (6) -> Lunes
    if (today === 2 || today === 3) {
      return d1;
    } else if (today === 5 || today === 6) {
      return d2;
    } else if (today === 1) {
      return d1; // Lunes -> Jueves
    } else {
      return d2; // Jueves o Domingo -> Lunes
    }
  }
}
