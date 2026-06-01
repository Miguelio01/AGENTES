import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  PAYMENT_SCANNER_PORT,
  AgentRequest,
  AgentResponse,
} from '@agentes/domain';
import type { IPaymentScanner } from '@agentes/domain';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FinanceAgentService implements OnModuleInit {
  private readonly logger = new Logger(FinanceAgentService.name);
  private adkUrl: string;

  constructor(
    @Inject(PAYMENT_SCANNER_PORT)
    private readonly paymentScanner: IPaymentScanner,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.adkUrl =
      this.configService.get<string>('ADK_SALES_AGENT_URL') ||
      'http://localhost:8000';
  }

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`💰 Finance Agent recibiendo acción: ${request.action}`);

    // --- INTEGRACIÓN ADK (PYTHON) ---
    if (
      this.configService.get('USE_ADK_FINANCE_AGENT') === 'true' &&
      request.action === 'verify_payment'
    ) {
      try {
        this.logger.log(
          `🧠 Delegando validación de pago a ADK Finance Agent (Python) en ${this.adkUrl}...`,
        );
        const response = await axios.post(
          `${this.adkUrl}/run`,
          {
            user_id: request.context?.clientId || 'system',
            session_id: `session-finance-${request.context?.clientId || 'system'}`,
            message: `Validar pago por valor de $${request.data.amount}`,
            client_id: request.context?.clientId || 'system',
            force_agent: 'finance_agent',
          },
          { timeout: 25000 },
        );

        return {
          from: 'finance-agent' as any,
          to: request.from,
          status: 'SUCCESS',
          data: {
            content: response.data.reply,
            verified:
              response.data.reply.includes('Ya me entró el paguito') ||
              response.data.reply.includes('VERIFICADO'),
            phase: 'ADK_MANAGED',
          },
        };
      } catch (e) {
        this.logger.error(
          `❌ Error llamando a ADK Finance Agent: ${e.message}. Usando fallback local.`,
        );
      }
    }

    switch (request.action) {
      case 'verify_payment':
        return this.handleVerifyPayment(request);
      case 'list_recent':
        return this.handleListRecent(request);
      case 'get_daily_revenue':
        return this.handleGetDailyRevenue(request);
      default:
        return {
          from: 'finance-agent' as any,
          to: request.from,
          status: 'ERROR',
          data: { message: `Acción desconocida: ${request.action}` },
        };
    }
  }

  private async handleGetDailyRevenue(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const confirmations = await this.paymentScanner.listRecentConfirmations(50); // Más amplio para reporte

    const total = confirmations.reduce((sum, c) => sum + c.amount, 0);
    const byProvider = confirmations.reduce((acc, c) => {
      acc[c.provider] = (acc[c.provider] || 0) + c.amount;
      return acc;
    }, {});

    return {
      from: 'finance-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: {
        total,
        count: confirmations.length,
        breakdown: byProvider,
        lastPayments: confirmations.slice(0, 5), // Últimos 5 para snippet
      },
    };
  }

  private async handleVerifyPayment(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const { amount, dateLimit } = request.data;

    if (!amount) {
      return {
        from: 'finance-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: { message: 'Monto no proporcionado para validación' },
      };
    }

    const limit = dateLimit
      ? new Date(dateLimit)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h por defecto

    this.logger.log(
      `🔍 Buscando pago de $${amount} desde ${limit.toISOString()}`,
    );

    const confirmation = await this.paymentScanner.findConfirmation(
      amount,
      limit,
    );

    if (confirmation) {
      this.logger.log(`✅ Pago encontrado! Ref: ${confirmation.reference}`);
      return {
        from: 'finance-agent' as any,
        to: request.from,
        status: 'SUCCESS',
        data: {
          verified: true,
          confirmation,
        },
      };
    }

    return {
      from: 'finance-agent' as any,
      to: request.from,
      status: 'PENDING',
      data: {
        verified: false,
        message:
          'No se encontró el pago en Gmail todavía. Reintentando en unos minutos.',
      },
    };
  }

  private async handleListRecent(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const confirmations = await this.paymentScanner.listRecentConfirmations();
    return {
      from: 'finance-agent' as any,
      to: request.from,
      status: 'SUCCESS',
      data: { confirmations },
    };
  }
}
