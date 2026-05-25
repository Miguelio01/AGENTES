import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  KNOWLEDGE_BASE_PORT,
  INVENTORY_PROVIDER_PORT,
  AgentRequest,
  AgentResponse,
} from '@agentes/domain';
import type {
  IKnowledgeBase,
  KnowledgeResult,
  IInventoryProvider,
} from '@agentes/domain';
import { AiService } from '../ai/ai.service';

@Injectable()
export class KnowledgeAgentService {
  private readonly logger = new Logger(KnowledgeAgentService.name);

  constructor(
    @Inject(KNOWLEDGE_BASE_PORT) private readonly knowledgeBase: IKnowledgeBase,
  ) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`🔍 Knowledge Agent Tool: ${request.action}`);

    switch (request.action) {
      case 'query_rules':
        return this.handleQueryRules(request);
      case 'search_knowledge':
        return this.handleSearch(request);
      default:
        return {
          from: 'knowledge-agent',
          to: request.from,
          status: 'ERROR',
          data: { message: `Acción desconocida: ${request.action}` },
        };
    }
  }

  private async handleQueryRules(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const results = await this.knowledgeBase.search(
      'reglas de empaque y conversión',
      1,
    );

    if (results.length === 0) {
      return {
        from: 'knowledge-agent',
        to: request.from,
        status: 'ERROR',
        data: { message: 'No se encontraron reglas de empaque.' },
      };
    }

    return {
      from: 'knowledge-agent',
      to: request.from,
      status: 'SUCCESS',
      data: { rules: results[0].content },
    };
  }

  private async handleSearch(
    request: AgentRequest,
  ): Promise<AgentResponse<KnowledgeResult[]>> {
    const query = request.data?.query || request.context.lastMessage;
    const results = await this.knowledgeBase.search(query, 3);

    return {
      from: 'knowledge-agent',
      to: request.from,
      status: 'SUCCESS',
      data: results,
    };
  }
}
