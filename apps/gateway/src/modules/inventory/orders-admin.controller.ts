import { Controller, Get, Patch, Body, Param, Render, Inject, Res, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';

@Controller('admin/orders')
export class OrdersAdminController {
  private readonly logger = new Logger(OrdersAdminController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  @Get()
  @Render('orders')
  async getOrdersDashboard() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        items: true,
      },
    });

    const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' }
    });

    return { 
      orders,
      activeCycle,
      title: 'Registro de Pedidos - Frescoh!'
    };
  }

  @Get('export-xlsx')
  async exportToExcel(@Res() res: Response) {
    const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' }
    });

    const orders = await this.prisma.order.findMany({
      where: activeCycle ? { salesCycleId: activeCycle.id } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        items: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pedidos Cosecha');

    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'ID Pedido', key: 'id', width: 15 },
      { header: 'Cliente', key: 'cliente', width: 25 },
      { header: 'WhatsApp', key: 'telefono', width: 15 },
      { header: 'Dirección', key: 'direccion', width: 40 },
      { header: 'Productos', key: 'productos', width: 50 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Domicilio', key: 'domicilio', width: 15 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];

    orders.forEach(order => {
      const subtotal = order.total - (order.deliveryFee || 0);
      const productos = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
      
      worksheet.addRow({
        fecha: order.createdAt.toLocaleString('es-CO'),
        id: order.id,
        cliente: order.client.fullName || order.client.name,
        telefono: order.client.phone,
        direccion: order.client.address || 'N/A',
        productos,
        subtotal,
        domicilio: order.deliveryFee || 0,
        total: order.total,
        estado: order.status.toUpperCase(),
      });
    });

    // Estilo de cabecera
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005035' } // Frescoh Dark
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Pedidos_Frescoh_${activeCycle?.name || 'Historico'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  @Patch('api/:id/delivery-fee')
  async updateDeliveryFee(@Param('id') id: string, @Body() data: { deliveryFee: number }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      return { status: 'ERROR', message: 'Orden no encontrada' };
    }

    const subtotal = order.total - order.deliveryFee;
    const newTotal = subtotal + data.deliveryFee;

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        deliveryFee: data.deliveryFee,
        total: newTotal,
      },
    });

    return { status: 'SUCCESS', newTotal: updated.total };
  }

  @Patch('api/:id/status')
  async updateOrderStatus(@Param('id') id: string, @Body() data: { status: string }) {
    const order = await this.prisma.order.findUnique({ 
      where: { id },
      include: { items: true, client: true }
    });

    if (!order) {
      return { status: 'ERROR', message: 'Orden no encontrada' };
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: data.status },
      include: { items: true, client: true }
    });

    // --- LÓGICA DE CANCELACIÓN Y REVERSIÓN ---
    if (data.status === 'cancelled') {
      this.logger.log(`🔴 Iniciando reversión de stock para orden cancelada: ${id}`);
      
      for (const item of updatedOrder.items) {
        try {
          // Devolver stock (+quantity) y restar ventas (-quantity)
          // Usamos el provider para que también maneje la cascada de los Kits
          await this.inventoryProvider.updateStock(item.productId, item.quantity);
          
          // Nota: El updateStock del provider suma a ventas si el valor es negativo.
          // Como aquí queremos RESTAR ventas, haremos un ajuste manual en el modelo para este caso de cancelación.
          await this.prisma.inventoryItem.update({
            where: { id: item.productId },
            data: { 
              sales: { decrement: item.quantity }
            }
          });
        } catch (e) {
          this.logger.error(`Error revirtiendo item ${item.productId}: ${e.message}`);
        }
      }

      // Eliminar la orden de la base de datos tras la reversión
      await this.prisma.orderItem.deleteMany({ where: { orderId: id } });
      await this.prisma.order.delete({ where: { id } });
      
      this.logger.log(`✅ Orden ${id} eliminada y stock devuelto.`);
      return { status: 'SUCCESS', message: 'Orden cancelada, stock revertido y registro eliminado' };
    }

    // Mapear el objeto de la base de datos al objeto esperado por el dominio/eventos
    const domainOrder: any = {
      ...updatedOrder,
      items: updatedOrder.items.map(i => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        unitCost: i.unitCost
      }))
    };

    // Disparar sincronización con Sheets según el nuevo estado
    if (data.status === 'confirmed') {
      // Si se confirma, va a la lista de entrega
      this.prisma.salesCycle.findFirst({ where: { status: 'OPEN' } }).then(cycle => {
        // @ts-ignore
        this.eventEmitter.emit('sync.sheets.delivery_order_created', { order: domainOrder, client: updatedOrder.client });
      });
    } else if (data.status === 'delivered') {
      // Si se entrega, se registra en control de costos
      // @ts-ignore
      this.eventEmitter.emit('sync.sheets.cost_control_created', { order: domainOrder, client: updatedOrder.client });
    }

    return { status: 'SUCCESS', newStatus: updatedOrder.status };
  }
}
