import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Message,
  Session,
  Client,
  EmotionalState,
  PaymentProofSubmittedEvent,
  AdminPaymentApprovedEvent,
  INVENTORY_PROVIDER_PORT,
  Order,
} from '@agentes/domain';
import type { IEmotionAnalyzer, IInventoryProvider } from '@agentes/domain';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { InventoryAgentService } from '../agents/inventory-agent.service';
import { EscalationAgentService } from '../agents/escalation-agent.service';
import { SalesAgentService } from '../agents/sales-agent.service';
import { OrdersService } from '../orders/orders.service';
import { TelegramOrdersService } from './telegram-orders.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private adkUrl: string;

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    private readonly inventoryAgent: InventoryAgentService,
    private readonly escalationAgent: EscalationAgentService,
    private readonly salesAgent: SalesAgentService,
    private readonly ordersService: OrdersService,
    private readonly telegramOrdersService: TelegramOrdersService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.adkUrl =
      this.configService.get<string>('ADK_SALES_AGENT_URL') ||
      'http://localhost:8000';
  }

  async handleIncomingMessage(
    message: Message,
    senderId: string,
    replyCallback: (reply: Message) => Promise<void>,
    presenceCallback: (isTyping: boolean) => Promise<void>,
  ) {
    this.logger.log(`─── 📥 INGRESS: NUEVO MENSAJE ───`);
    this.logger.log(`De: ${senderId} [${message.channel}]`);

    await presenceCallback(true);

    // 1. GESTIÓN DE IDENTIDAD (Cliente y Sesión)
    const client = await this.resolveClient(message, senderId);
    const session = await this.resolveSession(client, senderId);

    // 1.1 INTERCEPCIÓN ESPECIAL: BOT DE PEDIDOS TELEGRAM (Wizard)
    if (message.channel === 'telegram-orders') {
      const handled = await this.telegramOrdersService.handleMessage(
        message,
        client,
        session,
        replyCallback,
      );
      if (handled) {
        await presenceCallback(false);
        return;
      }
    }

    // 2. GESTIÓN DE ID DE PEDIDO (Consecutivo ORD-XXXX)
    // Si hay items del catálogo, forzamos un NUEVO ID de pedido para evitar usar el de la sesión anterior
    if (message.metadata?.orderItems) {
      const orderId = await this.ordersService.getNextOrderId();
      if (!session.metadata) session.metadata = {};
      session.metadata.currentOrderId = orderId;
      session.metadata.registeredInPrepago = false;
      session.metadata.missingItems = undefined; // Limpiar anteriores
      session.metadata.total = undefined; // Limpiar anteriores
      session.setFlowState('IDLE');
      await this.sessionsService.update(session);
      this.logger.log(`🔢 Generado nuevo ID de pedido (Catálogo): ${orderId}`);
    } else if (!session.metadata?.currentOrderId) {
      const orderId = await this.ordersService.getNextOrderId();
      if (!session.metadata) session.metadata = {};
      session.metadata.currentOrderId = orderId;
      await this.sessionsService.update(session);
      this.logger.log(`🔢 Generado nuevo ID de pedido (Texto): ${orderId}`);
    }

    // 3. INTERCEPCIÓN DE FLUJOS MANUALES (Formularios/Hands)
    if (this.shouldInterceptFlow(session)) {
      this.logger.log(
        `⏳ Procesando flujo de formulario: ${session.flowState}`,
      );
      const handled = await this.handleFormFlow(
        message,
        client,
        session,
        replyCallback,
        presenceCallback,
      );
      if (handled) return;
    }

    // 4. ESTRATEGIA ZERO TOKEN: Saludo inicial optimizado
    if (this.isInitialContact(session, message)) {
      return this.sendFixedGreeting(
        message,
        session,
        replyCallback,
        presenceCallback,
      );
    }

    // 4.1. VÍA RÁPIDA: Procesamiento directo de pedidos de catálogo (Sin análisis de lenguaje)
    if (this.isPureCatalogOrder(message)) {
      this.logger.log(
        `⚡ VÍA RÁPIDA: Procesando pedido de catálogo determinísticamente.`,
      );
      const handled = await this.handleDirectCatalogOrder(
        message,
        client,
        session,
        replyCallback,
        presenceCallback,
      );
      if (handled) return;
      this.logger.warn(
        `⚠️ VÍA RÁPIDA falló, reintentando por vía cognitiva (ADK).`,
      );
    }

    // 4.2. INTERCEPCIÓN DE LISTA DE ESPERA (Sí/No determinista)
    const waitlistHandled = await this.interceptWaitlistResponse(
      message,
      client,
      session,
      replyCallback,
    );
    if (waitlistHandled) return;

    // 4.3. DETECCIÓN DE LEAD DESDE PÁGINA DE ENLACES (Hito solicitado por Miguel)
    const isLinkPageLead =
      message.content.toLowerCase().includes('página de enlaces') ||
      message.content.toLowerCase().includes('conocido su página');

    if (isLinkPageLead) {
      this.logger.log(`🔗 Detectado lead desde página de enlaces: ${senderId}`);

      const reply = Message.create({
        content: `¡Buen día! Qué gusto saludarle, soy Fesquitoh. Si busca algo, recuerde que todos los productos disponibles están en el catálogo que encuentra aquí arribita☝️.\n\n¡Es más fácil y rápido! Si tiene alguna pregunta, con gusto le ayudo.`,
        role: 'assistant',
        channel: message.channel,
      });

      await presenceCallback(false);
      session.addMessage(message);
      session.addMessage(reply);
      await this.sessionsService.update(session);
      await replyCallback(reply);
      return;
    }

    // 5. DELEGACIÓN AL CORE COGNITIVO (Python ADK)
    this.logger.log(`🧠 A2A CORE: Delegando razonamiento a Python ADK...`);

    try {
      const response = await this.callAdkCore(message, client, session);

      if (!response || response.metadata?.agent === 'error') {
        throw new Error(response?.reply || 'Error interno del cerebro ADK');
      }

      let safeReply = response.reply;
      // Filtro heurístico para detectar si el LLM devolvió código Python o JSON en lugar de texto conversacional
      const isHallucination =
        safeReply.includes('```') ||
        safeReply.includes('import json') ||
        safeReply.includes('def ') ||
        safeReply.includes('print(') ||
        safeReply.includes('subtotal =');

      if (isHallucination) {
        this.logger.error(
          `🚨 ALUCINACIÓN DETECTADA: El agente ADK devolvió código crudo. Interceptando mensaje. Contenido original:\n${safeReply}`,
        );

        // Mensaje de fallback para el cliente
        safeReply =
          '¡Ay, sumercé! Tuve un inconveniente técnico procesando su solicitud y me enredé un poco. Ya le avisé a Miguel para que lo atienda personalmente en unos minuticos. ¡Mil disculpas por la espera!';

        // Escalar inmediatamente al administrador
        try {
          await this.escalationAgent.handleRequest({
            from: 'orchestrator' as any,
            to: 'escalation-agent' as any,
            action: 'escalate',
            context: { clientId: client.id, clientName: client.name },
            data: {
              question: `🚨 FALLO CRÍTICO (ALUCINACIÓN): El bot generó código Python/JSON crudo en lugar de responder. El mensaje ha sido interceptado.\n\nEl cliente intentaba decir:\n"${message.content}"\n\nPor favor atiende al cliente personalmente.`,
            },
          });
        } catch (e) {
          this.logger.error(
            `Error al intentar escalar alucinación: ${e.message}`,
          );
        }
      }

      const reply = Message.create({
        content: safeReply,
        role: 'assistant',
        channel: message.channel,
      });

      // 1. Sincronizar estado de sesión basado en metadatos de ADK
      await this.syncSessionWithCore(session, response, client, message);

      await presenceCallback(false);
      session.addMessage(message);
      session.addMessage(reply);
      await this.sessionsService.update(session);

      await replyCallback(reply);

      // 2. REGISTRO UNIVERSAL EN PREPAGO (HANDS)
      // Si el ADK extrajo items o vienen de WhatsApp, y no se han registrado, grabamos en Sheets
      // PRIORIDAD: Preferimos los items del ADK porque pueden venir ajustados por stock
      const finalItems =
        response.metadata?.items || message.metadata?.orderItems;
      const hasItemsToRegister =
        finalItems &&
        finalItems.length > 0 &&
        !session.metadata?.registeredInPrepago;

      if (hasItemsToRegister) {
        await this.registerCatalogueInPrepago(finalItems, client, session);
      }
    } catch (error) {
      this.logger.error(`❌ Error en comunicación A2A: ${error.message}`);
      await presenceCallback(false);

      const fallbackMsg =
        '¡Ay, sumercé! Qué pena con usted, pero me dio un vahído técnico y no pude procesar su mensaje. Ya le avisé a Miguel para que lo atienda personalmente en unos minutos. ¡Gracias por su paciencia!';

      await replyCallback(
        Message.create({
          content: fallbackMsg,
          role: 'assistant',
          channel: message.channel,
        }),
      );

      // Escalar al administrador
      try {
        await this.escalationAgent.handleRequest({
          from: 'orchestrator' as any,
          to: 'escalation-agent' as any,
          action: 'escalate',
          context: { clientId: client.id, clientName: client.name },
          data: {
            question: `🚨 FALLO DE COMUNICACIÓN/INTELIGENCIA: El bot falló al procesar el mensaje (Error: ${error.message}). He enviado el mensaje de disculpa al cliente. Por favor, toma el control de la conversación.`,
          },
        });
      } catch (e) {
        this.logger.error(`Fallo al escalar error A2A: ${e.message}`);
      }
    }
  }

  private isPureCatalogOrder(message: Message): boolean {
    if (
      !message.metadata?.orderItems ||
      message.metadata.orderItems.length === 0
    )
      return false;

    // Si tiene items, revisamos si el texto es solo el autogenerado o un saludo simple
    const cleanContent = message.content.toLowerCase().trim();
    const isAutoGenerated =
      cleanContent.includes('nuevo pedido del catálogo') || cleanContent === '';
    const isSimpleGreeting =
      cleanContent === 'hola' ||
      cleanContent === 'buenos días' ||
      cleanContent === 'buenas tardes';

    return isAutoGenerated || isSimpleGreeting;
  }

  private async interceptWaitlistResponse(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: any,
  ): Promise<boolean> {
    const cleanMsg = message.content.toLowerCase().trim();
    const isYes = cleanMsg === 'si' || cleanMsg === 'sí';
    const isNo = cleanMsg === 'no';

    if ((isYes || isNo) && session.metadata?.missingItems) {
      if (isYes) {
        await this.inventoryAgent.handleRequest({
          from: 'orchestrator' as any,
          to: 'inventory-agent' as any,
          action: 'register_waitlist' as any,
          data: { items: session.metadata.missingItems },
          context: { clientId: client.id },
        });
        const reply = Message.create({
          content:
            'Listo, ya quedó anotado en la lista de espera. Quedo atento a su comprobante de pago de lo que tenemos disponible para despacharle.',
          role: 'assistant',
          channel: message.channel,
        });
        await replyCallback(reply);
        session.addMessage(message);
        session.addMessage(reply);
      } else {
        const reply = Message.create({
          content:
            'Bueno señor, esperamos el comprobante de pago ya que no quiere el producto más adelante.',
          role: 'assistant',
          channel: message.channel,
        });
        await replyCallback(reply);
        session.addMessage(message);
        session.addMessage(reply);
      }

      delete session.metadata.missingItems;
      await this.sessionsService.update(session);
      return true;
    }
    return false;
  }

  private async handleDirectCatalogOrder(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: any,
    presenceCallback: any,
  ): Promise<boolean> {
    const incomingItems = message.metadata?.orderItems;
    if (!incomingItems) return false;

    // Obtener ID secuencial si no existe
    if (!session.metadata?.currentOrderId) {
      const orderId = await this.ordersService.getNextOrderId();
      if (!session.metadata) session.metadata = {};
      session.metadata.currentOrderId = orderId;
    }

    const orderId = session.metadata.currentOrderId;

    try {
      // 1. Verificar stock real para los nuevos items
      const inventoryResponse = await this.inventoryAgent.handleRequest({
        from: 'orchestrator' as any,
        to: 'inventory-agent' as any,
        action: 'check_stock_batch' as any,
        data: {
          items: incomingItems.map((i: any) => ({
            productName: i.product || i.productName,
            quantity: i.quantity,
          })),
        },
        context: { clientId: client.id },
      });

      if (inventoryResponse.status !== 'SUCCESS')
        throw new Error('Error al verificar inventario');

      const results = inventoryResponse.data.results;
      const availableIncoming = results.filter(
        (r: any) => r.availableQuantity > 0,
      );
      const outOfStockItems = results.filter((r: any) => r.missingQuantity > 0);

      // 2. Lógica de ACUMULACIÓN (Merging)
      if (!session.metadata) session.metadata = {};
      if (!session.metadata.currentOrderItems) {
        session.metadata.currentOrderItems = [];
      }

      const currentOrderItems = session.metadata.currentOrderItems;

      availableIncoming.forEach((newItem: any) => {
        const existing = currentOrderItems.find(
          (ei: any) =>
            ei.productId === (newItem.productId || newItem.productName),
        );
        if (existing) {
          existing.quantity += newItem.availableQuantity;
        } else {
          currentOrderItems.push({
            productId: newItem.productId || newItem.productName,
            productName: newItem.productName,
            quantity: newItem.availableQuantity,
            pricePerUnit: newItem.pricePerUnit,
          });
        }
      });

      // 3. Obtener configuración (Domicilio Dinámico por Cosecha)
      const activeCycle = await this.prisma.salesCycle.findFirst({
        where: { status: 'OPEN' },
      });

      const deliveryFee = activeCycle?.deliveryFee || 10000;

      // 4. Recalcular Totales del Carrito Acumulado
      let subtotal = 0;
      const breakdown = session.metadata.currentOrderItems
        .map((i: any) => {
          const itemTotal = i.pricePerUnit * i.quantity;
          subtotal += itemTotal;
          return `•⁠  ⁠${i.quantity}x ${i.productName} ($${itemTotal.toLocaleString('es-CO')})`;
        })
        .join('\n');

      const total = subtotal + deliveryFee;
      session.metadata.total = total;
      session.metadata.deliveryFee = deliveryFee;
      session.metadata.hasPendingCart = true; // Flag para registro diferido

      let replyContent =
        `🛒 ¡Pedido actualizado! (CARRITO ACUMULADO) \n\n` +
        `Resumen de su compra hasta ahora: \n${breakdown}\n\n` +
        `Subtotal: $${subtotal.toLocaleString('es-CO')}\n` +
        `Domicilio: $${deliveryFee.toLocaleString('es-CO')}\n` +
        `Total a pagar: $${total.toLocaleString('es-CO')}\n\n` +
        `✅ Pedido número: *${orderId}*\n\n`;

      // 5. Advertencias de Stock
      if (outOfStockItems.length > 0) {
        const warning = outOfStockItems
          .map(
            (i: any) =>
              `⚠️ Lo siento, solo pude agregar ${i.availableQuantity} de ${i.productName} (faltaron ${i.missingQuantity} por falta de stock).`,
          )
          .join('\n');
        replyContent += warning + '\n\n';
      }

      replyContent +=
        `🏦 *Medios de pago:*\n` +
        `Transferencia a Bancolombia → Cuenta de ahorros 57100005161\n` +
        `Pago por llave (Bre-B) → @frescoh\n\n` +
        `Apenas me envíe el comprobante, le reservo su cupo en la ruta de despacho. ¡Gracias! [SEND_QR_FRESCOH]`;

      const reply = Message.create({
        content: replyContent,
        role: 'assistant',
        channel: message.channel,
      });

      // Diferir registro: No llamamos a registerCatalogueInPrepago aquí.
      // Se llamará cuando el usuario envíe el comprobante de pago.

      session.setFlowState('AWAITING_PAYMENT_PROOF');

      await presenceCallback(false);
      session.addMessage(message);
      session.addMessage(reply);
      await this.sessionsService.update(session);
      await replyCallback(reply);

      return true;
    } catch (e) {
      this.logger.error(
        `❌ Error en vía rápida (Carrito Acumulativo): ${e.message}`,
      );
      return false;
    }
  }

  private async resolveClient(
    message: Message,
    senderId: string,
  ): Promise<Client> {
    const metadata = message.metadata || {};
    const pushName = metadata.pushName || '';
    const cleanPhone =
      metadata.phone || senderId.split('@')[0].replace(/[^0-9]/g, '');
    const currentLid =
      metadata.lid ||
      (senderId.includes('@lid') ? senderId.split(' ')[0].trim() : undefined);

    let client = currentLid
      ? await this.clientsService.findByLid(currentLid)
      : null;
    if (!client && cleanPhone)
      client = await this.clientsService.findByPhone(cleanPhone);
    if (!client) client = await this.clientsService.findOne(cleanPhone);

    if (!client) {
      const primaryId =
        cleanPhone ||
        (currentLid ? currentLid.split('@')[0] : senderId.split('@')[0]);
      client = Client.create(
        primaryId,
        pushName || 'Cliente Nuevo',
        cleanPhone,
        currentLid,
      );
      await this.clientsService.create(client);
    } else {
      // Actualización silenciosa de identidad
      let updated = false;
      if (currentLid && client.lid !== currentLid) {
        client.updateProfile({ lid: currentLid });
        updated = true;
      }
      if (cleanPhone && client.phone !== cleanPhone) {
        client.updateProfile({ phone: cleanPhone });
        updated = true;
      }
      if (pushName && client.name === 'Cliente Nuevo') {
        client.updateName(pushName);
        updated = true;
      }
      if (updated) await this.clientsService.create(client);
    }
    return client;
  }

  private async resolveSession(
    client: Client,
    senderId: string,
  ): Promise<Session> {
    const sessionClientId = client.id || senderId.split(' ')[0].trim();
    let session =
      await this.sessionsService.findActiveByClientId(sessionClientId);
    if (!session) {
      session = Session.create({
        clientId: sessionClientId,
        agentId: 'fresco-consultor',
      });
      await this.sessionsService.update(session);
    }
    return session;
  }

  private shouldInterceptFlow(session: Session): boolean {
    return (
      session.flowState !== 'IDLE' && session.flowState !== 'AWAITING_ORDER'
    );
  }

  private isInitialContact(session: Session, message: Message): boolean {
    // Si el mensaje tiene media (comprobante), NUNCA es un contacto inicial para saludo genérico
    if (message.metadata?.media) return false;

    // Si la sesión ya tiene un flujo activo (ej: esperando pago), no interrumpir con saludo inicial
    if (session.flowState !== 'IDLE') return false;

    // Si el mensaje es una respuesta corta afirmativa/negativa, probablemente es una respuesta a una pregunta previa
    const cleanMsg = message.content.toLowerCase().trim();
    if (cleanMsg === 'si' || cleanMsg === 'no' || cleanMsg === 'sí')
      return false;

    const userMsgs = session.history.filter((m) => m.role === 'user');
    return (
      userMsgs.length === 0 &&
      message.content.length < 10 &&
      !message.metadata?.orderItems
    );
  }

  private async sendFixedGreeting(
    message: Message,
    session: Session,
    replyCallback: any,
    presenceCallback: any,
  ) {
    const greeting = Message.create({
      content: `¡Buen día! Qué gusto saludarle, soy Fesquitoh. Si busca algo, recuerde que todos los productos disponibles están en el catálogo que encuentra aquí arribita☝️.\n\n¡Es más fácil y rápido! Si tiene alguna pregunta, con gusto le ayudo.`,
      role: 'assistant',
      channel: message.channel,
    });
    await presenceCallback(false);
    session.addMessage(greeting);
    await this.sessionsService.update(session);
    await replyCallback(greeting);
  }

  private async callAdkCore(
    message: Message,
    client: Client,
    session: Session,
  ) {
    let catalogContext = '';

    // Si es un pedido manual, inyectamos el catálogo para que la IA sepa qué significan los números
    if (message.content.toLowerCase().startsWith('/pedido')) {
      try {
        const inventoryResponse = await this.inventoryAgent.handleRequest({
          from: 'orchestrator' as any,
          to: 'inventory-agent' as any,
          action: 'get_numbered_catalog' as any,
          data: {},
          context: { clientId: client.id },
        });
        if (inventoryResponse.status === 'SUCCESS') {
          catalogContext = inventoryResponse.data.catalog;
        }
      } catch (e) {}
    }

    return (
      await axios.post(
        `${this.adkUrl}/run`,
        {
          user_id: client.id,
          session_id: `session-${client.id}`,
          message: message.content,
          client_id: client.id,
          client_name: client.name,
          client_phone: client.phone,
          client_lid: client.lid,
          order_id: session.metadata?.currentOrderId || 'ORD-NEW',
          items: message.metadata?.orderItems || [],
          catalog: catalogContext,
        },
        { timeout: 90000 },
      )
    ).data;
  }

  private async syncSessionWithCore(
    session: Session,
    adkResponse: any,
    client: Client,
    message: Message,
  ) {
    const metadata = adkResponse.metadata || {};

    // Reconocer los nuevos tags de QR o menciones de pago para activar el estado de espera de comprobante
    const paymentTags = [
      '[SEND_QR]',
      '[SEND_QR_FRESCOH]',
      '💎ADJUNTAR_QR_FRESCOH💎',
      'cuenta es:',
    ];
    const isPaymentPhase = paymentTags.some((tag) =>
      adkResponse.reply.includes(tag),
    );

    if (isPaymentPhase) {
      this.logger.log(
        `💰 Sincronización A2A: Detectada fase de pago. flowState -> AWAITING_PAYMENT_PROOF`,
      );
      session.setFlowState('AWAITING_PAYMENT_PROOF');
    }

    // Persistir items si vienen estructurados del ADK (por si hizo extracción)
    if (metadata.items) {
      session.metadata = {
        ...session.metadata,
        currentOrderItems: metadata.items,
        currentOrderId:
          session.metadata?.currentOrderId ||
          `ORD-${Date.now().toString().slice(-6)}`,
      };
    }
  }

  private async registerCatalogueInPrepago(
    items: any[],
    client: Client,
    session: Session,
  ) {
    const orderId =
      session.metadata?.currentOrderId ||
      `ORD-${Date.now().toString().slice(-4)}`;
    try {
      await this.salesAgent.handleRequest({
        from: 'orchestrator' as any,
        to: 'fulfillment-agent' as any,
        action: 'register_prepaid',
        context: { clientId: client.id, orderId },
        data: {
          items,
          deliveryFee: session.metadata?.deliveryFee,
        },
      });

      if (!session.metadata) session.metadata = {};
      session.metadata.registeredInPrepago = true;
      session.metadata.currentOrderId = orderId;

      await this.sessionsService.update(session);
      this.logger.log(
        `✅ Registro exitoso en prepago para ${client.name} (ID: ${orderId})`,
      );
    } catch (e) {
      this.logger.error(`❌ Fallo en registro automático: ${e.message}`);
    }
  }

  // --- MÉTODOS DE FORMULARIO (HANDS) MANTENIDOS PARA CONTROL DE CANAL ---
  private async handleFormFlow(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: any,
    presenceCallback: any,
  ): Promise<boolean> {
    // Aquí mantenemos la lógica de AWAITING_NAME, AWAITING_PAYMENT_PROOF, etc.
    // que interactúa directamente con el estado del canal (WhatsApp/Telegram).
    // NOTA: Esta lógica se simplificará en una segunda pasada.

    if (session.flowState === 'AWAITING_PAYMENT_PROOF') {
      const isComprobante =
        message.metadata?.media ||
        message.content.toLowerCase().includes('soporte') ||
        message.content.toLowerCase().includes('pagué');
      if (isComprobante) {
        this.logger.log(
          `💰 Procesando comprobante de pago de ${client.name}...`,
        );

        // LÓGICA DE CIERRE DE CARRITO ACUMULATIVO
        if (
          session.metadata?.hasPendingCart &&
          session.metadata?.currentOrderItems
        ) {
          this.logger.log(
            `📦 Finalizando Carrito Acumulativo para ${client.name} antes de la aprobación.`,
          );
          await this.registerCatalogueInPrepago(
            session.metadata.currentOrderItems.map((i: any) => ({
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              price: i.pricePerUnit,
            })),
            client,
            session,
          );
          // Limpiar flag para evitar registros dobles
          session.metadata.hasPendingCart = false;
        }

        const orderId =
          session.metadata?.currentOrderId ||
          `ORD-${Date.now().toString().slice(-6)}`;
        this.eventEmitter.emit(
          'payment.proof.submitted',
          new PaymentProofSubmittedEvent(
            orderId,
            client.phone || client.id,
            message.metadata?.media,
            {
              clientName: client.name,
              total: session.metadata?.total,
              channel: message.channel,
            },
          ),
        );

        await presenceCallback(false);
        await replyCallback(
          Message.create({
            content: `¡Gracias! Ya recibí su soporte. Déme un momento mientras verificamos el pago y yo le aviso apenas estemos listos para el despacho.`,
            role: 'assistant',
            channel: message.channel,
          }),
        );

        session.setFlowState('AWAITING_ADMIN_APPROVAL');
        await this.sessionsService.update(session);
        return true;
      }
    }

    if (session.flowState === 'AWAITING_BULK_DATA') {
      this.logger.log(`📝 Procesando datos masivos para ${client.name}...`);

      const extractionPrompt = `Extrae la información del cliente del siguiente mensaje en formato JSON puro (sin markdown). 
      Campos: 
      - fullName: Nombre completo o razón social.
      - documentType: Tipo de documento (ej: CC, NIT, CE, PP). Solo las siglas en mayúsculas.
      - documentNumber: Solo el número del documento.
      - address: Dirección de entrega.
      - email: Correo electrónico.
      
      Si algún campo no está, pon null.
      
      Mensaje: "${message.content}"`;

      try {
        const jsonStr = await this.aiService.generateText(
          extractionPrompt,
          'data_extraction',
        );
        const extracted = JSON.parse(
          jsonStr.replace(/```json|```/g, '').trim(),
        );

        if (
          extracted.fullName ||
          extracted.documentNumber ||
          extracted.address ||
          extracted.email
        ) {
          this.logger.log(`✅ Datos extraídos: ${JSON.stringify(extracted)}`);

          // 1. Actualizar el perfil del cliente
          client.updateProfile({
            fullName: extracted.fullName || client.fullName,
            documentType: extracted.documentType || client.documentType,
            documentNumber: extracted.documentNumber || client.documentNumber,
            address: extracted.address || client.address,
            email: extracted.email || client.email,
          });
          await this.clientsService.save(client);

          // 2. Verificar si ya tenemos todo lo necesario
          const isCompleteNow = !!(
            client.fullName &&
            client.documentType &&
            client.documentNumber &&
            client.address &&
            client.email
          );

          if (isCompleteNow) {
            const pendingOrder = session.metadata?.pendingDeliveryRegistration;
            if (pendingOrder?.orderId) {
              this.logger.log(
                `🚀 Perfil completado. Disparando aprobación final para pedido ${pendingOrder.orderId}`,
              );

              // Disparar de nuevo el evento de aprobación para que la Saga lo tome con los datos nuevos
              this.eventEmitter.emit(
                'order.approved',
                new AdminPaymentApprovedEvent(
                  pendingOrder.orderId,
                  'SYSTEM-DATA-COLLECTOR',
                  client.id,
                ),
              );

              if (session.metadata) {
                delete session.metadata.pendingDeliveryRegistration;
              }
              session.setFlowState('IDLE');
              await this.sessionsService.update(session);

              await presenceCallback(false);
              await replyCallback(
                Message.create({
                  content: `¡Perfecto sumercé! Ya con sus datos completos he procedido a agendar su entrega. Muchas gracias por su colaboración.`,
                  role: 'assistant',
                  channel: message.channel,
                }),
              );
              return true;
            }
          } else {
            this.logger.warn(
              `⚠️ Datos parciales recibidos. Aún faltan campos para completar el perfil de ${client.name}`,
            );
            await replyCallback(
              Message.create({
                content: `Muchas gracias por los datos. Sin embargo, me falta todavía información (recuerde: Nombre, Cédula, Dirección y Correo). ¿Me podría completar lo que falta, sumercé?`,
                role: 'assistant',
                channel: message.channel,
              }),
            );
            return true;
          }
        }
      } catch (e) {
        this.logger.error(`❌ Error extrayendo datos masivos: ${e.message}`);
        // Si falla la extracción, dejamos que pase al core ADK como fallback
      }
    }

    // Simplificación extrema: Si no es pago, delegamos al Core ADK para que él decida
    return false;
  }
}
