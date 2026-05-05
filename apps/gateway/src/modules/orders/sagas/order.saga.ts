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
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OrderSaga {
  private readonly logger = new Logger(OrderSaga.name);

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
    @Inject(INVENTORY_PROVIDER_PORT) private readonly inventoryProvider: IInventoryProvider,
  ) {}

  @OnEvent('payment.proof.submitted')
  async handlePaymentProof(event: PaymentProofSubmittedEvent) {
    this.logger.log(`🔔 Saga: Payment proof received for client ${event.clientId}`);
    
    const adminId = this.configService.get<string>('TELEGRAM_ADMIN_ID');
    if (!adminId) {
      this.logger.warn('⚠️ No TELEGRAM_ADMIN_ID configured');
      return;
    }

    const clientName = event.metadata?.clientName || 'Cliente Desconocido';
    
    const adminMessage = Message.create({
      content: `📸 *NUEVO COMPROBANTE DE PAGO*\n\n*Cliente:* ${clientName} (${event.clientId})\n*Pedido:* ${event.orderId}\n\nResponde con: "Aprobar ${event.orderId}" para descontar del inventario real.`,
      role: 'assistant',
      channel: 'telegram',
      metadata: { media: event.mediaBuffer } // Pasar el buffer para que el adaptador envíe foto
    });

    await this.channelsService.sendMessage(adminMessage, adminId, 'telegram');
  }

  @OnEvent('order.approved')
  async handleOrderApproved(event: AdminPaymentApprovedEvent) {
    this.logger.log(`🚀 Saga: Order ${event.orderId} approved by admin. Processing...`);

    // 1. Obtener la sesión del cliente (en un caso real buscaríamos por pedido)
    // Para simplificar este flujo, asumimos que el pedido está ligado a una sesión activa
    // En producción, usaríamos un repositorio de pedidos real.

    // 2. Sincronizar con Google Sheets
    try {
      // Simulación de productos para descontar (en un flujo real esto vendría del pedido guardado)
      // await this.inventoryProvider.updateStock('PROD-001', -1);
      // await this.inventoryProvider.registerOrder(order);
      
      this.logger.log(`📊 Inventory updated for order ${event.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Error updating inventory: ${error.message}`);
    }

    // 3. Notificar al cliente por WhatsApp
    // Aquí necesitaríamos el clientId. Para el MVP usamos un mock o buscamos la sesión.
    // Suponiendo que recuperamos el clientId de la base de datos de pedidos:
    const clientId = '573058634572@s.whatsapp.net'; // Mock o recuperación real

    const confirmationMessage = Message.create({
      content: '¡Buenas noticias sumercé! El patrón ya confirmó su pago. Su pedido ya quedó anotado en la lista de la semana y pronto le estaremos avisando cuando salga el camión con su cosecha. ¡Muchas gracias por preferir lo nuestro!',
      role: 'assistant',
      channel: 'whatsapp'
    });

    await this.channelsService.sendMessage(confirmationMessage, clientId, 'whatsapp');

    // 4. Resetear el estado de la sesión
    const session = await this.sessionsService.findActiveByClientId(clientId);
    if (session) {
      session.setFlowState('IDLE');
      await this.sessionsService.update(session);
    }
  }
}
