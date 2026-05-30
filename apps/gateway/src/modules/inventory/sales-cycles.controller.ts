import { Controller, Get, Post, Patch, Body, Param, Render } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
          include: { items: true }
        }
      }
    });

    // Calcular métricas por ciclo
    const enrichedCycles = cycles.map(cycle => {
      let productRevenue = 0;
      let deliveryRevenue = 0;
      let productCost = 0;

      cycle.orders.forEach(order => {
        deliveryRevenue += order.deliveryFee || 0;

        order.items.forEach(item => {
          productRevenue += item.price * item.quantity;
          productCost += item.unitCost * item.quantity;
        });
      });

      const grossProfit = productRevenue - productCost;
      const netProfit = grossProfit - (cycle.operatingCosts || 0);
      const margin = productRevenue > 0 ? (netProfit / productRevenue) * 100 : 0;

      return {
        ...cycle,
        metrics: {
          ordersCount: cycle.orders.length,
          productRevenue,
          deliveryRevenue,
          totalRevenue: productRevenue + deliveryRevenue,
          productCost,
          grossProfit,
          operatingCosts: cycle.operatingCosts || 0,
          netProfit,
          margin: margin.toFixed(1)
        }
      };
    });

    return { 
      cycles: enrichedCycles,
      title: 'Ciclos de Venta (Cosechas) - Frescoh!'
    };
  }

  @Post('api/open')
  async openCycle(@Body() data: { name: string, startDate?: string, endDate?: string, operatingCosts?: number }) {
    // Cerrar cualquier ciclo abierto primero
    await this.prisma.salesCycle.updateMany({
      where: { status: 'OPEN' },
      data: { status: 'CLOSED', endDate: data.startDate ? new Date(data.startDate) : new Date() }
    });

    const newCycle = await this.prisma.salesCycle.create({
      data: {
        name: data.name,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: data.endDate ? 'CLOSED' : 'OPEN',
        operatingCosts: parseFloat(data.operatingCosts as any) || 0
      }
    });

    return { status: 'SUCCESS', cycle: newCycle };
  }

  @Patch('api/:id')
  async updateCycle(@Param('id') id: string, @Body() data: { name?: string, startDate?: string, endDate?: string, status?: string, operatingCosts?: number }) {
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (data.status) updateData.status = data.status;
    if (data.operatingCosts !== undefined) updateData.operatingCosts = parseFloat(data.operatingCosts as any) || 0;

    const cycle = await this.prisma.salesCycle.update({
      where: { id },
      data: updateData
    });

    return { status: 'SUCCESS', cycle };
  }

  @Post('api/:id/close')
  async closeCycle(@Param('id') id: string, @Body() data?: { endDate?: string }) {
    const cycle = await this.prisma.salesCycle.update({
      where: { id },
      data: { 
        status: 'CLOSED', 
        endDate: data?.endDate ? new Date(data.endDate) : new Date() 
      }
    });

    return { status: 'SUCCESS', cycle };
  }
}
