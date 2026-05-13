import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  INVENTORY_PROVIDER_PORT,
  CLIENT_REPOSITORY_PORT,
  AgentRequest,
  AgentResponse,
  InventoryCheckData,
  InventoryCheckResult,
  Order,
} from '@agentes/domain';
import type { IInventoryProvider, IClientRepository } from '@agentes/domain';
import { KnowledgeAgentService } from './knowledge-agent.service';

@Injectable()
export class InventoryAgentService {
  private readonly logger = new Logger(InventoryAgentService.name);

  constructor(
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    private readonly knowledgeAgent: KnowledgeAgentService,
  ) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`🤖 Inventory Agent recibiendo acción: ${request.action}`);

    switch (request.action) {
      case 'check_stock':
        return this.handleCheckStock(request);
      case 'get_available_list':
        return this.handleGetAvailableList(request);
      case 'reserve_stock':
        return this.handleReserveStock(request);
      case 'register_waitlist':
        return this.handleRegisterWaitlist(request);
      case 'register_delivery':
        return this.handleRegisterDelivery(request);
      default:
        return {
          from: 'inventory-agent',
          to: request.from,
          status: 'ERROR',
          data: { message: `Acción desconocida: ${request.action}` },
        };
    }
  }

  private async handleRegisterDelivery(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const client = await this.clientRepository.findById(
      request.context.clientId,
    );
    if (!client)
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: 'Cliente no encontrado' },
      };

    const { items, total } = request.data;
    const order = Order.create({
      clientId: client.id,
      agentId: 'inventory-agent',
      total: total || 0,
      items: items.map((i: any) => ({
        productId: i.productId || i.product,
        name: i.productName || i.product,
        quantity: i.unitsNeeded || i.quantity || 1,
        price: i.pricePerUnit || 0,
      })),
    });

    await this.inventoryProvider.registerDeliveryOrder(order, client);

    return {
      from: 'inventory-agent',
      to: request.from,
      status: 'SUCCESS',
      data: { message: 'Pedido registrado en la lista de entregas semanal' },
    };
  }

  private async handleGetAvailableList(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    try {
      const products = await this.inventoryProvider.listProducts();
      const available = products
        .filter((p) => p.stock > 0)
        .map((p) => ({
          name: p.name,
          price: p.price,
          weight: p.weightGrams ? `${p.weightGrams}g` : undefined,
          units: p.unitsPerPackage,
          packaging: p.packagingType,
        }));
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'SUCCESS',
        data: { availableProducts: available },
      };
    } catch (e) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: e.message },
      };
    }
  }

  private async handleRegisterWaitlist(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const client = await this.clientRepository.findById(
      request.context.clientId,
    );
    if (!client)
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: 'Cliente no encontrado' },
      };

    const items = request.data.items || [];
    const order = Order.create({
      clientId: client.id,
      agentId: 'inventory-agent',
      items: items.map((i: any) => ({
        productId: i.product,
        name: i.productName || i.product,
        quantity: i.quantity,
        price: i.pricePerUnit || 0,
      })),
    });

    await this.inventoryProvider.registerWaitlistOrder(order, client);

    return {
      from: 'inventory-agent',
      to: request.from,
      status: 'SUCCESS',
      data: { message: 'Registrado en lista de espera de la cosecha' },
    };
  }

  private async handleCheckStock(
    request: AgentRequest<InventoryCheckData & { unit?: string }>,
  ): Promise<AgentResponse<InventoryCheckResult>> {
    const { productName, requestedQuantity, unit } = request.data || {};

    if (!productName) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: 'Nombre del producto no proporcionado' } as any,
      };
    }

    this.logger.log(
      `🔍 Buscando stock para: ${requestedQuantity} ${unit || ''} de ${productName}`,
    );

    const allProducts = await this.inventoryProvider.listProducts();
    const cleanProductName = productName
      .replace(/un |uno |dos |kilo|libra| de |las |los |quiero |venden /gi, '')
      .trim()
      .toLowerCase();
    const searchTerms = cleanProductName.split(' ').filter((t) => t.length > 2);

    const candidates = allProducts.filter((p) => {
      const productNameLower = p.name.toLowerCase();
      return (
        searchTerms.some((term) => productNameLower.includes(term)) ||
        productNameLower.includes(cleanProductName)
      );
    });

    // REGLA ESPECIAL HUEVOS: Si dice "huevos" sin tamaño, obligar a preguntar
    const isEggQuery = cleanProductName.includes('huevo');
    const hasSize = cleanProductName.includes('jumbo') || cleanProductName.includes('grande');
    
    if (isEggQuery && !hasSize) {
      const eggOptions = allProducts.filter(p => p.name.toLowerCase().includes('huevo')).map(p => p.name);
      if (eggOptions.length > 1) {
        return {
          from: 'inventory-agent',
          to: request.from,
          status: 'REQUIRES_USER_INPUT',
          data: {
            message: `Sumercé, tengo huevos Jumbo y Grandes. ¿De cuáles prefiere llevar?`,
            options: eggOptions,
            ambiguousProduct: 'huevos'
          } as any,
        };
      }
    }

    if (candidates.length === 0) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: {
          message: `No encontré "${productName}" en la cosecha, sumercé.`,
        } as any,
      };
    }

    // Si hay varios candidatos y no hay un match exacto, pedir aclaración
    const exactMatch = candidates.find(
      (p) => p.name.toLowerCase() === cleanProductName,
    );

    if (!exactMatch && candidates.length > 1) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'REQUIRES_USER_INPUT',
        data: {
          message: `Sumercé, tengo varias presentaciones para "${productName}". ¿Cuál de estas buscaba?`,
          options: candidates.map((c) => c.name),
        } as any,
      };
    }

    const product = exactMatch || candidates[0];
    const qty = requestedQuantity || 1;

    // Lógica de cálculo basada en la presentación real del producto
    const unitsNeeded = qty;
    let presentation = product.packagingType || 'unidad';

    if (product.weightGrams) {
      presentation = `${product.packagingType} x ${product.weightGrams}g`;
    } else if (product.unitsPerPackage) {
      presentation = `${product.packagingType} x ${product.unitsPerPackage} uds`;
    }

    const available = product.stock >= unitsNeeded;

    return {
      from: 'inventory-agent',
      to: request.from,
      status: available ? 'SUCCESS' : 'WAITLIST',
      data: {
        available,
        productName: product.name,
        unitsNeeded,
        presentation,
        currentStock: product.stock,
        pricePerUnit: product.price,
        totalPrice: product.price * unitsNeeded,
        currency: 'COP',
      },
    };
  }

  private async handleReserveStock(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    this.logger.log(
      `Reserva de stock solicitada para ${request.context.clientId}`,
    );
    return {
      from: 'inventory-agent',
      to: request.from,
      status: 'SUCCESS',
      data: { message: 'Stock reservado temporalmente' },
    };
  }
}
