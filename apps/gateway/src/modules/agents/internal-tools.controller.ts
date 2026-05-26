import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InventoryAgentService } from './inventory-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { FinanceAgentService } from './finance-agent.service';
import { Message } from '@agentes/domain';

@Controller('internal/tools')
export class InternalToolsController {
  private readonly logger = new Logger(InternalToolsController.name);

  constructor(
    private readonly inventoryAgent: InventoryAgentService,
    private readonly salesAgent: SalesAgentService,
    private readonly financeAgent: FinanceAgentService,
  ) {}

  @Post('check-stock')
  async checkStock(@Body() data: { product: string; quantity: number, clientId: string, action?: string, items?: any[] }) {
    const action = (data.action as any) || 'check_stock';
    const identifier = data.items ? `${data.items.length} items` : (data.product || 'N/A');
    this.logger.log(`🔧 Internal Tool: ${action} for ${identifier}`);
    
    const response = await this.inventoryAgent.handleRequest({
      from: 'adk-agent' as any,
      to: 'inventory-agent' as any,
      action,
      data: data.items ? { items: data.items } : {
        productName: data.product,
        requestedQuantity: data.quantity,
      },
      context: { clientId: data.clientId }
    });
    return response;
  }

  @Post('check-stock-batch')
  async checkStockBatch(@Body() data: { items: { productName: string; quantity: number }[], clientId: string }) {
    this.logger.log(`🔧 Internal Tool: check-stock-batch for ${data.items.length} items`);
    const response = await this.inventoryAgent.handleRequest({
      from: 'adk-agent' as any,
      to: 'inventory-agent' as any,
      action: 'check_stock_batch' as any,
      data: { items: data.items },
      context: { clientId: data.clientId }
    });
    return response;
  }

  @Post('scan-payments')
  async scanPayments(@Body() data: { amount: number }) {
    this.logger.log(`🔧 Internal Tool: scan-payments for $${data.amount}`);
    const response = await this.financeAgent.handleRequest({
      from: 'adk-agent' as any,
      to: 'finance-agent' as any,
      action: 'verify_payment',
      data: { amount: data.amount },
      context: { clientId: 'ADK_SYSTEM' }
    });
    return response;
  }

  @Post('get-daily-revenue')
  async getDailyRevenue() {
    this.logger.log(`🔧 Internal Tool: get-daily-revenue`);
    const response = await this.financeAgent.handleRequest({
      from: 'adk-agent' as any,
      to: 'finance-agent' as any,
      action: 'get_daily_revenue',
      data: {},
      context: { clientId: 'ADK_SYSTEM' }
    });
    return response;
  }

  @Post('register-order')
  async registerOrder(@Body() data: { items: any[]; clientId: string; orderId?: string }) {
    this.logger.log(`🔧 Internal Tool: register-order for ${data.clientId}`);
    const response = await this.salesAgent.handleRequest({
      from: 'adk-agent' as any,
      to: 'sales-agent' as any,
      action: 'register_prepaid',
      data: { items: data.items },
      context: {
        clientId: data.clientId,
        orderId: data.orderId || `ADK-${Date.now().toString().slice(-6)}`
      }
    });
    return response;
  }
}
