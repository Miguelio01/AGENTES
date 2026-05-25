import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import {
  AgentRequest,
  AgentResponse,
  Order,
  CLIENT_REPOSITORY_PORT,
  INVENTORY_PROVIDER_PORT,
} from '@agentes/domain';
import type { IClientRepository, IInventoryProvider } from '@agentes/domain';
import { InventoryAgentService } from './inventory-agent.service';
import { ConfigService } from '@nestjs/config';
import httpx from 'axios'; // Usaremos axios ya que es común en NestJS

@Injectable()
export class SalesAgentService implements OnModuleInit {
  private readonly logger = new Logger(SalesAgentService.name);
  private adkUrl: string;

  constructor(
    private readonly inventoryAgent: InventoryAgentService,
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.adkUrl = this.configService.get<string>('ADK_SALES_AGENT_URL') || 'http://localhost:8000';
  }

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(
      `🛒 Sales Agent gestionando proceso de venta: ${request.action}`,
    );

    // --- INTEGRACIÓN ADK (PYTHON) ---
    if (this.configService.get('USE_ADK_SALES_AGENT') === 'true' && request.action === 'manage_sale') {
      try {
        this.logger.log(`🧠 Delegando razonamiento a ADK Agent (Python) en ${this.adkUrl}...`);
        
        // Enriquecer el mensaje para el ADK con el contexto del pedido si existe
        let enrichedMessage = request.context.lastMessage;
        if (request.context.orderId) {
            enrichedMessage = `[CONTEXTO DE PEDIDO ACTUAL: ID ${request.context.orderId}]\n` + enrichedMessage;
        }

        const response = await httpx.post(`${this.adkUrl}/run`, {
          user_id: request.context.clientId,
          session_id: `session-${request.context.clientId}`,
          message: enrichedMessage,
          client_id: request.context.clientId,
          order_id: request.context.orderId,
          items: request.data, // Pasar los items extraídos
        }, { timeout: 15000 });

        return {
          from: 'sales-agent',
          to: request.from,
          status: 'SUCCESS',
          data: {
            content: response.data.reply,
            phase: 'ADK_MANAGED',
            items: request.data, // Retornar los items para que el orquestador sepa qué registrar
          },
        };
      } catch (e) {
        this.logger.error(`❌ Error llamando a ADK Sales Agent: ${e.message}. Usando fallback local.`);
      }
    }

    if (request.action === 'register_prepaid') {
      return this.handleRegisterPrepaid(request);
    }

    const isConfirmation = request.context.forceBilling || this.checkIfConfirmation(
      request.context.lastMessage || '',
    );

    // Si hay productos en el mensaje actual, los combinamos con los que ya teníamos
    const currentItems = request.data || [];
    const previousItems = request.context.currentCart || [];
    const message = (request.context.lastMessage || '').toLowerCase();
    
    let mergedItems: any[] = [];

    this.logger.log(`🛒 Items en carrito previo: ${previousItems.length}`);

    if (currentItems.length > 0) {
      this.logger.log(`🛒 Procesando ${currentItems.length} items nuevos de la extracción.`);
      
      const cart = new Map();
      // Inicializar con lo anterior (usando ID o nombre real como llave)
      previousItems.forEach((i: any) => {
        const key = (i.productId || i.productName || i.product).toLowerCase();
        cart.set(key, {
          product: i.productName || i.product,
          productId: i.productId,
          quantity: i.unitsNeeded || i.quantity || 1,
          unit: i.unit || i.presentation || 'unidad',
          pricePerUnit: i.pricePerUnit || 0
        });
      });

      // Aplicar cambios nuevos
      currentItems.forEach((newItem: any) => {
        const key = (newItem.productId || newItem.product).toLowerCase();
        if (cart.has(key)) {
          const existing = cart.get(key);
          if (message.includes('más') || message.includes('adicional') || message.includes('también')) {
            existing.quantity += newItem.quantity;
          } else {
            existing.quantity = newItem.quantity; 
          }
        } else {
          cart.set(key, newItem);
        }
      });
      mergedItems = Array.from(cart.values());
    } else {
      // Si no hay items nuevos, recuperar el carrito previo COMPLETO con sus metadatos
      mergedItems = previousItems.map((i: any) => ({
        product: i.productName || i.product,
        productId: i.productId,
        quantity: i.unitsNeeded || i.quantity || 1,
        unit: i.unit || i.presentation || 'unidad',
        pricePerUnit: i.pricePerUnit || 0
      }));
    }

    if (isConfirmation && mergedItems.length > 0) {
      return this.processFinalBill({ ...request, data: mergedItems });
    } else {
      return this.processProductList({ ...request, data: mergedItems });
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

    const config = await this.inventoryProvider.getConfig();
    // Parseo robusto del costo de domicilio: "$9.000,00" -> 9000
    const rawFee = config['COSTO_DOMICILIO'] || '0';
    const deliveryFee = parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 0;

    const items = request.data.items || [];
    const order = Order.create({
      id: request.context.orderId,
      clientId: client.id,
      agentId: 'sales-agent',
      deliveryFee,
      items: items.map((i: any) => ({
        productId: i.productId || i.product,
        name: i.productName || i.product || 'Producto',
        quantity: i.quantity || i.unitsNeeded || 1,
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
    const low = message.toLowerCase().trim();
    return (
      low.includes('ok') ||
      low.includes('sí') ||
      low.includes('si') ||
      low.includes('hágale') ||
      low.includes('pedido') ||
      low.includes('confirmado') ||
      low.includes('cuánto sería') ||
      low.includes('cuanto es') ||
      low.includes('cuanto vale') ||
      low.includes('listo') ||
      low.includes('dale') ||
      low.includes('de una') ||
      low.includes('perfecto') ||
      low.includes('así está bien') ||
      low.includes('asi esta bien') ||
      low.includes('es correcto') ||
      low.includes('proceda') ||
      low.includes('la cuenta') ||
      low.includes('total') ||
      low.includes('valor')
    );
  }

  private async processProductList(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Paso 1 del Reglamento: Solo listar productos y pedir confirmación
    const items = request.data || [];
    const results: any[] = [];
    let clarificationRequired: any = null;

    this.logger.log(`📋 Listando ${items.length} productos para confirmación.`);

    if (items.length === 0) {
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: {
          message:
            '¡Ay sumercé! Se me borró lo que anoté. ¿Me repite qué es lo que quiere llevar?',
        },
      };
    }

    for (const item of items) {
      const invResponse = await this.inventoryAgent.handleRequest({
        ...request,
        action: 'check_stock',
        data: {
          productName: item.product || item.productName,
          productId: item.productId, 
          requestedQuantity: item.quantity || item.unitsNeeded,
          unit: item.unit,
        },
      });

      if (invResponse.status === 'ERROR') {
        results.push({
          productName: item.product || item.productName,
          available: false,
          error: true,
          message: `No encontré "${item.product || item.productName}" en la cosecha actual.`,
        });
      } else if (invResponse.status === 'REQUIRES_USER_INPUT') {
        clarificationRequired = invResponse.data;
        results.push({
          productName: item.product || item.productName,
          available: true,
          needsClarification: true,
          options: invResponse.data.options
        });
      } else {
        // Normalizar la salida del inventario para el carrito
        results.push({
          ...invResponse.data,
          product: invResponse.data.productName,
          quantity: invResponse.status === 'PARTIAL_STOCK' ? invResponse.data.availableQuantity : invResponse.data.unitsNeeded,
          originalRequestedQuantity: invResponse.data.unitsNeeded,
          isPartial: invResponse.status === 'PARTIAL_STOCK',
          isWaitlist: invResponse.status === 'WAITLIST'
        });
      }
    }

    if (clarificationRequired) {
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'REQUIRES_USER_INPUT',
        data: {
          ...clarificationRequired,
          items: results.filter(r => !r.error), // Solo mantenemos lo que sí es válido o necesita aclaración
          phase: 'CLARIFICATION',
        },
      };
    }

    // Filtrar items con error para que no queden en el carrito persistente
    const validItems = results.filter(r => !r.error);

    if (validItems.length === 0 && items.length > 0) {
       return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: {
          message:
            '¡Ay sumercé! No pude encontrar ninguno de esos productos en la cosecha de hoy. ¿Me confirma qué buscaba?',
        },
      };
    }

    // Si hay items parciales o en lista de espera, marcamos la fase para que la Voz lo sepa
    const hasIssues = validItems.some(i => i.isPartial || i.isWaitlist);

    return {
      from: 'fulfillment-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: {
        phase: 'LISTING',
        items: validItems,
        hasStockIssues: hasIssues,
        message:
          'Por favor confirme si el pedido es correcto para proceder con el cobro.',
      },
    };
  }

  private async processFinalBill(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Paso 3 del Reglamento: Dar precios y total (Liquidación)
    const items = request.data || [];
    const results: any[] = [];
    const config = await this.inventoryProvider.getConfig();
    
    // El costo de domicilio está en la hoja de Configuración (B2)
    // Parseo robusto del costo de domicilio: "$9.000,00" -> 9000
    const rawFee = config['COSTO_DOMICILIO'] || '0';
    const deliveryFee = parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 0;
    const deliveryDate = config['FECHA_ENTREGA'] || config['DIAS_ENTREGA'] || 'Jueves';

    for (const item of items) {
      const invResponse = await this.inventoryAgent.handleRequest({
        ...request,
        action: 'check_stock',
        data: {
          productName: item.product || item.productName,
          productId: item.productId, 
          requestedQuantity: item.quantity || item.unitsNeeded,
          unit: item.unit,
        },
      });

      if (invResponse.status !== 'ERROR') {
        this.logger.log(`💰 Item procesado para factura: ${invResponse.data.productName} - Precio: ${invResponse.data.pricePerUnit} - Total: ${invResponse.data.totalPrice}`);
        // Normalizar la salida del inventario para el carrito
        results.push({
          ...invResponse.data,
          product: invResponse.data.productName,
          quantity: invResponse.status === 'PARTIAL_STOCK' ? invResponse.data.availableQuantity : invResponse.data.unitsNeeded,
          originalRequestedQuantity: invResponse.data.unitsNeeded,
          isPartial: invResponse.status === 'PARTIAL_STOCK',
          isWaitlist: invResponse.status === 'WAITLIST'
        });
      } else {
        this.logger.warn(`❌ No se pudo obtener precio para item: ${item.product || item.productName}`);
        results.push({
          productName: item.product || item.productName,
          product: item.product || item.productName,
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
    const hasIssues = results.some(i => i.isPartial || i.isWaitlist);

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
        hasStockIssues: hasIssues,
        currency: 'COP',
        paymentMethods: [
          { name: 'Nequi', account: '312 456 7890' }, 
          { name: 'Bancolombia (Ahorros)', account: '123-456789-01' }
        ],
        message:
          'Pedido liquidado con precios reales y domicilio.',
      },
    };
  }
}
