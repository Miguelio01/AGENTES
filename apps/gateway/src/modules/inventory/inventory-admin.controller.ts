import { Controller, Get, Post, Patch, Body, Param, Render, Inject } from '@nestjs/common';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('admin/inventory')
export class InventoryAdminController {
  constructor(
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @Render('inventory')
  async getDashboard() {
    const products = await this.inventoryProvider.listProducts();
    
    // Obtener la cosecha activa
    const activeCycle = await this.prisma.salesCycle.findFirst({
      where: { status: 'OPEN' },
      include: {
        orders: {
          include: { items: true }
        }
      }
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Enriquecer productos con métricas de ventas discriminadas
    const enrichedProducts = products.map(p => {
      let cycleSales = 0;
      const todaySales = p.sales || 0; // Columna D de Excel (Sincronizada)

      if (activeCycle) {
        activeCycle.orders.forEach(order => {
          order.items.forEach(item => {
            if (item.productId === p.id) {
              cycleSales += item.quantity;
            }
          });
        });
      }

      return { ...p, cycleSales, todaySales };
    });

    return { 
      products: enrichedProducts,
      activeCycle: activeCycle ? { id: activeCycle.id, name: activeCycle.name } : null,
      title: 'Inventario y Ventas - Frescoh!'
    };
  }

  @Get('api/data')
  async getInventoryData() {
    return await this.inventoryProvider.listProducts();
  }

  @Post('api/product')
  async createProduct(@Body() data: any) {
    // Crear en SQLite
    const product = await this.prisma.inventoryItem.create({
      data: {
        id: data.id,
        name: data.name,
        price: parseFloat(data.price),
        stock: parseFloat(data.stock),
        weightGrams: data.weightGrams ? parseFloat(data.weightGrams) : null,
        packagingType: data.packagingType || 'Unidad',
        description: data.description || '',
      },
    });

    // Sincronización manual opcional o vía eventos (el adapter ya lo hace si usamos sus métodos)
    // Pero aquí estamos usando Prisma directamente para el CRUD admin
    return { status: 'SUCCESS', product };
  }

  @Patch('api/stock/:id')
  async updateStock(@Param('id') id: string, @Body() data: { quantityChange: number }) {
    await this.inventoryProvider.updateStock(id, data.quantityChange);
    return { status: 'SUCCESS' };
  }

  @Patch('api/stock-direct/:id')
  async setStockDirect(@Param('id') id: string, @Body() data: { stock: number }) {
    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: { stock: parseFloat(data.stock as any) }
    });

    // Notificar a Sheets del nuevo valor absoluto (usamos quantityChange 0 pero pasamos el objeto para forzar sync)
    this.eventEmitter.emit('sync.sheets.stock_updated', { productId: id, quantityChange: 0 });

    return { status: 'SUCCESS', stock: updated.stock };
  }

  @Patch('api/cost/:id')
  async updateCost(@Param('id') id: string, @Body() data: { cost: number }) {
    await this.prisma.inventoryItem.update({
      where: { id },
      data: { cost: parseFloat(data.cost as any) || 0 }
    });
    return { status: 'SUCCESS' };
  }
}
