import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  KNOWLEDGE_BASE_PORT,
  INVENTORY_PROVIDER_PORT,
  AgentRequest,
  AgentResponse,
  Message,
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
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
    private readonly aiService: AiService,
  ) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(`🔍 Knowledge Agent recibiendo acción: ${request.action}`);

    switch (request.action) {
      case 'classify_intent':
        return this.handleClassifyIntent(request);
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

  private async handleClassifyIntent(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const history = request.data?.history || [];

    // 1. Obtener el "Menú Vivo" de la hoja de cálculo
    let productsMenu = 'No disponible';
    try {
      const allProducts = await this.inventoryProvider.listProducts();
      productsMenu = allProducts
        .filter((p) => p.stock > 0)
        .map((p) => `- ${p.name}`)
        .join('\n');
    } catch (e: any) {
      this.logger.error('Error al obtener menú dinámico:', e.message);
    }

    const classificationPrompt = Message.create({
      content: `
    Analiza el mensaje del usuario y clasifica su intención actual, considerando el HISTORIAL.
    
    INTENCIONES:
    - INTENT_GREETING: Saludos iniciales o despedidas. 
      * REGLA: Si el usuario está respondiendo a una pregunta tuya (ej: "¿Jumbo o Grandes?"), NO es GREETING.
    - INTENT_BUY: El usuario está pidiendo productos, respondiendo aclaraciones (ej: "Jumbo", "Grandes"), confirmando el pedido, o preguntando el total.
      * REGLA: Palabras sueltas que coinciden con opciones dadas antes son INTENT_BUY.
    - INTENT_CHECK_INVENTORY: Pregunta por qué hay disponible o precios.
    - INTENT_QUESTION: Dudas generales.

    Responde ÚNICAMENTE con la etiqueta.
      `.trim(),
      role: 'system',
      channel: 'system',
    });

    const classification = await this.aiService.getResponse([
      ...history.slice(-4),
      classificationPrompt,
    ]);
    const intent = classification.content.trim();

    return {
      from: 'knowledge-agent',
      to: request.from,
      status: 'SUCCESS',
      data: { intent },
    };
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
