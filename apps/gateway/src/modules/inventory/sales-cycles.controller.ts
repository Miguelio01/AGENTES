import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Render,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LOGO_BASE64 } from '../metrics/logo-base64';

@Controller('admin/cycles')
export class SalesCyclesAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Render('cycles')
  async getCyclesDashboard() {
    const cycles = await this.prisma.salesCycle.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        orders: {
          include: { items: true },
        },
      },
    });

    const allProducts = await this.prisma.inventoryItem.findMany();
    const productCostMap = new Map(allProducts.map((p) => [p.id, p.cost || 0]));

    // Definición de Kits para desglose de costos (Espejo de lógica de reportes)
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

    const now = new Date();

    // Calcular métricas y sincronizar estado dinámico
    const enrichedCycles = await Promise.all(
      cycles.map(async (cycle) => {
        let productRevenue = 0;
        let deliveryRevenue = 0;

        cycle.orders.forEach((order) => {
          if (order.status === 'cancelled') return; // No contar cancelados

          deliveryRevenue += order.deliveryFee || 0;

          order.items.forEach((item) => {
            productRevenue += item.price * item.quantity;
          });
        });

        // LÓGICA DINÁMICA DE ESTADO:
        // Si hoy es mayor a la fecha de cierre, debe estar cerrado.
        let currentStatus = cycle.status;
        if (cycle.endDate && now > cycle.endDate && cycle.status === 'OPEN') {
          currentStatus = 'CLOSED';
          await this.prisma.salesCycle.update({
            where: { id: cycle.id },
            data: { status: 'CLOSED' },
          });
        }

        const totalRevenue = productRevenue + deliveryRevenue;
        // La utilidad neta ahora EXCLUYE los domicilios (se restan del total de ingresos)
        // y también resta los pagos manuales a proveedores.
        const netProfit = totalRevenue - deliveryRevenue - (cycle.manualSupplierPayment || 0);
        // El margen se calcula sobre los ingresos de PRODUCTOS
        const margin = productRevenue > 0 ? (netProfit / productRevenue) * 100 : 0;

        return {
          ...cycle,
          status: currentStatus,
          metrics: {
            ordersCount: cycle.orders.length,
            productRevenue,
            deliveryRevenue,
            totalRevenue,
            manualSupplierPayment: cycle.manualSupplierPayment || 0,
            netProfit,
            margin: margin.toFixed(1),
          },
        };
      }),
    );

    return {
      cycles: enrichedCycles,
      title: 'Ciclos de Venta (Cosechas) - Frescoh!',
      logo: LOGO_BASE64,
    };
  }

  @Post('api/open')
  async openCycle(
    @Body()
    data: {
      name: string;
      startDate: string;
      endDate?: string;
      manualSupplierPayment?: number;
      deliveryFee?: number;
    },
  ) {
    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const now = new Date();

    // 1. Validación: Fecha de fin no puede ser menor a inicio
    if (endDate && endDate < startDate) {
      return {
        status: 'ERROR',
        message: 'La fecha de cierre no puede ser anterior a la de apertura.',
      };
    }

    // 2. Validación: Cronología con el ciclo anterior
    const lastCycle = await this.prisma.salesCycle.findFirst({
      orderBy: { endDate: 'desc' },
      where: { endDate: { not: null } },
    });

    if (lastCycle && lastCycle.endDate && startDate < lastCycle.endDate) {
      return {
        status: 'ERROR',
        message: `Conflicto cronológico: La nueva cosecha (${startDate.toLocaleDateString()}) no puede iniciar antes del cierre de la anterior (${lastCycle.endDate.toLocaleDateString()}).`,
      };
    }

    // Cerrar cualquier ciclo abierto primero (Saneamiento)
    await this.prisma.salesCycle.updateMany({
      where: { status: 'OPEN' },
      data: { status: 'CLOSED', endDate: startDate },
    });

    // Determinar estado inicial
    const status = endDate && now > endDate ? 'CLOSED' : 'OPEN';

    const newCycle = await this.prisma.salesCycle.create({
      data: {
        name: data.name,
        startDate,
        endDate,
        status,
        manualSupplierPayment:
          parseFloat(data.manualSupplierPayment as any) || 0,
        deliveryFee:
          data.deliveryFee !== undefined
            ? parseFloat(data.deliveryFee as any)
            : 10000,
      },
    });

    return { status: 'SUCCESS', cycle: newCycle };
  }

  @Patch('api/:id')
  async updateCycle(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      manualSupplierPayment?: number;
      deliveryFee?: number;
    },
  ) {
    try {
      const updateData: any = {};
      if (data.name) updateData.name = data.name;

      const current = await this.prisma.salesCycle.findUnique({
        where: { id },
      });
      if (!current) {
        return { status: 'ERROR', message: 'Ciclo no encontrado' };
      }

      if (data.startDate || data.endDate !== undefined) {
        const start = data.startDate
          ? new Date(data.startDate)
          : current.startDate;
        const end = data.endDate
          ? new Date(data.endDate)
          : data.endDate === null
            ? null
            : current.endDate;

        // 1. Validación: Fecha de fin no puede ser menor a inicio
        if (end && end < start) {
          return {
            status: 'ERROR',
            message:
              'La fecha de cierre no puede ser anterior a la de apertura.',
          };
        }

        // 2. Validación: Cronología con ciclos adyacentes
        const prevCycle = await this.prisma.salesCycle.findFirst({
          where: { id: { not: id }, endDate: { lte: start } },
          orderBy: { endDate: 'desc' },
        });

        if (prevCycle && prevCycle.endDate && start < prevCycle.endDate) {
          return {
            status: 'ERROR',
            message: `Conflicto: Esta cosecha no puede iniciar antes del cierre de "${prevCycle.name}" (${prevCycle.endDate.toLocaleDateString()}).`,
          };
        }

        updateData.startDate = start;
        updateData.endDate = end;

        // Recalcular estado basado en la fecha de fin y la fecha actual
        const now = new Date();
        if (end && now > end) updateData.status = 'CLOSED';
        else updateData.status = 'OPEN';
      }

      // Si se pide reactivar manualmente (status OPEN y endDate null)
      if (data.status === 'OPEN' && !updateData.endDate) {
        updateData.status = 'OPEN';
        updateData.endDate = null;
      }

      if (data.manualSupplierPayment !== undefined)
        updateData.manualSupplierPayment =
          parseFloat(data.manualSupplierPayment as any) || 0;
      if (data.deliveryFee !== undefined)
        updateData.deliveryFee = parseFloat(data.deliveryFee as any) || 0;

      const cycle = await this.prisma.salesCycle.update({
        where: { id },
        data: updateData,
      });

      return { status: 'SUCCESS', cycle };
    } catch (e) {
      return { status: 'ERROR', message: e.message };
    }
  }

  @Patch('api/payment/:id')
  async updateManualPayment(
    @Param('id') id: string,
    @Body() data: { payment: number },
  ) {
    await this.prisma.salesCycle.update({
      where: { id },
      data: { manualSupplierPayment: parseFloat(data.payment as any) || 0 },
    });
    return { status: 'SUCCESS' };
  }

  @Post('api/:id/reopen')
  async reopenCycle(@Param('id') id: string) {
    // 1. Cerrar cualquier otro ciclo abierto
    await this.prisma.salesCycle.updateMany({
      where: { status: 'OPEN', id: { not: id } },
      data: { status: 'CLOSED', endDate: new Date() },
    });

    // 2. Reabrir este ciclo
    const cycle = await this.prisma.salesCycle.update({
      where: { id },
      data: {
        status: 'OPEN',
        endDate: null,
      },
    });

    return { status: 'SUCCESS', cycle };
  }

  @Post('api/:id/close')
  async closeCycle(
    @Param('id') id: string,
    @Body() data?: { endDate?: string },
  ) {
    const cycle = await this.prisma.salesCycle.update({
      where: { id },
      data: {
        status: 'CLOSED',
        endDate: data?.endDate ? new Date(data.endDate) : new Date(),
      },
    });

    return { status: 'SUCCESS', cycle };
  }
}
