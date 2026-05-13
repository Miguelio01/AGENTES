import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PaymentProofSubmittedEvent,
  AdminPaymentApprovedEvent,
  Message,
  INVENTORY_PROVIDER_PORT,
} from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { ChannelsService } from '../../channels/channels.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ClientsService } from '../../clients/clients.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderSaga {
  private readonly logger = new Logger(OrderSaga.name);

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    private readonly configService: ConfigService,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  @OnEvent('payment.proof.submitted')
  async handlePaymentProof(event: PaymentProofSubmittedEvent) {
    this.logger.log(
      `🔔 Saga: Payment proof received for client ${event.clientId}`,
    );

    const adminId = this.configService.get<string>('TELEGRAM_ADMIN_ID');
    if (!adminId) {
      this.logger.warn('⚠️ No TELEGRAM_ADMIN_ID configured');
      return;
    }

    const clientName = event.metadata?.clientName || 'Cliente Desconocido';

    const adminMessage = Message.create({
      content: `📸 *NUEVO COMPROBANTE DE PAGO*\n\n*Cliente:* ${clientName} (${event.clientId})\n*Pedido:* ${event.orderId}\n\nResponde con: "Aprobar ${event.orderId}" para enviarlo a la lista de entrega.`,
      role: 'assistant',
      channel: 'telegram',
      metadata: { media: event.mediaBuffer },
    });

    await this.channelsService.sendMessage(adminMessage, adminId, 'telegram');
  }

  @OnEvent('order.approved')
  async handleOrderApproved(event: AdminPaymentApprovedEvent) {
    this.logger.log(
      `🚀 Saga: Order ${event.orderId} approved. Moving to Delivery List...`,
    );

    // 1. Obtener datos del cliente (el clientId real, no el mock)
    // En el evento actual, necesitamos mapear el orderId al clientId
    // Por ahora, como es prueba, intentaremos encontrar la sesión activa o el cliente

    // IMPORTANTE: En una versión real el evento debería traer el clientId.
    // Usaremos un truco temporal: si no viene el clientId, lo buscamos por el ID del evento si es un número de teléfono
    const clientId = event.clientId || '573042450082'; // Priorizar el real del patrón para pruebas
    const client = await this.clientsService.findOne(clientId);

    if (!client) {
      this.logger.error(`❌ Cliente ${clientId} no encontrado para aprobación`);
      return;
    }

    // 2. Sincronizar con Google Sheets (Lista de Entrega)
    try {
      // Mock de pedido para la lista de entrega (en real se guardaría en DB)
      const mockOrder = {
        id: event.orderId,
        clientId: client.id,
        items: [],
        total: 0,
        createdAt: new Date(),
      } as any;

      await this.inventoryProvider.registerDeliveryOrder(mockOrder, client);
      this.logger.log(
        `✅ Order ${event.orderId} moved to lista_entrega in Sheets`,
      );
    } catch (error) {
      this.logger.error(`❌ Error moving to delivery list: ${error.message}`);
    }

    // 3. Notificar al cliente por WhatsApp
    const confirmationMessage = Message.create({
      content: `¡Excelentes noticias don *${client.name}*! El patrón ya confirmó su pago. Su pedido ya quedó anotado en la *Lista de Entrega* y pronto le estaremos avisando cuando salga el camión con su cosecha. ¡Muchas gracias por preferir Frescoh!`,
      role: 'assistant',
      channel: 'whatsapp',
    });

    // Asegurarse de enviar al ID correcto (con @s.whatsapp.net si es necesario)
    const whatsappJid = clientId.includes('@')
      ? clientId
      : `${clientId}@s.whatsapp.net`;
    await this.channelsService.sendMessage(
      confirmationMessage,
      whatsappJid,
      'whatsapp',
    );

    // 4. Resetear el estado de la sesión
    const session = await this.sessionsService.findActiveByClientId(clientId);
    if (session) {
      session.setFlowState('IDLE');
      await this.sessionsService.update(session);
    }
  }
}
