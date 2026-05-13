import { Injectable, Inject, Logger } from '@nestjs/common';
import { 
  PAYMENT_SCANNER_PORT, 
  AgentRequest, 
  AgentResponse
} from '@agentes/domain';
import type { IPaymentScanner } from '@agentes/domain';

@Injectable()
export class FinanceAgentService {
  private readonly logger = new Logger(FinanceAgentService.name);

  constructor(
    @Inject(PAYMENT_SCANNER_PORT)
    private readonly paymentScanner: IPaymentScanner,
  ) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`💰 Finance Agent recibiendo acción: ${request.action}`);

    switch (request.action) {
      case 'verify_payment':
        return this.handleVerifyPayment(request);
      case 'list_recent':
        return this.handleListRecent(request);
      default:
        return {
          from: 'finance-agent' as any,
          to: request.from,
          status: 'ERROR',
          data: { message: `Acción desconocida: ${request.action}` }
        };
    }
  }

  private async handleVerifyPayment(request: AgentRequest): Promise<AgentResponse> {
    const { amount, dateLimit } = request.data;
    
    if (!amount) {
      return {
        from: 'finance-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: { message: 'Monto no proporcionado para validación' }
      };
    }

    const limit = dateLimit ? new Date(dateLimit) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h por defecto
    
    this.logger.log(`🔍 Buscando pago de $${amount} desde ${limit.toISOString()}`);
    
    const confirmation = await this.paymentScanner.findConfirmation(amount, limit);

    if (confirmation) {
      this.logger.log(`✅ Pago encontrado! Ref: ${confirmation.reference}`);
      return {
        from: 'finance-agent' as any,
        to: request.from,
        status: 'SUCCESS',
        data: {
          verified: true,
          confirmation
        }
      };
    }

    return {
      from: 'finance-agent' as any,
      to: request.from,
      status: 'PENDING',
      data: {
        verified: false,
        message: 'No se encontró el pago en Gmail todavía. Reintentando en unos minutos.'
      }
    };
  }

  private async handleListRecent(request: AgentRequest): Promise<AgentResponse> {
    const confirmations = await this.paymentScanner.listRecentConfirmations();
    return {
      from: 'finance-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: { confirmations }
    };
  }
}
