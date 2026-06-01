import { Injectable, Logger } from '@nestjs/common';
import { AgentRequest, AgentResponse } from '@agentes/domain';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

interface EscalationLevel {
  id: string;
  name: string;
  telegramId: string | undefined;
  timeoutMs: number;
}

@Injectable()
export class EscalationAgentService {
  private readonly logger = new Logger(EscalationAgentService.name);
  private activeEscalations = new Map<
    string,
    {
      levelIndex: number;
      timer: NodeJS.Timeout;
      clientId: string;
      clientName: string;
      originalQuestion: string;
    }
  >();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  private getEscalationPath(): EscalationLevel[] {
    return [
      {
        id: 'miguel',
        name: 'Miguel',
        telegramId: this.configService.get<string>('TELEGRAM_ADMIN_ID'),
        timeoutMs: 3 * 60 * 1000,
      },
      {
        id: 'karlos',
        name: 'Karlos',
        telegramId: this.configService.get<string>(
          'TELEGRAM_PARTNER_KARLOS_ID',
        ),
        timeoutMs: 3 * 60 * 1000,
      },
      {
        id: 'paula',
        name: 'Paula',
        telegramId: this.configService.get<string>('TELEGRAM_PARTNER_PAULA_ID'),
        timeoutMs: 3 * 60 * 1000,
      },
      {
        id: 'manuela',
        name: 'Manuela',
        telegramId: this.configService.get<string>(
          'TELEGRAM_PARTNER_MANUELA_ID',
        ),
        timeoutMs: 3 * 60 * 1000,
      },
    ].filter((level) => !!level.telegramId); // Solo incluir socios con ID configurado
  }

  @OnEvent('escalation.resolve')
  async handleResolveEvent(payload: { clientId: string; resolvedBy: string }) {
    this.logger.log(
      `✅ Resolving escalation via event for client: ${payload.clientId}`,
    );
    await this.resolveEscalationInternal(payload.clientId, payload.resolvedBy);
  }

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(
      `🚨 Escalation Agent activado para el cliente: ${request.context.clientId}`,
    );

    if (request.action === 'escalate') {
      return this.startEscalation(request);
    }

    if (request.action === 'resolve') {
      const { clientId, resolvedBy } = request.data;
      return this.resolveEscalationInternal(clientId, resolvedBy);
    }

    return {
      from: 'fulfillment-agent' as any,
      to: request.from,
      status: 'ERROR',
      data: { message: 'Acción no soportada' },
    };
  }

  private async startEscalation(request: AgentRequest): Promise<AgentResponse> {
    const clientId = request.context.clientId;
    const clientName = request.context.clientName || 'Cliente';
    const question = request.data.question;

    if (this.activeEscalations.has(clientId)) {
      return {
        from: 'fresquitoh-orchestrator' as any,
        to: request.from,
        status: 'SUCCESS',
        data: { message: 'Escalamiento ya en curso' },
      };
    }

    await this.notifyLevel(0, clientId, clientName, question);
    return {
      from: 'fresquitoh-orchestrator' as any,
      to: request.from,
      status: 'SUCCESS',
      data: { message: 'Escalamiento iniciado' },
    };
  }

  private notifyLevel(
    levelIndex: number,
    clientId: string,
    clientName: string,
    question: string,
  ) {
    const path = this.getEscalationPath();

    if (levelIndex >= path.length) {
      this.logger.warn(
        `🛑 Cascada agotada para el cliente ${clientId}. Nadie respondió.`,
      );
      return;
    }

    const level = path[levelIndex];
    const content = `🚨 *ALERTA DE ESCALAMIENTO*\n\n*Cliente:* ${clientName} (\`${clientId}\`)\ntiene una duda que Fresquitoh no pudo resolver:\n\n_"${question}"_\n\nVe a WhatsApp a contestarle. Responde \`/atendido\` aquí para cerrar el caso.`;

    if (level.telegramId) {
      this.eventEmitter.emit('notification.send', {
        recipientId: level.telegramId,
        channel: 'telegram',
        content,
      });
    }

    const timer = setTimeout(() => {
      this.logger.log(
        `⏰ Tiempo agotado para ${level.name}. Escalando al siguiente nivel...`,
      );
      this.notifyLevel(levelIndex + 1, clientId, clientName, question);
    }, level.timeoutMs);

    this.activeEscalations.set(clientId, {
      levelIndex,
      timer,
      clientId,
      clientName,
      originalQuestion: question,
    });
  }

  private async resolveEscalationInternal(
    clientId: string,
    resolvedBy: string,
  ): Promise<AgentResponse> {
    const path = this.getEscalationPath();

    // Si no viene clientId, intentamos buscar si solo hay uno activo
    if (!clientId && this.activeEscalations.size === 1) {
      clientId = this.activeEscalations.keys().next().value;
      this.logger.log(
        `🔍 No se provee ID, resolviendo única alerta activa: ${clientId}`,
      );
    }

    const escalation = this.activeEscalations.get(clientId);

    if (escalation) {
      this.logger.log(
        `🛑 Deteniendo cronómetro para el cliente ${clientId}...`,
      );
      clearTimeout(escalation.timer);
      const clientName = escalation.clientName;
      this.activeEscalations.delete(clientId);

      // Notificar a todos que ya fue atendido
      const successContent = `✅ El caso de *${clientName}* (\`${clientId}\`) ya fue atendido por *${resolvedBy}*. Ya no es necesario que escalen.`;

      for (const level of path) {
        if (level.telegramId) {
          this.eventEmitter.emit('notification.send', {
            recipientId: level.telegramId,
            channel: 'telegram',
            content: successContent,
          });
        }
      }

      return {
        from: 'fresquitoh-orchestrator' as any,
        to: 'knowledge-agent' as any,
        status: 'SUCCESS',
        data: {
          message: `Escalamiento para ${clientId} resuelto por ${resolvedBy}`,
        },
      };
    }

    return {
      from: 'fresquitoh-orchestrator' as any,
      to: 'knowledge-agent' as any,
      status: 'ERROR',
      data: {
        message: clientId
          ? `No hay escalamiento activo para ${clientId}`
          : 'No hay alertas activas para resolver',
      },
    };
  }
}
