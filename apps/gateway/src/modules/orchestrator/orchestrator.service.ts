import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Message,
  Session,
  Client,
  EmotionalState,
  PaymentProofSubmittedEvent,
} from '@agentes/domain';
import type { IEmotionAnalyzer } from '@agentes/domain';
import { AiService } from '../ai/ai.service';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { InventoryAgentService } from '../agents/inventory-agent.service';
import { EscalationAgentService } from '../agents/escalation-agent.service';
import { SalesAgentService } from '../agents/sales-agent.service';
import { KnowledgeAgentService } from '../agents/knowledge-agent.service';
import { VoiceAgentService } from '../agents/voice-agent.service';
import { FinanceAgentService } from '../agents/finance-agent.service';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    private readonly inventoryAgent: InventoryAgentService,
    private readonly escalationAgent: EscalationAgentService,
    private readonly salesAgent: SalesAgentService,
    private readonly knowledgeAgent: KnowledgeAgentService,
    private readonly voiceAgent: VoiceAgentService,
    private readonly financeAgent: FinanceAgentService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('IEmotionAnalyzer')
    private readonly emotionAnalyzer: IEmotionAnalyzer,
  ) {}

  async handleIncomingMessage(
    message: Message,
    senderId: string,
    replyCallback: (reply: Message) => Promise<void>,
    presenceCallback: (isTyping: boolean) => Promise<void>,
  ) {
    this.logger.log(`─── 📥 NUEVO MENSAJE RECIBIDO ───`);
    this.logger.log(`De: ${senderId} [${message.channel}]`);
    this.logger.log(`Contenido: "${message.content}"`);

    await presenceCallback(true);

    const pushName = message.metadata?.pushName || '';
    const cleanPhone = message.metadata?.phone || senderId.split('@')[0];
    const clientId = cleanPhone;

    let client = await this.clientsService.findOne(clientId);
    const genericNames = [
      'Cliente Nuevo',
      'Usuario WhatsApp',
      'WhatsApp User',
      '',
    ];

    if (!client) {
      const initialName = genericNames.includes(pushName)
        ? 'Cliente Nuevo'
        : pushName;
      client = Client.create(clientId, initialName, cleanPhone);
      if (message.content.includes('Vengo de su página de enlaces')) {
        client.updateProfile({ registrationSource: 'LINK_PAGE' });
      }
      await this.clientsService.create(client);
      this.logger.log(
        `👤 Nuevo cliente registrado: ${initialName} (${cleanPhone}) [Source: ${client.registrationSource || 'DIRECT'}]`,
      );
    } else {
      const currentIsGeneric = genericNames.includes(client.name);
      const newIsReal = !genericNames.includes(pushName);
      if (currentIsGeneric && newIsReal) {
        client.updateName(pushName);
        await this.clientsService.create(client);
      }
      if (
        !client.registrationSource &&
        message.content.includes('Vengo de su página de enlaces')
      ) {
        client.updateProfile({ registrationSource: 'LINK_PAGE' });
        await this.clientsService.create(client);
      }
    }

    let emotion = EmotionalState.neutral();
    try {
      const emotionPromise = this.emotionAnalyzer.analyze(message.content);
      const timeoutPromise = new Promise<EmotionalState>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 4000),
      );
      emotion = await Promise.race([emotionPromise, timeoutPromise]);
    } catch (e: any) {
      this.logger.warn(`   > ⚠️ Análisis emocional omitido`);
    }

    let session = await this.sessionsService.findActiveByClientId(clientId);
    const isNewSession = !session;

    if (!session) {
      session = Session.create({
        clientId: clientId,
        agentId: 'fresco-consultor',
      });
      const lastSession =
        await this.sessionsService.findLastByClientId(clientId);
      if (lastSession) {
        const contextMessages = lastSession.history.slice(-3);
        if (contextMessages.length > 0) {
          this.logger.log(
            `🧠 Recuperando contexto previo (${contextMessages.length} mensajes)`,
          );
          session.addMessages(contextMessages);
        }
      }

      if (client.name === 'Cliente Nuevo' && !pushName) {
        session.setFlowState('AWAITING_NAME');
      }
      await this.sessionsService.create(session);
    }
    session.updateEmotionalState(emotion);
    await this.sessionsService.update(session);

    if (
      session.flowState !== 'IDLE' &&
      session.flowState !== 'AWAITING_ORDER'
    ) {
      const formResponse = await this.handleFormFlow(
        message,
        client,
        session,
        replyCallback,
        presenceCallback,
      );
      if (formResponse) return;
    }

    this.logger.log(`🧠 PASO A2A: Delegando al Cerebro...`);
    session.addMessage(message);

    // Solo saludo inicial si es sesión nueva Y el mensaje es corto (saludo)
    const isGreetingOnly = message.content.length < 20 && (/hola|buenos días|buenas noches|qué tal/i.test(message.content));

    if (isNewSession && session.flowState === 'IDLE' && isGreetingOnly) {
      await this.handleInitialGreeting(
        message,
        client,
        session,
        replyCallback,
        presenceCallback,
      );
      return;
    }

    const brainResponse = await this.knowledgeAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'knowledge-agent',
      action: 'classify_intent',
      context: { clientId: clientId, lastMessage: message.content },
      data: { history: session.history },
    });

    const intent = brainResponse.data.intent;
    this.logger.log(`   > Intención reconocida por el Cerebro: ${intent}`);

    let agentFact: any = { intent };

    // REGLA DE ORO: Si venimos de una pregunta (huevos) y la respuesta es corta, es INTENT_BUY
    const lastAssistantMsg = [...session.history].reverse().find(m => m.role === 'assistant')?.content || '';
    if (lastAssistantMsg.includes('Jumbo o Grandes') && message.content.length < 15) {
      this.logger.log(`🎯 Respuesta a aclaración detectada. Forzando INTENT_BUY.`);
      agentFact.intent = 'INTENT_BUY';
    }

    if (agentFact.intent.includes('INTENT_GREETING')) {
      this.logger.log(`👋 Preparando saludo con cosecha.`);
      const invResponse = await this.inventoryAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'inventory-agent',
        action: 'get_available_list',
        context: { clientId: clientId },
      });
      agentFact.availableProducts = invResponse.data.availableProducts || [];
    } else if (
      intent.includes('INTENT_CHECK_INVENTORY') ||
      intent.includes('INTENT_BUY')
    ) {
      const isLandingPage = message.content.includes(
        'Vengo de su página de enlaces',
      );
      const isGeneral =
        isLandingPage ||
        (/qué.*tienes|productos|stock|cosecha|vendes|disponible|lista|tipo de productos|para esta semana/i.test(
          message.content,
        ) &&
          message.content.length < 150);

      if (isGeneral) {
        this.logger.log(`📋 Consulta general de stock detectada.`);
        const invResponse = await this.inventoryAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'inventory-agent',
          action: 'get_available_list',
          context: { clientId: clientId },
        });
        agentFact.availableProducts = invResponse.data.availableProducts || [];
      } else {
        const salesResponse = await this.delegateToSales(
          message,
          clientId,
          session,
          client,
        );
        // Priorizar el estado de la venta sobre la intención original
        agentFact = { 
          ...salesResponse.data, 
          status: salesResponse.status,
          intent: salesResponse.status === 'SUCCESS' || salesResponse.status === 'REQUIRES_USER_INPUT' ? 'INTENT_ORDER_PROCESS' : intent 
        };

        if ((salesResponse.status === 'SUCCESS' || salesResponse.status === 'REQUIRES_USER_INPUT') && salesResponse.data.items) {
          session.metadata = {
            ...session.metadata,
            currentOrderItems: salesResponse.data.items,
          };
          await this.sessionsService.update(session);
        }

        if (salesResponse.status === 'ERROR') {
          const escalationResponse = await this.delegateToEscalation(
            message,
            clientId,
            client.name,
          );
          agentFact.escalation = escalationResponse.data.info;
        }
      }
    } else if (intent.includes('INTENT_QUESTION')) {
      const escalationResponse = await this.delegateToEscalation(
        message,
        clientId,
        client.name,
      );
      agentFact.info = escalationResponse.data.info;
      agentFact.escalation = escalationResponse.data.info;
    }

    this.logger.log(`🎙️ PASO A2A: Delegando a la Voz de Fresquitoh...`);
    const voiceResponse = await this.voiceAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'fulfillment-agent' as any,
      action: 'synthesize',
      context: {
        clientId: clientId,
        clientName: client.name,
        emotion: session.emotionalState,
      },
      data: { facts: agentFact, history: session.history.slice(-3) },
    });

    const replyContent = voiceResponse.data.content;
    const replyMessage = Message.create({
      content: replyContent,
      role: 'assistant',
      channel: message.channel,
    });

    if (
      replyContent.toLowerCase().includes('tomar sus datos') ||
      replyContent.toLowerCase().includes('factura electrónica')
    ) {
      session.setFlowState('AWAITING_E_BILLING_CHOICE');
      await replyCallback(
        Message.create({
          content:
            'Antes de seguir sumercé, ¿desea factura electrónica para su compra? (Responda Sí o No)',
          role: 'assistant',
          channel: message.channel,
        }),
      );
    }

    await presenceCallback(false);
    session.addMessage(replyMessage);
    await this.sessionsService.update(session);
    await replyCallback(replyMessage);
    this.logger.log(`─── 📤 RESPUESTA ENVIADA ───`);
  }

  private async handleInitialGreeting(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: any,
    presenceCallback: any,
  ) {
    this.logger.log(`👋 Preparando saludo inicial con cosecha.`);
    const harvestFact: any = { intent: 'INTENT_GREETING' };
    try {
      const invResponse = await this.inventoryAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'inventory-agent',
        action: 'get_available_list',
        context: { clientId: client.id },
      });
      harvestFact.availableProducts = invResponse.data.availableProducts || [];
    } catch (e: any) {
      this.logger.error('No se pudo cargar la cosecha para el saludo');
    }

    const voiceResponse = await this.voiceAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'fulfillment-agent' as any,
      action: 'synthesize',
      context: {
        clientId: client.id,
        clientName: client.name,
        emotion: session.emotionalState,
      },
      data: { facts: harvestFact, history: session.history },
    });

    const greeting = Message.create({
      content: voiceResponse.data.content,
      role: 'assistant',
      channel: message.channel,
    });
    await presenceCallback(false);
    session.addMessage(greeting);
    await this.sessionsService.update(session);
    await replyCallback(greeting);
  }

  private async delegateToSales(
    message: Message,
    clientId: string,
    session: Session,
    client: Client,
  ): Promise<any> {
    const invResponse = await this.inventoryAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'inventory-agent',
      action: 'get_available_list',
      context: { clientId },
    });
    const available = invResponse.data.availableProducts || [];

    const extractionPrompt = Message.create({
      content: `
      Eres un experto en identificar pedidos de comida para la tienda "Frescoh!".
      Tu misión es extraer productos, cantidades y unidades del mensaje del cliente, USANDO EL HISTORIAL si es necesario.
      
      PRODUCTOS DISPONIBLES (REFERENCIA):
      ${available.map((p: any) => `- ${p.name} (${p.weight || ''})`).join('\n')}

      EJEMPLOS CON CONTEXTO:
      1. Usuario: "Quiero 2 bandejas de huevos"
         Asistente: "¿Los desea Jumbo o Grandes?"
         Usuario: "Grandes"
         -> EXTRAE: [{"product": "Huevos Grandes", "quantity": 2, "unit": "bandeja"}]

      2. Usuario: "regáleme 3 de tilapia"
         -> EXTRAE: [{"product": "Tilapia", "quantity": 3, "unit": "unidad"}]
      
      REGLA DE ORO:
      - Si el cliente responde a una aclaración (ej: "Grandes"), busca en el historial qué producto y cantidad mencionó antes para armar el item completo.
      - NUNCA asumas el tipo si no está claro. Si solo dice "huevos" y no hay contexto previo, extrae "huevos".
      - Extrae la CANTIDAD numérica exacta.
      - Responde ÚNICAMENTE con un array JSON.
      `.trim(),
      role: 'system',
      channel: 'system',
    });

    const extraction = await this.aiService.getResponse([
      ...session.history.slice(-6),
      extractionPrompt,
    ]);
    let items: any[] = [];
    try {
      const jsonMatch = extraction.content.match(/\[.*\]/s);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
        items = items.filter((i) => i && i.product && i.product.length > 2);
      }
    } catch (e: any) {}

    if (items.length === 0 && this.checkIfConfirmation(message.content)) {
      // Si es confirmación y no se extrajeron items nuevos, usar los que ya tenemos en la sesión
      const storedItems = session.metadata?.currentOrderItems || [];
      items = storedItems.map((i: any) => ({
        product: i.productName || i.product,
        quantity: i.unitsNeeded || i.quantity || 1,
        unit: i.unit
      }));
    }

    if (items.length === 0 && !this.checkIfConfirmation(message.content)) {
      items = [{ product: message.content, quantity: 1, unit: 'unidad' }];
    }

    return this.salesAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'fulfillment-agent' as any,
      action: 'manage_sale',
      context: {
        clientId,
        clientName: client.name,
        emotion: session.emotionalState,
        lastMessage: message.content,
      },
      data: items,
    });
  }

  private checkIfConfirmation(message: string): boolean {
    const low = message.toLowerCase();
    return (
      low.includes('ok') ||
      low.includes('sí') ||
      low.includes('si') ||
      low.includes('hágale') ||
      low.includes('pedido') ||
      low.includes('confirmado') ||
      low.includes('cuánto sería') ||
      low.includes('cuanto es')
    );
  }

  private async delegateToEscalation(
    message: Message,
    clientId: string,
    clientName: string,
  ): Promise<any> {
    this.logger.log(`🚨 Delegando a Soporte Humano...`);
    return this.escalationAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'fulfillment-agent' as any,
      action: 'escalate',
      context: { clientId: clientId, clientName: clientName },
      data: { question: message.content },
    });
  }

  private async handleFormFlow(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: any,
    presenceCallback: any,
  ): Promise<boolean> {
    if (session.flowState === 'AWAITING_NAME') {
      const name = message.content.trim();
      if (name.length > 2) {
        client.updateName(name);
        await this.clientsService.create(client);
        session.setFlowState('IDLE');
        await this.sessionsService.update(session);
        await presenceCallback(false);
        await replyCallback(
          Message.create({
            content: `¡Mucho gusto don ${name}! Ya lo anoté por aquí en mi libreta. Ahora sí sumercé, ¿en qué le puedo servir hoy?`,
            role: 'assistant',
            channel: message.channel,
          }),
        );
      } else {
        await replyCallback(
          Message.create({
            content:
              '¡Ay sumercé! No le alcancé a oír bien el nombre. ¿Cómo es que se llama usted?',
            role: 'assistant',
            channel: message.channel,
          }),
        );
      }
      return true;
    }

    if (session.flowState === 'AWAITING_E_BILLING_CHOICE') {
      const choice = message.content.toLowerCase();
      const isYes = choice.includes('si') || choice.includes('sí');
      if (isYes) {
        session.setFlowState('AWAITING_DOC_TYPE');
      } else {
        client.updateProfile({
          documentType: 'DUMMY',
          documentNumber: '222222222222',
          fullName: 'Consumidor Final',
          address: 'Bogotá D.C.',
          city: 'Bogotá',
          email: 'facturacion@frescoh.com',
        });
        session.setFlowState('AWAITING_ADDRESS');
      }
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      const text = isYes
        ? '¡Perfecto sumercé! ¿Qué tipo de documento tiene? (Escriba CC, NIT, CE o PP)'
        : 'Entendido, no hay problema. Entonces dígame sumercé, ¿a qué dirección le mandamos su cosecha?';
      await replyCallback(
        Message.create({
          content: text,
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_DOC_TYPE') {
      const type = message.content.toUpperCase().trim();
      client.updateProfile({ documentType: type as any });
      session.setFlowState('AWAITING_DOC_NUMBER');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content: `Listo, ${type}. ¿Cuál es el número de documento?`,
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_DOC_NUMBER') {
      client.updateProfile({ documentNumber: message.content.trim() });
      session.setFlowState('AWAITING_ADDRESS');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            '¡Anotado! Ahora regáleme la dirección de entrega, por favor.',
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_ADDRESS') {
      client.updateProfile({ address: message.content });
      session.setFlowState('AWAITING_FULL_NAME');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            'Ya casi terminamos sumercé. ¿A nombre de quién ponemos el pedido?',
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_FULL_NAME') {
      client.updateProfile({ fullName: message.content });
      session.setFlowState('AWAITING_EMAIL');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            '¡Casi lo tenemos! Por último, regáleme su correo electrónico para enviarle la factura.',
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_EMAIL') {
      client.updateProfile({ email: message.content.trim() });
      session.setFlowState('AWAITING_PAYMENT_PROOF');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);

      try {
        const items = session.metadata?.currentOrderItems || [];
        await this.salesAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'fulfillment-agent' as any,
          action: 'register_prepaid',
          context: { clientId: client.id },
          data: { items },
        });
      } catch (e: any) {
        this.logger.error(`❌ Error registrando en prepago: ${e.message}`);
      }

      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            '¡Listo sumercé! Ya tengo sus datos completos y ya anoté su pedido en mi libreta de "Pendientes de Pago". Por favor, envíeme el soporte de la transferencia por el valor del pedido para confirmarlo.',
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_PAYMENT_PROOF') {
      const isComprobante =
        message.metadata?.media ||
        message.content.toLowerCase().includes('transferencia') ||
        message.content.toLowerCase().includes('comprobante') ||
        message.content.toLowerCase().includes('ya le mandé');

      if (isComprobante) {
        this.logger.log(`💰 Procesando comprobante de pago de ${client.name}...`);
        
        // 1. Notificar a Miguel (Soporte Humano) - Mantiene la seguridad
        this.eventEmitter.emit(
          'payment.proof.submitted',
          new PaymentProofSubmittedEvent(
            'ORDER-' + Date.now().toString().slice(-6),
            client.id,
            message.metadata?.media,
            { clientName: client.name },
          ),
        );

        // 2. Intento de Validación Automática con FinanceAgent
        const orderItems = session.metadata?.currentOrderItems || [];
        const subtotal = orderItems.reduce((sum: number, i: any) => sum + (i.totalPrice || 0), 0);
        
        // Obtener costo de domicilio para el total real
        const config = await this.inventoryAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'inventory-agent',
          action: 'get_available_list', // Usamos esta acción que ya tiene acceso al provider
          context: { clientId: client.id }
        });
        
        // Nota: En un sistema real, sacaríamos el total guardado en la sesión o el pedido.
        // Por ahora calculamos basado en lo que tenemos en metadata.
        const financeResponse = await this.financeAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'finance-agent' as any,
          action: 'verify_payment',
          context: { clientId: client.id },
          data: { amount: subtotal + 9000 } // Total aproximado
        });

        if (financeResponse.status === 'SUCCESS' && financeResponse.data.verified) {
          this.logger.log(`✅ Pago verificado automáticamente para ${client.name}`);
          session.setFlowState('READY_FOR_DELIVERY');
          
          // Registrar en Lista_entrega
          await this.inventoryAgent.handleRequest({
            from: 'fresquitoh-orchestrator',
            to: 'inventory-agent',
            action: 'register_delivery' as any, // Necesitaremos esta acción o llamar al provider
            context: { clientId: client.id },
            data: { items: orderItems, total: subtotal + 9000 }
          });

          await presenceCallback(false);
          await replyCallback(Message.create({
            content: `¡Excelente noticia don ${client.name}! Su pago ya entró a la cuenta y lo pude validar. Ya mismo paso su pedido a la lista de despachos de este jueves. ¡Muchas gracias por su compra sumercé!`,
            role: 'assistant', channel: message.channel
          }));
        } else {
          // Si no se valida automático, queda en espera de admin
          session.setFlowState('AWAITING_ADMIN_APPROVAL');
          await presenceCallback(false);
          await replyCallback(Message.create({
            content: `¡Gracias sumercé! Ya recibí su soporte. Déme un momentico mientras el patrón Miguel me confirma que entró la platica a la cuenta y yo le aviso por aquí mismo apenas estemos listos para el despacho.`,
            role: 'assistant', channel: message.channel
          }));
        }

        await this.sessionsService.update(session);
        return true;
      }
    }

    return false;
  }
}
