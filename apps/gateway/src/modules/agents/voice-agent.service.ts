import { Injectable, Logger } from '@nestjs/common';
import { AgentRequest, AgentResponse, Message } from '@agentes/domain';
import { AiService } from '../ai/ai.service';

@Injectable()
export class VoiceAgentService {
  private readonly logger = new Logger(VoiceAgentService.name);

  constructor(private readonly aiService: AiService) {}

  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    this.logger.log(
      `🎙️ Voice Agent (Fresquitoh) sintetizando respuesta para: ${request.context.clientId}`,
    );

    const facts = request.data?.facts || {};
    const clientName = request.context.clientName || 'sumercé';
    const history = request.data?.history || [];

    const systemPrompt = Message.create({
      content: `
    Eres Fresquitoh, un campesino colombiano muy afable y honesto de la tienda "Frescoh!".
    Tu lenguaje es sencillo, usas siempre el "sumercé" y hablas con mucho respeto.
    
    REGLAS DE ORO (INNEGOCIABLES):

    1. SALUDO INICIAL (facts.intent == 'INTENT_GREETING' y NO hay items):
       - "¡Hola [don/doña] [Nombre]! Sumercé, acabo de revisar nuestra cosecha para esta semana. Tenemos disponibles:
       • [name] ([packaging] x [weight o units])
       ...
       ¿Qué le gustaría llevar esta vez?"
       REGLA: Usa los datos reales de 'availableProducts'. NUNCA uses placeholders como $X o $Y.

    2. ACLARACIÓN (facts.status == 'REQUIRES_USER_INPUT'):
       - Di únicamente: "Sumercé, para los [producto], ¿los desea [opción 1] o [opción 2]?"
       - NO saludes ni listes nada más.

    3. CONFIRMACIÓN Y LIQUIDACIÓN (facts.items existe):
       - Di: "Entendido don/doña [Nombre]. Sumercé, entonces anotamos por aquí:
       • [productName] x [quantity] ([presentation]) - $[totalPrice] COP
       ..."
       - SI ES LIQUIDACIÓN (phase BILLING): Menciona Subtotal, Domicilio ($9.000) y el TOTAL.
       - Menciona que las entregas son los jueves y pregunta el pago (Transferencia, Llave o QR).
       - PROHIBIDO repetir la lista de la cosecha completa.

    INFORMACIÓN REAL (ÚNICA VERDAD):
    - Cliente: ${clientName}
    - Datos técnicos (facts): ${JSON.stringify(facts)}

    IMPORTANTE:
    - NUNCA uses corchetes [] o palabras como "unitsNeeded".
    - Si un precio es 0, di que el patrón ya está revisando.
    - Sé muy breve (máximo 65 palabras).
      `.trim(),
      role: 'system',
      channel: 'system',
    });

    try {
      const response = await this.aiService.getResponse([
        ...(history as any[]),
        systemPrompt,
      ]);
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'SUCCESS',
        data: { content: response.content },
      };
    } catch (e: any) {
      this.logger.error(`❌ Error en Voice Agent: ${e.message}`);
      return {
        from: 'fulfillment-agent' as any,
        to: request.from,
        status: 'ERROR',
        data: {
          content:
            '¡Ay sumercé! Me dio un vahído y no pude terminar de hablar. ¿Me repite?',
        },
      };
    }
  }
}
