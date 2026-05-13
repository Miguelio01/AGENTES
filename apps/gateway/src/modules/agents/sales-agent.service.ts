import { Injectable, Logger, Inject } from '@nestjs/common';

import {
  AgentRequest,
  AgentResponse,
  Order,
  CLIENT_REPOSITORY_PORT,
  INVENTORY_PROVIDER_PORT,
} from '@agentes/domain';
import type { IClientRepository, IInventoryProvider } from '@agentes/domain';
import { InventoryAgentService } from './inventory-agent.service';

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);

  constructor(
    private readonly inventoryAgent: InventoryAgentService,
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(
      `🛒 Sales Agent gestionando proceso de venta: ${request.action}`,
    );

    if (request.action === 'register_prepaid') {
      return this.handleRegisterPrepaid(request);
    }

    // Este agente es el "dueño" del proceso de venta (El Reglamento)
    // Regla: Si el cliente confirma, procedemos a dar precios. Si no, listamos.
    const isConfirmation = this.checkIfConfirmation(
      request.context.lastMessage || '',
    );

    if (isConfirmation) {
      return this.processFinalBill(request);
    } else {
      return this.processProductList(request);
    }
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

    const items = request.data.items || [];
    const order = Order.create({
      clientId: client.id,
      agentId: 'sales-agent',
      items: items.map((i: any) => ({
        productId: i.product,
        name: i.productName || i.product,
        quantity: i.quantity,
        price: i.pricePerUnit || 0,
      })),
    });

    // Registrar en la lista de prepago de Google Sheets
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

  private checkIfConfirmation(message: string): boolean {
    const low = message.toLowerCase();
    return (
      low.includes('ok') ||
      low.includes('sí') ||
      low.includes('si') ||
      low.includes('hágale') ||
      low.includes('pedido') ||
      low.includes('confirmado') ||
      low.includes('cuánto sería') ||
      low.includes('cuanto es') ||
      low.includes('cuanto vale')
    );
  }

  private async processProductList(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Paso 1 del Reglamento: Solo listar productos y pedir confirmación
    const items = request.data || [];
    const results: any[] = [];
    let clarificationRequired: any = null;

    if (items.length === 0) {
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: {
          message:
            'No pude identificar los productos que mencionas, sumercé. ¿Me repite el pedido?',
        },
      };
    }

    for (const item of items) {
      const invResponse = await this.inventoryAgent.handleRequest({
        ...request,
        action: 'check_stock',
        data: {
          productName: item.product,
          requestedQuantity: item.quantity,
          unit: item.unit,
        },
      });

      if (invResponse.status === 'ERROR') {
        results.push({
          productName: item.product,
          available: false,
          error: true,
          message: `No encontré "${item.product}" en la cosecha actual.`,
        });
      } else if (invResponse.status === 'REQUIRES_USER_INPUT') {
        clarificationRequired = invResponse.data;
        results.push({
          productName: item.product,
          available: true,
          needsClarification: true,
          options: invResponse.data.options
        });
      } else {
        results.push(invResponse.data);
      }
    }

    if (clarificationRequired) {
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'REQUIRES_USER_INPUT',
        data: {
          ...clarificationRequired,
          items: results, // Guardamos lo que sí encontramos
          phase: 'CLARIFICATION',
        },
      };
    }

    return {
      from: 'fulfillment-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: {
        phase: 'LISTING',
        items: results,
        message:
          'Por favor confirme si el pedido es correcto para proceder con el cobro.',
      },
    };
  }

  private async processFinalBill(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Paso 2 del Reglamento: Dar precios y total
    const items = request.data || [];
    const results: any[] = [];
    const config = await this.inventoryProvider.getConfig();
    const deliveryFee = parseInt(config['COSTO_DOMICILIO']) || 0;
    const deliveryDate = config['DIAS_ENTREGA'] || 'Jueves';

    for (const item of items) {
      const invResponse = await this.inventoryAgent.handleRequest({
        ...request,
        action: 'check_stock',
        data: {
          productName: item.product,
          requestedQuantity: item.quantity,
          unit: item.unit,
        },
      });

      if (invResponse.status !== 'ERROR') {
        this.logger.log(`💰 Item procesado para factura: ${invResponse.data.productName} - Precio: ${invResponse.data.pricePerUnit} - Total: ${invResponse.data.totalPrice}`);
        results.push(invResponse.data);
      } else {
        this.logger.warn(`❌ No se pudo obtener precio para item: ${item.product}`);
        results.push({
          productName: item.product,
          available: false,
          error: true,
          pricePerUnit: 0,
          totalPrice: 0,
        });
      }
    }

    const subtotal = results.reduce(
      (sum: number, item: any) => sum + (item.totalPrice || 0),
      0,
    );
    const total = subtotal + deliveryFee;

    return {
      from: 'fulfillment-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: {
        phase: 'BILLING',
        items: results,
        subtotal,
        deliveryFee,
        deliveryDate,
        total,
        currency: 'COP',
        message:
          'Pedido consolidado. ¿Desea pagar por transferencia o efectivo?',
      },
    };
  }
}
