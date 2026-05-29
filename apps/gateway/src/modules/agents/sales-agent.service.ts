import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  AgentRequest,
  AgentResponse,
  Order,
  CLIENT_REPOSITORY_PORT,
  INVENTORY_PROVIDER_PORT,
} from '@agentes/domain';
import type { IClientRepository, IInventoryProvider } from '@agentes/domain';

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  /**
   * Este servicio ahora actúa principalmente como una "Mano" 
   * para operaciones deterministas de ventas (registrar en Sheets).
   */
  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`🛒 Sales Agent Tool: ${request.action}`);

    if (request.action === 'register_prepaid') {
      return this.handleRegisterPrepaid(request);
    }

    return {
      from: 'sales-agent',
      to: request.from,
      status: 'ERROR',
      data: { message: `Acción desconocida en SalesAgent: ${request.action}` },
    };
  }

  private async handleRegisterPrepaid(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const client = await this.clientRepository.findById(
      request.context.clientId,
    );
    if (!client)
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: { message: 'Cliente no encontrado' },
      };

    const config = await this.inventoryProvider.getConfig();
    const rawFee = config['COSTO_DOMICILIO'] || '0';
    const configDeliveryFee = parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 0;

    // Priorizar el deliveryFee que viene en el request (ej. desde TelegramOrdersService)
    // Si es undefined o null, usar el de la configuración.
    const deliveryFee = (request.data.deliveryFee !== undefined && request.data.deliveryFee !== null)
      ? request.data.deliveryFee
      : configDeliveryFee;

    const items = request.data.items || [];
    const order = Order.create({
      id: request.context.orderId,
      clientId: client.id,
      agentId: 'sales-agent',
      deliveryFee,
      items: items.map((i: any) => ({
        productId: i.productId || i.product || i.id || 'MANUAL',
        name: i.productName || i.product || i.name || 'Producto',
        quantity: i.quantity || i.unitsNeeded || 1,
        price: i.pricePerUnit || i.price || 0,
      })),
    });

    await this.inventoryProvider.registerPrepaidOrder(order, client);

    return {
      from: 'fulfillment-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: {
        orderId: order.id,
        message: 'Pedido registrado en lista de prepago',
      },
    };
  }
}
