import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  IInventoryProvider,
  ProductInventory,
  Order,
  Client,
} from '@agentes/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';

/**
 * Adaptador de Inventario para SQLite (via Prisma).
 * Es la FUENTE DE VERDAD para stock, ventas y ciclos.
 * Google Sheets actúa como un espejo alimentado por eventos desde aquí.
 */
@Injectable()
export class PrismaInventoryAdapter implements IInventoryProvider {
  private readonly logger = new Logger(PrismaInventoryAdapter.name);

  // Diccionario de Recetas/Combos (Define qué descuenta un kit)
  private readonly KIT_COMPONENTS: Record<string, string[]> = {
    'KIT-FRU-01': ['FRU-FRES-500', 'FRU-FRA-125', 'FRU-ARA-500', 'FRU-UCH-500'],
    'KIT-FRU-02': ['FRU-FRES-500', 'FRU-FRA-125', 'FRU-ARA-500', 'FRU-MOR-500'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('GOOGLE_SHEETS_ADAPTER_INTERNAL')
    private readonly sheetsAdapter: GoogleSheetsInventoryAdapter,
  ) {}

  async getProduct(productId: string): Promise<ProductInventory | null> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: productId },
    });
    if (!item) return null;
    return this.mapToDomain(item);
  }

  async listProducts(): Promise<ProductInventory[]> {
    const items = await this.prisma.inventoryItem.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    return items.map(this.mapToDomain);
  }

  /**
   * Actualiza el stock de un producto y sus componentes (si es un Kit).
   * Incrementa las ventas automáticamente si el cambio es negativo (consumo).
   */
  async updateStock(
    productId: string,
    quantityChange: number,
    absoluteStock?: number,
  ): Promise<void> {
    const incrementSales = quantityChange < 0 ? Math.abs(quantityChange) : 0;

    await this.prisma.inventoryItem.update({
      where: { id: productId },
      data: {
        stock:
          absoluteStock !== undefined
            ? absoluteStock
            : { increment: quantityChange },
        sales: { increment: incrementSales },
      },
    });

    // Emitir evento para sincronizar con Google Sheets en segundo plano (Espejo)
    this.eventEmitter.emit('sync.sheets.stock_updated', {
      productId,
      quantityChange,
    });

    // Lógica de Bundles/Kits
    if (quantityChange < 0 && this.KIT_COMPONENTS[productId]) {
      const components = this.KIT_COMPONENTS[productId];
      this.logger.log(
        `📦 BUNDLE: Descontando cascada para ${productId} (${components.length} items)`,
      );

      for (const componentId of components) {
        try {
          const componentExists = await this.prisma.inventoryItem.findUnique({
            where: { id: componentId },
          });

          if (componentExists) {
            await this.prisma.inventoryItem.update({
              where: { id: componentId },
              data: {
                stock: { increment: quantityChange },
                sales: { increment: Math.abs(quantityChange) },
              },
            });
            this.eventEmitter.emit('sync.sheets.stock_updated', {
              productId: componentId,
              quantityChange,
            });
          }
        } catch (e) {
          this.logger.error(`❌ Error en cascada de Kit: ${e.message}`);
        }
      }
    }
  }

  async registerOrder(order: Order): Promise<void> {
    await this.saveOrderToDb(order);
    this.eventEmitter.emit('sync.sheets.order_created', { order });
  }

  async registerPrepaidOrder(order: Order, client: Client): Promise<void> {
    // 1. Asegurar que el cliente existe en SQLite
    await this.upsertClient(client);

    // 2. Guardar orden con estado pending
    await this.saveOrderToDb(order);

    // 3. Descontar stock (preventivo)
    for (const item of order.items) {
      await this.updateStock(item.productId, -item.quantity);
    }

    // 4. Sincronizar con Sheets
    this.eventEmitter.emit('sync.sheets.prepaid_order_created', {
      order,
      client,
    });
  }

  async registerDeliveryOrder(order: Order, client: Client): Promise<void> {
    await this.upsertClient(client);

    const activeCycleId = await this.getActiveSalesCycleId();

    const productIds = order.items.map((i) => i.productId);
    const catalog = await this.prisma.inventoryItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, cost: true },
    });
    const costMap = new Map(catalog.map((c) => [c.id, c.cost]));

    await this.prisma.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        clientId: client.id,
        agentId: order.agentId,
        total: order.total,
        deliveryFee: order.deliveryFee,
        status: 'confirmed',
        salesCycleId: activeCycleId,
        items: {
          create: order.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            unitCost: costMap.get(i.productId) || 0,
          })),
        },
      },
      update: {
        status: 'confirmed',
      },
    });

    this.eventEmitter.emit('sync.sheets.delivery_order_created', {
      order,
      client,
    });
  }

  async registerCostControlOrder(order: Order, client: Client): Promise<void> {
    // En SQLite ya está en la tabla Order, pero emitimos evento para la pestaña de costos de Excel
    this.eventEmitter.emit('sync.sheets.cost_control_created', {
      order,
      client,
    });
  }

  async registerWaitlistOrder(order: Order, client: Client): Promise<void> {
    await this.upsertClient(client);
    this.eventEmitter.emit('sync.sheets.waitlist_order_created', {
      order,
      client,
    });
  }

  async addToWaitlist(clientId: string, productId: string): Promise<void> {
    this.eventEmitter.emit('sync.sheets.waitlist_added', {
      clientId,
      productId,
    });
  }

  async getConfig(): Promise<Record<string, string>> {
    // Delegar a Sheets para mantener la flexibilidad del usuario
    return this.sheetsAdapter.getConfig();
  }

  async removeFromPrepaidList(orderId: string): Promise<void> {
    this.eventEmitter.emit('sync.sheets.prepaid_removed', { orderId });
  }

  async getPrepaidOrderDetails(orderId: string): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    return order;
  }

  async getDeliveryOrderDetails(orderId: string): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    return order;
  }

  private mapToDomain(item: any): ProductInventory {
    return {
      id: item.id,
      name: item.name,
      stock: item.stock,
      price: item.price,
      sales: item.sales || 0,
      displayOrder: item.displayOrder || 0,
      weightGrams: item.weightGrams || undefined,
      unitsPerPackage: item.unitsPerPackage || undefined,
      packagingType: item.packagingType || undefined,
      description: item.description || undefined,
    };
  }

  private async upsertClient(client: Client) {
    await this.prisma.client.upsert({
      where: { id: client.id },
      create: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        lid: client.lid,
        fullName: client.fullName,
        documentType: client.documentType,
        documentNumber: client.documentNumber,
        email: client.email,
        address: client.address,
        city: client.city,
        registrationSource: client.registrationSource,
        metadata: client.metadata ? JSON.stringify(client.metadata) : null,
      },
      update: {
        name: client.name,
        fullName: client.fullName,
        address: client.address,
        metadata: client.metadata ? JSON.stringify(client.metadata) : null,
      },
    });
  }

  private async getActiveSalesCycleId(): Promise<string | null> {
    const cycle = await this.prisma.salesCycle.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startDate: 'desc' },
    });
    return cycle ? cycle.id : null;
  }

  private async saveOrderToDb(order: Order) {
    const activeCycleId = await this.getActiveSalesCycleId();

    // Buscar los costos actuales de los productos para congelarlos en el momento de la venta
    const productIds = order.items.map((i) => i.productId);
    const catalog = await this.prisma.inventoryItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, cost: true },
    });
    const costMap = new Map(catalog.map((c) => [c.id, c.cost]));

    await this.prisma.order.create({
      data: {
        id: order.id,
        clientId: order.clientId,
        agentId: order.agentId,
        total: order.total,
        deliveryFee: order.deliveryFee,
        status: order.status,
        salesCycleId: activeCycleId,
        items: {
          create: order.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            unitCost: costMap.get(i.productId) || 0,
          })),
        },
      },
    });
  }
}
