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
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const config = await this.inventoryProvider.getConfig();

    for (const session of sessions) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
      let reminderText = '';
      let reminderKey = '';

      // 1. Prioridad: Recordatorio de 24 Horas
      if (timeSinceActivity > TWENTY_FOUR_HOURS && !session.metadata?.reminder24hSent) {
        reminderText = `¡Buen día! Le escribo porque aún no hemos recibido el pago de su pedido. Como trabajamos con productos bien frescos 🌱, necesitamos liberar el cupo en el centro de despacho si la orden no se ha confirmado. ¿Aún desea mantenerla? Quedo atento a lo que usted me indique.`;
        reminderKey = 'reminder24hSent';
      } 
      // 2. Recordatorio de 2 horas (si no se ha enviado ninguno)
      else if (timeSinceActivity > TWO_HOURS && !session.metadata?.lastReminderSent) {
        const client = await this.clientsService.findOne(session.clientId);
        if (!client) continue;

        const isNewClient = !client.address || !client.documentNumber;
        const deliveryDate = this.calculateNextDeliveryDate(config, session.metadata?.orderDate);

        if (isNewClient) {
          reminderText = `¡Buen día! Paso por aquí para saludarle y recordarle que tenemos su pedido en *Frescoh!* pendiente de confirmación. 🍎\n\n` +
            `Como nuestros productos son frescos, me gustaría saber si aún está interesado para reservarlos de una vez en el centro de despacho. ` +
            `Recuerde que para agendar su entrega para el día *${deliveryDate}*, necesitamos el soporte de pago y sus datos de entrega (dirección, documento e email).\n\n` +
            `¡Quedo atento para ayudarle!`;
        } else {
          reminderText = `¡Buenas tardes! ¿Cómo se encuentra? 😊\n\n` +
            `Paso por aquí para recordarle que aún no recibimos el soporte de pago de su pedido. Como nuestros productos son frescos, ` +
            `me gustaría confirmar si aún lo desea para reservarlo de una vez en el centro de despacho y agendar su entrega para el próximo *${deliveryDate}*. ¡Muchas gracias!`;
        }
        reminderKey = 'lastReminderSent';
      }

      if (reminderText) {
        const client = await this.clientsService.findOne(session.clientId);
        if (!client) continue;

        this.logger.log(`📢 Enviando recordatorio (${reminderKey}) a ${client.name} (${client.id})`);

        const message = Message.create({
          content: reminderText,
          role: 'assistant',
          channel: 'whatsapp'
        });

        try {
          const whatsappJid = client.id.includes('@') ? client.id : `${client.id}@s.whatsapp.net`;
          await this.channelsService.sendMessage(message, whatsappJid, 'whatsapp');

          // Marcar que ya enviamos el recordatorio para no repetir
          session.metadata = session.metadata || {};
          session.metadata[reminderKey] = now.toISOString();
          await this.sessionsService.update(session);
        } catch (error: any) {
          this.logger.error(`❌ Error enviando recordatorio a ${client.id}: ${error.message}`);
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleFeedbackReminders() {
    this.logger.log('⏰ Iniciando escaneo de recordatorios de satisfacción (feedback)...');
    const clients = await this.clientsService.findAll();
    const now = new Date();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (const client of clients) {
      const lastDelivery = client.metadata?.lastDeliveryDate;
      if (!lastDelivery) continue;

      const diff = now.getTime() - new Date(lastDelivery).getTime();
      const orderId = client.metadata?.lastShippedOrderId;

      // Si fue hace más de 24h y menos de 72h (ventana razonable)
      // Y no hemos enviado feedback para este pedido específico
      if (diff > ONE_DAY_MS && diff < ONE_DAY_MS * 3 && client.metadata?.feedbackSentForOrder !== orderId) {
        this.logger.log(`📢 Enviando encuesta de satisfacción a ${client.name} (${client.phone})`);
        
        const feedbackMessage = Message.create({
          content: `¡Buen día! Espero que haya disfrutado mucho sus productos frescos. 🌱 Para nosotros en *Frescoh!* es muy importante saber cómo le fue con su pedido. ¿Tiene algún comentario o sugerencia que quiera compartirnos? Nos encantaría mejorar para usted.`,
          role: 'assistant',
          channel: 'whatsapp'
        });

        try {
          const whatsappJid = client.phone.includes('@') ? client.phone : `${client.phone}@s.whatsapp.net`;
          await this.channelsService.sendMessage(feedbackMessage, whatsappJid, 'whatsapp');
          
          client.updateProfile({
            metadata: { ...(client.metadata || {}), feedbackSentForOrder: orderId }
          });
          await this.clientsService.save(client);
        } catch (error: any) {
          this.logger.error(`❌ Error enviando feedback a ${client.phone}: ${error.message}`);
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async handleInactivityReminders() {
    this.logger.log('⏰ Iniciando escaneo de inactividad (3 semanas)...');
    const clients = await this.clientsService.findAll();
    const now = new Date();
    const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

    for (const client of clients) {
      const lastOrder = client.metadata?.lastOrderDate;
      if (!lastOrder) continue;

      const diff = now.getTime() - new Date(lastOrder).getTime();

      // Si lleva más de 21 días inactivo y no le hemos enviado el recordatorio aún
      if (diff > THREE_WEEKS_MS && !client.metadata?.inactivityReminderSent) {
        this.logger.log(`📢 Enviando recordatorio de inactividad a ${client.name} (${client.phone})`);

        const inactivityMessage = Message.create({
          content: `¡Hola! Hace un tiempo que no sabemos de usted por aquí en *Frescoh!* 🥀. Le hemos extrañado en nuestros despachos. ¿Le gustaría revisar nuestro catálogo de esta semana 🛒? Tenemos productos muy ricos y frescos esperándole. ¡Quedo atento por si desea hacer un nuevo encargo!`,
          role: 'assistant',
          channel: 'whatsapp'
        });

        try {
          const whatsappJid = client.phone.includes('@') ? client.phone : `${client.phone}@s.whatsapp.net`;
          await this.channelsService.sendMessage(inactivityMessage, whatsappJid, 'whatsapp');
          
          client.updateProfile({
            metadata: { ...(client.metadata || {}), inactivityReminderSent: true }
          });
          await this.clientsService.save(client);
        } catch (error: any) {
          this.logger.error(`❌ Error enviando recordatorio de inactividad a ${client.phone}: ${error.message}`);
        }
      }
    }
  }

  private calculateNextDeliveryDate(config: Record<string, string>, orderDateStr?: string): string {
    let date = 'Jueves';

    if (config['FECHA_ENTREGA_EXACTA'] && config['FECHA_ENTREGA_EXACTA'].length > 3) {
      date = config['FECHA_ENTREGA_EXACTA'];
    } else {
      const d1 = config['DIAS_ENTREGA_1'] || 'Jueves';
      const d2 = config['DIAS_ENTREGA_2'] || 'Lunes';

      // Usar la fecha del pedido si existe, sino la actual
      const baseDate = orderDateStr ? new Date(orderDateStr) : new Date();
      const today = baseDate.getDay();

      // Lógica:
      // Martes (2) o Miércoles (3) -> Jueves
      // Viernes (5) o Sábado (6) -> Lunes
      if (today === 2 || today === 3) {
        date = d1;
      } else if (today === 5 || today === 6) {
        date = d2;
      } else if (today === 1) {
        date = d1; // Lunes -> Jueves
      } else {
        date = d2; // Jueves o Domingo -> Lunes
      }
    }

    // Validación final de seguridad contra valores basura como "frutas" o "futras"
    if (date.toLowerCase().includes('fruta') || date.toLowerCase().includes('futra')) {
      this.logger.warn(`⚠️ Detectado valor basura en fecha de entrega para recordatorio: "${date}". Revirtiendo a Jueves.`);
      return 'Jueves';
    }

    return date;
  }
}
