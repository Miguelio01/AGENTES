import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Render,
  Inject,
  Res,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { INVENTORY_PROVIDER_PORT, Order, Client } from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { ClientsService } from '../clients/clients.service';
import { OrdersService } from '../orders/orders.service';
import { LOGO_BASE64 } from '../metrics/logo-base64';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersAdminController {
  private readonly logger = new Logger(OrdersAdminController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clientsService: ClientsService,
    private readonly ordersService: OrdersService,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  @Get()
  @Render('orders')
  @Roles('ADMIN')
  async getOrdersDashboard() {
    try {
      const rawOrders = await this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          client: true,
          items: true,
        },
      });

      // Limpiar objetos para evitar errores de serialización en EJS (Circular refs en relations)
      const orders = rawOrders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        total: o.total,
        deliveryFee: o.deliveryFee,
        status: o.status,
        salesCycleId: o.salesCycleId,
        client: {
          name: o.client.name,
          fullName: o.client.fullName,
          phone: o.client.phone,
          address: o.client.address,
        },
        items: o.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      }));

      const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' },
      });

      const cycles = await this.prisma.salesCycle.findMany({
        orderBy: { startDate: 'desc' },
      });

      return {
        orders,
        activeCycle,
        cycles,
        title: 'Registro de Pedidos - Frescoh!',
        logo: LOGO_BASE64,
      };
    } catch (e) {
      this.logger.error(`❌ Error en Dashboard de Órdenes: ${e.message}`);
      throw e;
    }
  }

  @Get('new')
  @Render('create-order')
  @Roles('ADMIN', 'USER')
  async getCreateOrderPage() {
    try {
      const rawProducts = await this.inventoryProvider.listProducts();
      const rawClients = await this.prisma.client.findMany({
        orderBy: { name: 'asc' },
      });

      const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' },
      });

      // Limpiar objetos para evitar errores de serialización en EJS
      const products = rawProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
      }));

      const clients = rawClients.map((c) => ({
        id: c.id,
        name: c.name,
        fullName: c.fullName,
        phone: c.phone,
        address: c.address,
        documentType: c.documentType,
        documentNumber: c.documentNumber,
        email: c.email,
      }));

      return {
        products,
        clients,
        deliveryFee: activeCycle?.deliveryFee || 10000,
        title: 'Nuevo Pedido Manual - Frescoh!',
        logo: LOGO_BASE64,
      };
    } catch (e) {
      this.logger.error(
        `❌ Error cargando página de nuevo pedido: ${e.message}`,
      );
      throw e;
    }
  }

  @Post('api/create')
  @Roles('ADMIN', 'USER')
  async createManualOrder(@Body() data: any) {
    try {
      this.logger.log(`📝 Creando pedido manual para: ${data.clientName}`);

      if (!data.clientPhone || !data.items || data.items.length === 0) {
        return {
          status: 'ERROR',
          message: 'Datos incompletos (teléfono o items vacíos)',
        };
      }

      // 1. Obtener o crear el cliente en MongoDB (Fuente de verdad para Clientes)
      let client = await this.clientsService.findByPhone(data.clientPhone);

      const clientData = {
        fullName: data.clientName,
        address: data.clientAddress || 'N/A',
        documentType: data.clientDocType || undefined,
        documentNumber: data.clientDocNumber || undefined,
        email: data.clientEmail || undefined,
      };

      if (!client) {
        client = new Client({
          id: data.clientPhone,
          name: data.clientName,
          phone: data.clientPhone,
          fullName: clientData.fullName,
          address: clientData.address,
          documentType: clientData.documentType,
          documentNumber: clientData.documentNumber,
          email: clientData.email,
          registrationSource: 'manual',
          createdAt: new Date(),
        });
        await this.clientsService.save(client);
        this.logger.log(
          `👤 Nuevo cliente registrado en Mongo: ${data.clientName}`,
        );
      } else {
        // Actualizar si hay cambios o datos nuevos
        const updates: any = {};
        if (data.clientAddress && data.clientAddress !== client.address)
          updates.address = data.clientAddress;
        if (data.clientName && data.clientName !== client.fullName)
          updates.fullName = data.clientName;
        if (data.clientDocType && data.clientDocType !== client.documentType)
          updates.documentType = data.clientDocType;
        if (
          data.clientDocNumber &&
          data.clientDocNumber !== client.documentNumber
        )
          updates.documentNumber = data.clientDocNumber;
        if (data.clientEmail && data.clientEmail !== client.email)
          updates.email = data.clientEmail;

        if (Object.keys(updates).length > 0) {
          client.updateProfile(updates);
          await this.clientsService.save(client);
          this.logger.log(
            `👤 Perfil de cliente actualizado: ${data.clientName}`,
          );
        }
      }

      // 2. Generar el ID usando el secuenciador global (ORD-XXXXXX)
      const orderId = await this.ordersService.getNextOrderId();

      // 3. Crear la Orden de Dominio
      const order = Order.create({
        id: orderId,
        clientId: client.id,
        agentId: 'manual-admin',
        deliveryFee: parseFloat(data.deliveryFee) || 0,
        items: data.items.map((i: any) => ({
          productId: i.id,
          name: i.name,
          quantity: parseFloat(i.quantity),
          price: parseFloat(i.price),
        })),
      });

      // 4. Registrar en infraestructura (SQLite + Sheets + Stock)
      // registerPrepaidOrder pone el estado 'pending' y dispara 'sync.sheets.prepaid_order_created'
      await this.inventoryProvider.registerPrepaidOrder(order, client);

      this.logger.log(
        `✅ Pedido manual ${orderId} creado con éxito y enviado a Lista_Prepagado`,
      );
      return { status: 'SUCCESS', orderId: order.id };
    } catch (e) {
      this.logger.error(`❌ Error creando pedido manual: ${e.stack}`);
      return { status: 'ERROR', message: e.message };
    }
  }

  @Get('export-xlsx')
  @Roles('ADMIN')
  async exportToExcel(
    @Res() res: Response,
    @Query('cycleId') cycleId?: string,
  ) {
    const whereClause: any = {};
    let cycleName = 'Historico';

    if (cycleId && cycleId !== 'all') {
      whereClause.salesCycleId = cycleId;
      const cycle = await this.prisma.salesCycle.findUnique({
        where: { id: cycleId },
      });
      if (cycle) cycleName = cycle.name;
    } else {
      const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' },
      });
      if (!cycleId && activeCycle) {
        whereClause.salesCycleId = activeCycle.id;
        cycleName = activeCycle.name;
      }
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        items: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pedidos');

    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'ID Pedido', key: 'id', width: 15 },
      { header: 'Cliente', key: 'cliente', width: 25 },
      { header: 'WhatsApp', key: 'telefono', width: 15 },
      { header: 'Dirección', key: 'direccion', width: 40 },
      { header: 'Productos', key: 'productos', width: 50 },
      {
        header: 'Subtotal',
        key: 'subtotal',
        width: 15,
        style: { numFmt: '"$"#,##0' },
      },
      {
        header: 'Domicilio',
        key: 'domicilio',
        width: 15,
        style: { numFmt: '"$"#,##0' },
      },
      {
        header: 'Total',
        key: 'total',
        width: 15,
        style: { numFmt: '"$"#,##0' },
      },
      { header: 'Estado', key: 'estado', width: 12 },
    ];

    orders.forEach((order) => {
      const subtotal = order.total - (order.deliveryFee || 0);
      const productos = order.items
        .map((i) => `• ${i.quantity}x ${i.name}`)
        .join('\n');

      const row = worksheet.addRow({
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

      row.getCell('productos').alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true,
      };
      row.getCell('subtotal').alignment = {
        vertical: 'middle',
        horizontal: 'right',
      };
      row.getCell('domicilio').alignment = {
        vertical: 'middle',
        horizontal: 'right',
      };
      row.getCell('total').alignment = {
        vertical: 'middle',
        horizontal: 'right',
      };
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005035' },
    };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Pedidos_Frescoh_${cycleName}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  @Get('export-products-xlsx')
  @Roles('ADMIN')
  async exportProductsSummary(
    @Res() res: Response,
    @Query('cycleId') cycleId?: string,
  ) {
    const whereClause: any = {};
    let cycleName = 'Historico';

    if (cycleId && cycleId !== 'all') {
      whereClause.salesCycleId = cycleId;
      const cycle = await this.prisma.salesCycle.findUnique({
        where: { id: cycleId },
      });
      if (cycle) cycleName = cycle.name;
    } else {
      const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' },
      });
      if (!cycleId && activeCycle) {
        whereClause.salesCycleId = activeCycle.id;
        cycleName = activeCycle.name;
      }
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: { items: true },
    });

    const allProducts = await this.inventoryProvider.listProducts();
    // Mapa extendido para incluir nombres y costos (Columna G)
    const productInfoMap = new Map(
      allProducts.map((p) => [p.id, { name: p.name, cost: p.cost || 0 }]),
    );

    // Definición de Kits para desglose (Espejo de PrismaInventoryAdapter)
    const KIT_COMPONENTS: Record<string, string[]> = {
      'KIT-FRU-01': [
        'FRU-FRES-500',
        'FRU-FRA-125',
        'FRU-ARA-500',
        'FRU-UCH-500',
      ],
      'KIT-FRU-02': [
        'FRU-FRES-500',
        'FRU-FRA-125',
        'FRU-ARA-500',
        'FRU-MOR-500',
      ],
    };

    // Agrupar ventas con discriminación absoluta para pagos a proveedores
    const summary: Record<
      string,
      {
        id: string;
        name: string;
        directQty: number;
        kitQty: number;
        totalQty: number;
        totalMoney: number;
        unitCost: number;
        isKit: boolean;
      }
    > = {};

    const ensureProduct = (id: string, name: string) => {
      if (!summary[id]) {
        const info = productInfoMap.get(id);
        summary[id] = {
          id,
          name,
          directQty: 0,
          kitQty: 0,
          totalQty: 0,
          totalMoney: 0,
          unitCost: info?.cost || 0,
          isKit: !!KIT_COMPONENTS[id],
        };
      }
    };

    orders.forEach((order) => {
      order.items.forEach((item) => {
        // A. Registrar la venta directa
        ensureProduct(item.productId, item.name);
        summary[item.productId].directQty += item.quantity;
        summary[item.productId].totalQty += item.quantity;
        summary[item.productId].totalMoney += item.price * item.quantity;

        // B. Si es un Kit, explotar sus componentes para el conteo FÍSICO y COSTO
        if (KIT_COMPONENTS[item.productId]) {
          KIT_COMPONENTS[item.productId].forEach((componentId) => {
            const info = productInfoMap.get(componentId);
            const componentName = info?.name || `Componente: ${componentId}`;
            ensureProduct(componentId, componentName);

            // Sumar a la columna de Kits (conteo físico)
            summary[componentId].kitQty += item.quantity;
            summary[componentId].totalQty += item.quantity;
          });
        }
      });
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Despacho de Productos');

    worksheet.columns = [
      { header: 'ID PRODUCTO', key: 'id', width: 15 },
      { header: 'DESCRIPCIÓN', key: 'name', width: 35 },
      { header: 'VENTA DIRECTA', key: 'directQty', width: 18 },
      { header: 'VENTA EN KITS', key: 'kitQty', width: 18 },
      { header: 'TOTAL UNIDADES FÍSICAS', key: 'totalQty', width: 25 },
    ];

    // Ordenar: Productos físicos primero, Kits al final
    const sortedSummary = Object.values(summary).sort((a, b) => {
      if (a.isKit && !b.isKit) return 1;
      if (!a.isKit && b.isKit) return -1;
      return b.totalQty - a.totalQty;
    });

    sortedSummary.forEach((item) => {
      const row = worksheet.addRow({
        id: item.id,
        name: item.isKit ? `📦 ${item.name.toUpperCase()}` : item.name,
        directQty: item.directQty,
        kitQty: item.kitQty,
        totalQty: item.totalQty,
      });

      if (item.isKit) {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }

      if (item.kitQty > 0 && !item.isKit) {
        row.getCell('kitQty').font = {
          italic: true,
          color: { argb: 'FF4B5563' },
        };
      }

      ['directQty', 'kitQty', 'totalQty'].forEach((col) => {
        row.getCell(col).alignment = { horizontal: 'center' };
      });
    });

    // Totales de operación (Logística)
    const totalUnits = sortedSummary
      .filter((i) => !i.isKit)
      .reduce((sum, i) => sum + i.totalQty, 0);

    worksheet.addRow({});
    const footerRow = worksheet.addRow({
      name: 'TOTAL UNIDADES A DESPACHAR',
      totalQty: totalUnits,
    });
    footerRow.font = { bold: true, size: 11 };
    footerRow.getCell('totalQty').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB5F543' },
    };

    // Estilo de cabecera
    worksheet.getRow(1).height = 25;
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF005035' },
    };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Resumen_Ventas_Productos_${cycleName}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  @Patch('api/:id/delivery-fee')
  @Roles('ADMIN')
  async updateDeliveryFee(
    @Param('id') id: string,
    @Body() data: { deliveryFee: number },
  ) {
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
  @Roles('ADMIN')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() data: { status: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, client: true },
    });

    if (!order) {
      return { status: 'ERROR', message: 'Orden no encontrada' };
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: data.status },
      include: { items: true, client: true },
    });

    // --- LÓGICA DE CANCELACIÓN Y REVERSIÓN ---
    if (data.status === 'cancelled') {
      this.logger.log(
        `🔴 Iniciando reversión de stock para orden cancelada: ${id}`,
      );

      for (const item of updatedOrder.items) {
        try {
          // Devolver stock (+quantity) y restar ventas (-quantity)
          // Usamos el provider para que también maneje la cascada de los Kits
          await this.inventoryProvider.updateStock(
            item.productId,
            item.quantity,
          );

          // Nota: El updateStock del provider suma a ventas si el valor es negativo.
          // Como aquí queremos RESTAR ventas, haremos un ajuste manual en el modelo para este caso de cancelación.
          await this.prisma.inventoryItem.update({
            where: { id: item.productId },
            data: {
              sales: { decrement: item.quantity },
            },
          });
        } catch (e) {
          this.logger.error(
            `Error revirtiendo item ${item.productId}: ${e.message}`,
          );
        }
      }

      // Eliminar la orden de la base de datos tras la reversión
      await this.prisma.orderItem.deleteMany({ where: { orderId: id } });
      await this.prisma.order.delete({ where: { id } });

      this.logger.log(`✅ Orden ${id} eliminada y stock devuelto.`);
      return {
        status: 'SUCCESS',
        message: 'Orden cancelada, stock revertido y registro eliminado',
      };
    }

    // Mapear el objeto de la base de datos al objeto esperado por el dominio/eventos
    const domainOrder: any = {
      ...updatedOrder,
      items: updatedOrder.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        unitCost: i.unitCost,
      })),
    };

    // Disparar sincronización con Sheets según el nuevo estado
    if (data.status === 'confirmed') {
      // Si se confirma, va a la lista de entrega
      this.prisma.salesCycle
        .findFirst({ where: { status: 'OPEN' } })
        .then((cycle) => {
          // @ts-ignore
          this.eventEmitter.emit('sync.sheets.delivery_order_created', {
            order: domainOrder,
            client: updatedOrder.client,
          });
        });
    } else if (data.status === 'delivered') {
      // Si se entrega, se registra en control de costos
      // @ts-ignore
      this.eventEmitter.emit('sync.sheets.cost_control_created', {
        order: domainOrder,
        client: updatedOrder.client,
      });
    }

    return { status: 'SUCCESS', newStatus: updatedOrder.status };
  }
}
