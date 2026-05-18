import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  INVENTORY_PROVIDER_PORT,
  CLIENT_REPOSITORY_PORT,
  AgentRequest,
  AgentResponse,
  InventoryCheckData,
  InventoryCheckResult,
  ProductInventory,
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
      case 'get_config':
        return this.handleGetConfig(request);
      default:
        return {
          from: 'inventory-agent',
          to: request.from,
          status: 'ERROR',
          data: { message: `Acción desconocida: ${request.action}` },
        };
    }
  }

  private async handleGetConfig(request: AgentRequest): Promise<AgentResponse> {
    try {
      const config = await this.inventoryProvider.getConfig();
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'SUCCESS',
        data: config,
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
      
      const productAliases: Record<string, string> = {
        'PROD-TIL-01': 'TIL',
        'PROD-HUE-JB': 'HJUM',
        'PROD-HUE-GR': 'HGR',
        'FRU-FRE-500': 'FRE',
        'FRU-MOR-500': 'MOR',
        'FRU-FRA-125': 'FRA',
        'FRU-UCH-500': 'UCH',
        'VER-TOS-500': 'TCH',
        'FRU-ARA-500': 'ARAP',
        'FRU-ARA-501': 'ARAM',
        'FRU-ARA-502': 'ARAG',
        'KIT-FRU-01': 'KIT',
        'ABA-ARE-05': 'ARE'
      };

      const available = products
        .map((p, idx) => {
          // Usar el Alias descriptivo si existe, sino el ID original
          const code = productAliases[p.id] || p.id || `${p.name.substring(0, 1).toUpperCase()}${idx + 1}`;
          
          let presentation = p.packagingType || 'unidad';
          if (p.weightGrams) {
            presentation += ` x ${p.weightGrams}g`;
          } else if (p.unitsPerPackage) {
            presentation += ` x ${p.unitsPerPackage} uds`;
          }

          return {
            code,
            name: p.name,
            price: p.price,
            presentation,
            description: p.description,
            stock: p.stock,
            isOutOfStock: p.stock <= 0
          };
        });
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
    request: AgentRequest<InventoryCheckData & { unit?: string; productId?: string }>,
  ): Promise<AgentResponse<InventoryCheckResult>> {
    const { productName, requestedQuantity, unit, productId } = request.data || {};

    if (!productName && !productId) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: 'Nombre o ID del producto no proporcionado' } as any,
      };
    }

    this.logger.log(
      `🔍 Buscando stock para: ${requestedQuantity} ${unit || ''} de ${productName || productId}`,
    );

    const allProducts = await this.inventoryProvider.listProducts();
    
    // 0. PRIORIDAD MÁXIMA: Match por ID exacto (Catálogo / SKU)
    if (productId) {
      const idMatch = allProducts.find(p => p.id === productId || p.id === productId.toUpperCase());
      if (idMatch) {
        this.logger.log(`🎯 Match exacto por ID encontrado: ${idMatch.name}`);
        return this.processProductMatch(idMatch, requestedQuantity, request.from as any);
      }
    }

    // Mapa de Alias descriptivos para el cliente
    const productAliases: Record<string, string> = {
      'PROD-TIL-01': 'TIL',
      'PROD-HUE-JB': 'HJUM',
      'PROD-HUE-GR': 'HGR',
      'FRU-FRE-500': 'FRE',
      'FRU-MOR-500': 'MOR',
      'FRU-FRA-125': 'FRA',
      'FRU-UCH-500': 'UCH',
      'VER-TOS-500': 'TCH', // Tomate Cherry
      'FRU-ARA-500': 'ARAP',
      'FRU-ARA-501': 'ARAM',
      'FRU-ARA-502': 'ARAG',
      'KIT-FRU-01': 'KIT',
      'ABA-ARE-05': 'ARE'
    };

    // Normalización avanzada: remover puntuación, artículos y términos de acción comunes
    const normalize = (text: string) => text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
      .replace(/un |uno |una |dos |kilo|libra| de |las |los |la |el |quiero |venden |necesito |busco /gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const cleanSearch = normalize(productName || '').toUpperCase();
    
    // 0. INTENTO: Match por Alias Amigable (Prioridad absoluta para el cliente)
    const aliasMatchId = Object.keys(productAliases).find(id => productAliases[id] === cleanSearch);
    if (aliasMatchId) {
      const product = allProducts.find(p => p.id === aliasMatchId);
      if (product) {
        return this.processProductMatch(product, requestedQuantity, request.from as any);
      }
    }

    // 1. INTENTO: Match Exacto (ID o Nombre)
    const exactMatch = allProducts.find(p => p.id === cleanSearch || normalize(p.name).toUpperCase() === cleanSearch);
    
    if (exactMatch) {
      return this.processProductMatch(exactMatch, requestedQuantity, request.from as any);
    }

    // 2. INTENTO: Empieza por (Prefix Match)
    const prefixMatches = allProducts.filter(p => normalize(p.name).startsWith(cleanSearch));
    if (prefixMatches.length === 1) {
      return this.processProductMatch(prefixMatches[0], requestedQuantity, request.from as any);
    }

    // 3. INTENTO: Contiene (Substring Match)
    const substringMatches = allProducts.filter(p => normalize(p.name).includes(cleanSearch));
    
    // Regla especial para huevos si es ambiguo
    const isEggQuery = cleanSearch.includes('huevo');
    if (isEggQuery) {
      const hasSize = cleanSearch.includes('jumbo') || cleanSearch.includes('grande');
      if (!hasSize) {
        const eggOptions = allProducts.filter(p => normalize(p.name).includes('huevo'));
        if (eggOptions.length > 0) {
          return {
            from: 'inventory-agent',
            to: request.from,
            status: 'REQUIRES_USER_INPUT',
            data: {
              message: `Sumercé, tengo huevos Jumbo y Grandes. ¿De cuáles prefiere llevar?`,
              options: eggOptions.map(p => p.name),
              ambiguousProduct: 'huevos'
            } as any,
          };
        }
      }
    }

    // Si hay múltiples matches por substring, pedir aclaración
    if (substringMatches.length > 1) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'REQUIRES_USER_INPUT',
        data: {
          message: `Sumercé, encontré varias opciones para "${productName}". ¿Cuál buscaba?`,
          options: substringMatches.map(c => c.name),
        } as any,
      };
    }

    if (substringMatches.length === 1) {
      return this.processProductMatch(substringMatches[0], requestedQuantity, request.from as any);
    }

    // 4. INTENTO: Fallback de términos (Legacy logic mejorada)
    const searchTerms = cleanSearch.split(' ').filter((t) => t.length > 2);
    const fuzzyCandidates = allProducts.filter((p) => {
      const pName = normalize(p.name);
      return searchTerms.some((term) => pName.includes(term));
    });

    if (fuzzyCandidates.length === 0) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'ERROR',
        data: {
          message: `No encontré "${productName}" en la cosecha, sumercé.`,
        } as any,
      };
    }

    if (fuzzyCandidates.length > 1) {
      return {
        from: 'inventory-agent',
        to: request.from,
        status: 'REQUIRES_USER_INPUT',
        data: {
          message: `Sumercé, tengo varias cosas parecidas a "${productName}". ¿Será alguna de estas?`,
          options: fuzzyCandidates.map((c) => c.name),
        } as any,
      };
    }

    return this.processProductMatch(fuzzyCandidates[0], requestedQuantity, request.from as any);
  }

  private processProductMatch(product: ProductInventory, requestedQuantity: number | undefined, from: any): AgentResponse<InventoryCheckResult> {
    const qty = requestedQuantity || 1;
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
      to: from,
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
