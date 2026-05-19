import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import {
  PaymentProofSubmittedEvent,
  AdminPaymentApprovedEvent,
  Message,
  INVENTORY_PROVIDER_PORT,
  Order,
  Session,
  EmotionalState,
} from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { ChannelsService } from '../../channels/channels.service';
import { SessionsService } from '../../sessions/sessions.service';
import { ClientsService } from '../../clients/clients.service';
import { ConfigService } from '@nestjs/config';
import { FinanceAgentService } from '../../agents/finance-agent.service';

@Injectable()
export class OrderSaga {
  private readonly logger = new Logger(OrderSaga.name);

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    private readonly configService: ConfigService,
    private readonly financeAgent: FinanceAgentService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  @OnEvent('payment.proof.submitted')
  async handlePaymentProof(event: PaymentProofSubmittedEvent) {
    this.logger.log(
      `🔔 Saga: Payment proof received for client ${event.clientId}`,
    );

    const adminId = this.configService.get<string>('TELEGRAM_ADMIN_ID');
    const clientName = event.metadata?.clientName || 'Cliente Desconocido';
    const total = event.metadata?.total || 0;

    // 1. Notificar al Admin (Siempre se hace por seguridad y visibilidad)
    if (adminId) {
      const adminMessage = Message.create({
        content: `📸 *NUEVO COMPROBANTE DE PAGO*\n\n*Cliente:* ${clientName} (${event.clientId})\n*Pedido:* ${event.orderId}\n*Monto esperado:* $${total.toLocaleString('es-CO')}\n\nResponde con: \`/aprobado ${event.orderId} ${event.clientId}\` si la validación automática no ocurre.`,
        role: 'assistant',
        channel: 'telegram',
        metadata: { media: event.mediaBuffer },
      });
      await this.channelsService.sendMessage(adminMessage, adminId, 'telegram');
    }

    // 2. Intento de Validación Automática (Hito 3.3)
    if (total > 0) {
      this.logger.log(`💰 Saga: Intentando validación automática para $${total}...`);
      
      const financeResponse = await this.financeAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'finance-agent',
        action: 'verify_payment',
        context: { clientId: event.clientId },
        data: { amount: total }
      });

      if (financeResponse.status === 'SUCCESS' && financeResponse.data.verified) {
        this.logger.log(`✅ Saga: Pago validado automáticamente para pedido ${event.orderId}`);
        
        // Disparar aprobación automática
        this.eventEmitter.emit(
          'order.approved',
          new AdminPaymentApprovedEvent(event.orderId, 'SYSTEM-AUTO', event.clientId)
        );
      } else {
        this.logger.log(`⏳ Saga: Validación automática pendiente o fallida para pedido ${event.orderId}`);
      }
    }
  }

  @OnEvent('order.approved')
  async handleOrderApproved(event: AdminPaymentApprovedEvent) {
    this.logger.log(
      `🚀 Saga: Order ${event.orderId} approved. Validating client data...`,
    );

    // MEJORA: Si no tenemos el clientId, lo buscamos en el Excel proactivamente
    let clientId = event.clientId;
    let items = [];
    
    try {
      const details = await this.inventoryProvider.getPrepaidOrderDetails(event.orderId);
      if (details) {
        clientId = clientId || details.clientId;
        items = details.items || [];
      }
    } catch (e: any) {
      this.logger.warn(`⚠️ No se pudieron recuperar detalles del Excel para ${event.orderId}: ${e.message}`);
    }

    if (!clientId) {
      this.logger.error(`❌ No se pudo determinar el Cliente para el pedido ${event.orderId}`);
      return;
    }

    const client = await this.clientsService.findOne(clientId);

    if (!client) {
      this.logger.error(`❌ Cliente ${clientId} no encontrado en la base de datos para aprobación`);
      return;
    }

    // Buscar sesión por LID primero (que es por donde responde WhatsApp), luego por ID/Teléfono
    let session = await this.sessionsService.findActiveByClientId(client.lid || clientId);

    if (!session && client.lid) {
      session = await this.sessionsService.findActiveByClientId(clientId);
    }

    // Si no hay sesión activa, crear una nueva vinculada al LID si lo tenemos
    if (!session) {
      const sessionTargetId = client.lid || clientId;
      this.logger.log(`🔍 Creando nueva sesión para recolección de datos de ${client.name} (Target: ${sessionTargetId})`);
      session = await this.sessionsService.create(
        new Session({
          id: crypto.randomUUID(),
          clientId: sessionTargetId,
          agentId: 'fresquitoh-bot',
          history: [],
          status: 'active',
          flowState: 'IDLE',
          emotionalState: EmotionalState.neutral(),
          lastActivity: new Date(),
          metadata: {}
        })
      );
    }
    // VERIFICACIÓN DE PERFIL COMPLETO (Hito solicitado por Miguel)
    const isProfileComplete = !!(client.fullName && client.documentNumber && client.address && client.city);

    if (!isProfileComplete) {
      this.logger.log(`⚠️ Cliente ${client.name} tiene perfil incompleto. Iniciando recolección de datos masiva.`);

      // Asegurar que metadata existe
      session.metadata = session.metadata || {};

      // Guardar el pedido aprobado para finalizar el registro después
      session.metadata.pendingDeliveryRegistration = { orderId: event.orderId };

      const prompt = `¡Excelentes noticias don *${client.name}*! El patrón ya confirmó su pago. ✅\n\nSin embargo, me di cuenta que no tengo sus datos completos para el despacho. Por favor, regáleme en un solo mensaje los siguientes datos:\n\n1. *Nombre completo o Razón Social*\n2. *Cédula o NIT*\n3. *Dirección de entrega*\n\n¡Quedo atento sumercé para agendar su entrega!`;

      session.setFlowState('AWAITING_BULK_DATA');
      await this.sessionsService.update(session);

      const whatsappJid = clientId.includes('@') ? clientId : `${clientId}@s.whatsapp.net`;
      await this.channelsService.sendMessage(Message.create({
        content: prompt,
        role: 'assistant',
        channel: 'whatsapp'
      }), whatsappJid, 'whatsapp');
      return;
    }
    // SI EL PERFIL ESTÁ COMPLETO: PROCEDER NORMALMENTE
    try {
      const config = await this.inventoryProvider.getConfig();
      const deliveryDate = config['FECHA_ENTREGA'] || config['DIAS_ENTREGA'] || 'esta semana';

      const items = session?.metadata?.currentOrderItems || [];
      const deliveryFee = session?.metadata?.deliveryFee || 0;
      const total = session?.metadata?.total || 0;

      const order = Order.create({
        id: event.orderId,
        clientId: client.id,
        agentId: 'sales-agent',
        items: items.map((i: any) => ({
          productId: i.productId || i.product,
          name: i.productName || i.product,
          quantity: i.quantity || i.unitsNeeded || 1,
          price: i.pricePerUnit || 0,
        })),
        deliveryFee,
        total
      });

      await this.inventoryProvider.registerDeliveryOrder(order, client);
      await this.inventoryProvider.removeFromPrepaidList(event.orderId);

      this.logger.log(`✅ Order ${event.orderId} moved to delivery list.`);

      const confirmationMessage = Message.create({
        content: `¡Excelentes noticias don *${client.name}*! El patrón ya confirmó su pago. Su pedido ya quedó anotado en la *Lista de Entrega* para el día *${deliveryDate}*. Pronto le estaremos avisando cuando salga el camión con su cosecha. ¡Muchas gracias por preferir Frescoh!`,
        role: 'assistant',
        channel: 'whatsapp',
      });
      const whatsappJid = clientId.includes('@') ? clientId : `${clientId}@s.whatsapp.net`;
      await this.channelsService.sendMessage(confirmationMessage, whatsappJid, 'whatsapp');

      if (session) {
        session.setFlowState('IDLE');
        await this.sessionsService.update(session);
      }
    } catch (error) {
      this.logger.error(`❌ Error finalizando pedido aprobado: ${error.message}`);
    }
  }

  @OnEvent('order.rejected')
  async handleOrderRejected(event: { orderId: string; adminId: string }) {
    this.logger.log(`❌ Saga: Order ${event.orderId} rejected. Reverting stock...`);
    
    try {
      // 1. Recuperar el pedido de la lista de prepago para saber qué devolver
      const prepaidOrder = await this.inventoryProvider.getPrepaidOrderDetails(event.orderId);
      
      if (prepaidOrder) {
        this.logger.log(`🔄 Reventing stock for ${prepaidOrder.items.length} items`);
        // 2. Devolver stock
        for (const item of prepaidOrder.items) {
          await this.inventoryProvider.updateStock(item.productId, item.quantity);
        }
        
        // 3. Eliminar de prepago
        await this.inventoryProvider.removeFromPrepaidList(event.orderId);
        this.logger.log(`✅ Stock reverted and order ${event.orderId} removed from prepago`);
      } else {
        this.logger.warn(`⚠️ Could not find details for order ${event.orderId} in prepago list.`);
      }
    } catch (error) {
      this.logger.error(`❌ Error rejecting order: ${error.message}`);
    }
  }
}
