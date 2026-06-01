import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Order, Client } from '@agentes/domain';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SheetsSyncListener implements OnModuleInit {
  private readonly logger = new Logger(SheetsSyncListener.name);

  constructor(
    @Inject('GOOGLE_SHEETS_ADAPTER_INTERNAL')
    private readonly sheetsAdapter: GoogleSheetsInventoryAdapter,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      '🚀 Inicializando sincronización de inventario SQLite <-> Sheets',
    );
    await this.seedDatabaseIfEmpty();
  }

  private async seedDatabaseIfEmpty() {
    const count = await this.prisma.inventoryItem.count();
    if (count === 0) {
      this.logger.log(
        '🌱 Base de datos SQLite vacía. Importando catálogo desde Google Sheets...',
      );
      try {
        const products = await this.sheetsAdapter.listProducts();
        for (const p of products) {
          await this.prisma.inventoryItem.upsert({
            where: { id: p.id },
            create: {
              id: p.id,
              name: p.name,
              stock: p.stock,
              price: p.price,
              weightGrams: p.weightGrams,
              unitsPerPackage: p.unitsPerPackage,
              packagingType: p.packagingType,
              description: p.description,
            },
            update: {
              stock: p.stock,
              price: p.price,
            },
          });
        }
        this.logger.log(
          `✅ Importados ${products.length} productos exitosamente.`,
        );
      } catch (e) {
        this.logger.error(`❌ Error durante el seeding inicial: ${e.message}`);
      }
    }
  }

  @OnEvent('sync.sheets.stock_updated')
  async handleStockUpdate(payload: {
    productId: string;
    quantityChange: number;
  }) {
    this.logger.log(
      `🔄 Sincronizando stock en Sheets para: ${payload.productId}`,
    );
    try {
      if (payload.quantityChange === 0) {
        // Es una edición directa en el Dashboard. Buscamos el valor absoluto en SQLite.
        const item = await this.prisma.inventoryItem.findUnique({
          where: { id: payload.productId },
        });
        if (item) {
          // @ts-ignore - Agregaremos este parámetro al adaptador
          await this.sheetsAdapter.updateStock(
            payload.productId,
            0,
            item.stock,
          );
        }
      } else {
        await this.sheetsAdapter.updateStock(
          payload.productId,
          payload.quantityChange,
        );
      }
    } catch (e) {
      this.logger.error(`❌ Error sincronizando stock: ${e.message}`);
    }
  }

  @OnEvent('sync.sheets.prepaid_order_created')
  async handlePrepaidOrder(payload: { order: Order; client: Client }) {
    this.logger.log(
      `🔄 Sincronizando orden prepago en Sheets: ${payload.order.id}`,
    );
    try {
      // Nota: registerPrepaidOrder en el adapter original ya descuenta stock preventivo en Sheets.
      // Como nuestro PrismaInventoryAdapter ya lo descontó en SQLite y emitió evento de stock_updated,
      // debemos tener cuidado de no duplicar descuentos en Sheets si el evento stock_updated también se dispara.
      // Sin embargo, en la lógica actual de GoogleSheetsInventoryAdapter, registerPrepaidOrder LLAMA internamente a updateStock.

      await this.sheetsAdapter.registerPrepaidOrder(
        payload.order,
        payload.client,
      );
    } catch (e) {
      this.logger.error(`❌ Error sincronizando orden prepago: ${e.message}`);
    }
  }

  @OnEvent('sync.sheets.delivery_order_created')
  async handleDeliveryOrder(payload: { order: Order; client: Client }) {
    this.logger.log(
      `🔄 Sincronizando orden de entrega en Sheets: ${payload.order.id}`,
    );
    try {
      await this.sheetsAdapter.registerDeliveryOrder(
        payload.order,
        payload.client,
      );
    } catch (e) {
      this.logger.error(
        `❌ Error sincronizando orden de entrega: ${e.message}`,
      );
    }
  }

  @OnEvent('sync.sheets.cost_control_created')
  async handleCostControl(payload: { order: Order; client: Client }) {
    this.logger.log(
      `🔄 Sincronizando control de costos en Sheets: ${payload.order.id}`,
    );
    try {
      await this.sheetsAdapter.registerCostControlOrder(
        payload.order,
        payload.client,
      );
    } catch (e) {
      this.logger.error(
        `❌ Error sincronizando control de costos: ${e.message}`,
      );
    }
  }

  @OnEvent('sync.sheets.waitlist_order_created')
  async handleWaitlistOrder(payload: { order: Order; client: Client }) {
    try {
      await this.sheetsAdapter.registerWaitlistOrder(
        payload.order,
        payload.client,
      );
    } catch (e) {
      this.logger.error(`❌ Error sincronizando lista de espera: ${e.message}`);
    }
  }

  @OnEvent('sync.sheets.prepaid_removed')
  async handleRemovePrepaid(payload: { orderId: string }) {
    try {
      await this.sheetsAdapter.removeFromPrepaidList(payload.orderId);
    } catch (e) {
      this.logger.error(
        `❌ Error eliminando de prepago en Sheets: ${e.message}`,
      );
    }
  }
}
