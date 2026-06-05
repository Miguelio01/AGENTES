import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  AgentRequest,
  AgentResponse,
} from '@agentes/domain';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);

  constructor(
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Este servicio ahora actúa principalmente como una "Mano"
   * para operaciones deterministas de ventas.
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
    try {
      const order = await this.ordersService.createOrder({
        orderId: request.context.orderId,
        clientId: request.context.clientId,
        items: request.data.items || [],
        deliveryFee: request.data.deliveryFee,
      });

      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'SUCCESS',
        data: {
          orderId: order.id,
          message: 'Pedido registrado en lista de prepago',
        },
      };
    } catch (error: any) {
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: { message: error.message },
      };
    }
  }
}
