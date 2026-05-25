import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Message,
  Session,
  Client,
  EmotionalState,
  PaymentProofSubmittedEvent,
  INVENTORY_PROVIDER_PORT,
  Order,
} from '@agentes/domain';
import type { IEmotionAnalyzer, IInventoryProvider } from '@agentes/domain';
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
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
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

    // --- LOGICA DE PEDIDOS MANUALES (TELEGRAM ORDERS) ---
    if (message.channel === 'telegram-orders') {
      this.logger.log('📦 Procesando PEDIDO MANUAL vía Telegram...');
      
      const prompt = `Actúa como un experto en extracción de datos para un sistema de pedidos de frutas y verduras.
Tu tarea es extraer la información de un pedido manual de un socio y devolver ÚNICAMENTE un objeto JSON válido.

Información a extraer:
1. "nombre": Nombre completo del cliente (string).
2. "celular": Número de teléfono (string, solo números).
3. "direccion": Dirección de entrega (string).
4. "items": Lista de productos (array de objetos con "product" y "quantity").

Texto del pedido:
"${message.content.replace('/pedido', '').trim()}"

REGLAS ESTRICTAS:
- Si no encuentras un dato, pon null.
- Los productos deben ser strings simples (ej: "fresa", "mora").
- Las cantidades deben ser números.
- Devuelve SOLO el JSON. No incluyas explicaciones ni markdown.
- Formato esperado: {"nombre": "...", "celular": "...", "direccion": "...", "items": [{"product": "...", "quantity": 1}]}
`;

      const extractionResult = await this.aiService.generateText(prompt, 'telegram_order_extraction');
      this.logger.log(`🤖 Extracción LLM: ${extractionResult}`);

      try {
        const data = JSON.parse(extractionResult.replace(/```json|```/g, '').trim());
        
        if (!data.items || data.items.length === 0) {
          throw new Error('No se detectaron productos en el pedido.');
        }

        // 1. Gestionar Cliente
        let client = await this.clientsService.findByPhone(data.celular);
        if (!client) {
          client = Client.create(data.celular || `T-${Date.now()}`, data.nombre || 'Cliente Manual', data.celular || '');
          client.updateProfile({ address: data.direccion, registrationSource: 'TELEGRAM_MANUAL' });
          await this.clientsService.create(client);
        } else {
          client.updateProfile({ address: data.direccion || client.address });
        }

        // 2. Procesar el Pedido a través del Sales Agent
        const response = await this.salesAgent.handleRequest({
          from: 'orchestrator' as any,
          to: 'sales-agent' as any,
          action: 'register_prepaid',
          data: { items: data.items },
          context: {
            clientId: client.id,
            lastMessage: message.content,
            orderId: `MAN-${Date.now().toString().slice(-6)}`
          }
        });

        if (response.status === 'SUCCESS') {
          // 3. Formatear Confirmación
          const itemsList = data.items.map((i: any) => `- ${i.quantity}x ${i.product}`).join('\n');
          const confirmation = Message.create({
            content: `✅ **¡Pedido Registrado con Éxito!** 🚀\n\n👤 **Cliente:** ${data.nombre || 'N/A'}\n📞 **Cel:** ${data.celular || 'N/A'}\n📍 **Dirección:** ${data.direccion || 'N/A'}\n\n🛒 **Detalle:**\n${itemsList}\n\n📦 El stock ha sido descontado y el pedido anotado en la Lista de Prepago del Sheets.`,
            role: 'assistant',
            channel: 'telegram-orders'
          });
          await replyCallback(confirmation);
        } else {
          throw new Error(response.data?.message || 'Error desconocido en SalesAgent');
        }
      } catch (error) {
        this.logger.error(`❌ Error procesando pedido manual: ${error.message}`);
        await replyCallback(Message.create({
          content: `❌ **Error al procesar el pedido:**\n${error.message}\n\nPor favor intente nuevamente con un formato más claro.`,
          role: 'assistant',
          channel: 'telegram-orders'
        }));
      }
      await presenceCallback(false);
      return;
    }

    // MEJORA: Búsqueda de Identidad Unificada (Celular + LID técnico)
    const metadata = message.metadata || {};
    const pushName = metadata.pushName || '';
    const cleanPhone = metadata.phone || senderId.split('@')[0].replace(/[^0-9]/g, '');
    const currentLid = metadata.lid || (senderId.includes('@lid') ? senderId.split(' ')[0].trim() : undefined);
    
    // Intentar encontrar al cliente por LID primero, luego por Teléfono
    let client: Client | null = null;
    if (currentLid) {
      client = await this.clientsService.findByLid(currentLid);
    }
    if (!client && cleanPhone) {
      client = await this.clientsService.findByPhone(cleanPhone);
    }
    if (!client) {
      client = await this.clientsService.findOne(cleanPhone);
    }

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
      // Usamos el teléfono como ID primario si lo tenemos, si no el LID prefix
      const primaryId = cleanPhone || (currentLid ? currentLid.split('@')[0] : senderId.split('@')[0]);
      client = Client.create(primaryId, initialName, cleanPhone, currentLid);
      
      if (message.content.includes('Vengo de su página de enlaces')) {
        client.updateProfile({ registrationSource: 'LINK_PAGE' });
      }
      await this.clientsService.create(client);
      this.logger.log(
        `👤 Nuevo cliente registrado: ${initialName} (${cleanPhone}) | LID: ${currentLid || 'N/A'}`,
      );
    } else {
      // Actualizar LID o Teléfono si no estaban presentes para vincular identidades
      let needsUpdate = false;
      if (currentLid && client.lid !== currentLid) {
        client.updateProfile({ lid: currentLid });
        needsUpdate = true;
      }
      if (cleanPhone && client.phone !== cleanPhone && !client.phone.includes('@lid')) {
        // Solo actualizar si el teléfono guardado era un LID prefix y ahora tenemos el real
        client.updateProfile({ phone: cleanPhone });
        needsUpdate = true;
      }
      
      const currentIsGeneric = genericNames.includes(client.name);
      const newIsReal = !genericNames.includes(pushName);
      if (currentIsGeneric && newIsReal) {
        client.updateName(pushName);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await this.clientsService.create(client);
        this.logger.log(`🔄 Identidad de cliente actualizada: ${client.name} (${client.phone})`);
      }
    }

    const clientId = client.id;
    // LIMPIEZA DE SENDER ID (Por si trae ruidos de sistema)
    const cleanSenderId = senderId.split(' ')[0].trim();
    const sessionClientId = client.phone || cleanSenderId;

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

    let session = await this.sessionsService.findActiveByClientId(sessionClientId);
    
    if (!session) {
      session = Session.create({
        clientId: sessionClientId,
        agentId: 'fresco-consultor',
      });
      const lastSession =
        await this.sessionsService.findLastByClientId(sessionClientId);
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

    // INTERCEPCIÓN DE FLUJO PRIORITARIA: Si hay un estado pendiente, procesarlo y CORTAR el flujo aquí
    if (
      session.flowState !== 'IDLE' &&
      session.flowState !== 'AWAITING_ORDER' &&
      session.flowState !== 'AWAITING_WAITLIST_CONFIRMATION'
    ) {
      this.logger.log(`⏳ Procesando flujo activo: ${session.flowState} para ${client.name}`);
      const formResponse = await this.handleFormFlow(
        message,
        client,
        session,
        sessionClientId,
        replyCallback,
        presenceCallback,
      );
      if (formResponse) return;
    }

    // NUEVA INTERCEPCIÓN: Lista de espera (No corta el flujo si el usuario sigue pidiendo cosas, pero maneja la confirmación)
    if (session.flowState === 'AWAITING_WAITLIST_CONFIRMATION') {
       const formResponse = await this.handleFormFlow(
        message,
        client,
        session,
        sessionClientId,
        replyCallback,
        presenceCallback,
      );
      if (formResponse) return;
    }

    this.logger.log(`🧠 PASO A2A: Delegando al Cerebro...`);
    session.addMessage(message);

    // 1. DETECCIÓN POR CÓDIGO O NÚMERO (Selección guiada)
    const content = message.content.toLowerCase().trim();
    const availableProducts = session.metadata?.lastAvailableProducts || [];
    const selectionMatch = message.content.trim().match(/^(\d+|[A-Z]\d+)(\s*x\s*\d+)?$/i);
    const catalogOrderPrefix = '*¡nuevo pedido del catálogo!*';
    
    let effectiveMessage = message;
    let isCatalogOrder = content.includes(catalogOrderPrefix) || !!message.metadata?.orderItems;

    // --- ESTRATEGIA ZERO TOKEN: Saludo inicial sin IA ---
    const userMessages = session.history.filter(m => m.role === 'user');
    const isFirstContact = userMessages.length === 1;
    const isLandingPage = content.includes('vengo de su página de enlaces');
    const isVeryShort = content.split(' ').length < 2;

    if (isFirstContact && !isCatalogOrder && !isLandingPage && session.flowState === 'IDLE' && isVeryShort) {
      this.logger.log(`🚀 Zero Token: Primer contacto real detectado. Enviando saludo fijo.`);
      const fixedGreeting = Message.create({
        content: `¡Hola sumercé! Qué bueno verlo por acá. Por favor haga su pedido por el *Catálogo* que encuentra aquí arribita. ⬆️👆\n\n¡Es más fácil y rápido! Pero si prefiere por aquí, con gusto lo atiendo. ¿Qué se le antoja llevar hoy?`,
        role: 'assistant',
        channel: message.channel,
      });
      await presenceCallback(false);
      session.addMessage(fixedGreeting);
      await this.sessionsService.update(session);
      await replyCallback(fixedGreeting);
      return;
    }

    // REINICIO POR CATÁLOGO: Si el cliente manda un catálogo, borramos el carrito anterior y el ID previo
    if (isCatalogOrder) {
      this.logger.log(`🔄 Reiniciando sesión para nuevo pedido de catálogo de ${client.name}`);
      session.metadata = session.metadata || {};
      session.metadata.currentOrderItems = [];
      session.metadata.currentOrderId = null;
      session.metadata.registeredInPrepago = false; // Reset de la bandera
      await this.sessionsService.update(session);
    }

    if (selectionMatch && availableProducts.length > 0) {
      // ... (existing code for selectionMatch)
    }

    let intent = 'INTENT_QUESTION'; // Default
    let agentFact: any = {};

    if (isCatalogOrder) {
      this.logger.log(`🎯 Pedido de catálogo detectado. Saltando clasificación IA.`);
      intent = 'INTENT_BUY';
    } else {
      const brainResponse = await this.knowledgeAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'knowledge-agent',
        action: 'classify_intent',
        context: { clientId: clientId, lastMessage: effectiveMessage.content },
        data: { history: session.history },
      });
      intent = brainResponse.data.intent;
    }
    
    // 2. DETECCIÓN DETERMINISTA (Pre-filtro y Correctores)
    const currentOrderItems = session.metadata?.currentOrderItems || [];
    
    // A. Búsqueda de Alias y Patrones de compra
    const aliasRegex = /\d+\s*(TIL|HJUM|HGR|FRE|MOR|FRA|UCH|TCH|ARAP|ARAM|ARAG|KIT|ARE)|(TIL|HJUM|HGR|FRE|MOR|FRA|UCH|TCH|ARAP|ARAM|ARAG|KIT|ARE)\s*x\s*\d+/i;
    const foodRegex = /\d+\s*(tilapia|huevo|mora|fresa|arandano|frambuesa|kilo|libra|caja|bandeja|bolsa|unidad|uds|unidades)/i;
    const directBuyKeywords = /quiero|necesito|mande|traiga|anóteme|anoteme|póngame|pongame|deme/i;
    
    // B. Búsqueda de Total / Cuenta y Confirmaciones
    const totalRegex = /total|la cuenta|cuánto es|cuanto es|cuánto vale|cuanto vale|valor|pago|pagar|liquida/i;
    const confirmationKeywords = /^(ok|si|sí|dale|hágale|hagale|listo|perfecto|confirmado|es correcto|está bien|esta bien|proceda|dele)$/i;

    // C. REGLA DE ORO: Si hay un pedido activo, NO permitimos que sea GREETING
    if (intent.includes('INTENT_GREETING') && currentOrderItems.length > 0) {
      intent = 'INTENT_ORDER_PROCESS';
    }

    if (isCatalogOrder || aliasRegex.test(effectiveMessage.content) || foodRegex.test(effectiveMessage.content)) {
       intent = 'INTENT_BUY';
    }

    this.logger.log(`   > Intención final: ${intent}`);
    agentFact.intent = intent;

    if (intent.includes('INTENT_ORDER_PROCESS') || (intent.includes('INTENT_BUY') && (currentOrderItems.length > 0 || isCatalogOrder))) {
      agentFact.items = currentOrderItems;
      if (totalRegex.test(content)) {
        agentFact.forceBilling = true;
      }
    }
    
    // --- BYPASS DE PROCESAMIENTO IA SI ES PEDIDO DIRECTO ---
    if (intent === 'INTENT_BUY' || intent === 'INTENT_ORDER_PROCESS') {
      // CARGAR CONFIGURACIÓN (Domicilio) SIEMPRE PARA PEDIDOS
      const invConfigResponse = await this.inventoryAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'inventory-agent',
        action: 'get_config' as any, 
        context: { clientId },
      });
      
      const config = invConfigResponse.data || {};
      const rawFee = config['COSTO_DOMICILIO'] || '0';
      const globalDeliveryFee = parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 0;

      const salesResponse = await this.delegateToSales(
        effectiveMessage,
        clientId,
        session,
        client,
        totalRegex.test(content) || isCatalogOrder // Forzar liquidación si es catálogo
      );

      // SI EL ADK YA GENERÓ UNA RESPUESTA, USARLA (Respetar personalidad y lógica de Python)
      if (salesResponse.data.phase === 'ADK_MANAGED' && salesResponse.data.content) {
        this.logger.log(`🧠 Usando respuesta generada por ADK Core.`);
        
        const reply = Message.create({
          content: salesResponse.data.content,
          role: 'assistant',
          channel: message.channel
        });
        
        await presenceCallback(false);
        session.addMessage(reply);
        
        // Sincronizar estado para esperar pago
        session.setFlowState('AWAITING_PAYMENT_PROOF');
        session.metadata = session.metadata || {};
        session.metadata.currentOrderItems = salesResponse.data.items || message.metadata?.orderItems || session.metadata.currentOrderItems || [];
        
        // Aún así, si es catálogo, registramos en prepago en segundo plano
        if (isCatalogOrder && !session.metadata?.registeredInPrepago) {
            this.logger.log(`✅ Registrando pedido de catálogo en segundo plano (vía ADK response)...`);
            const itemsToRegister = session.metadata.currentOrderItems;
            const orderId = session.metadata?.currentOrderId || `ORD-${Date.now().toString().slice(-6)}`;
            
            try {
              await this.salesAgent.handleRequest({
                from: 'fresquitoh-orchestrator',
                to: 'fulfillment-agent' as any,
                action: 'register_prepaid',
                context: { clientId: client.id, orderId },
                data: { items: itemsToRegister },
              });
              session.metadata.registeredInPrepago = true;
              session.metadata.currentOrderId = orderId;
              session.metadata.orderDate = new Date().toISOString();
            } catch (e: any) {
              this.logger.error(`❌ Error en registro background: ${e.message}`);
            }
        }

        await this.sessionsService.update(session);
        await replyCallback(reply);
        return;
      }

      // RESPUESTA DIRECTA (TEMPLATE) SOLO SI NO ES ADK_MANAGED
      if (salesResponse.data.phase === 'BILLING' || isCatalogOrder) {
        const externalTotal = Number(message.metadata?.externalTotal || 0);
        const salesSubtotal = Number(salesResponse.data.subtotal || 0);
        
        // PRIORIDAD: Si la IA no encontró precios pero el catálogo sí los trae, usar catálogo
        const subtotal = (salesSubtotal > 0) ? salesSubtotal : externalTotal;
        const globalFee = globalDeliveryFee;
        const deliveryFee = Number(salesResponse.data.deliveryFee || globalFee);
        
        // Calcular el total de forma consistente
        const total = subtotal + deliveryFee;
        
        const itemsToDisplay = salesResponse.data.items || [];
        const orderId = session.metadata?.currentOrderId || `ORD-${Date.now().toString().slice(-6)}`;
        
        // PERSISTENCIA CONSOLIDADA
        session.metadata = session.metadata || {};
        session.metadata.currentOrderId = orderId;
        session.metadata.total = total;
        session.metadata.deliveryFee = deliveryFee;
        session.metadata.currentOrderItems = itemsToDisplay.length > 0 ? itemsToDisplay : (message.metadata?.orderItems || []);
        await this.sessionsService.update(session);

        let paymentMsg = `*¡Pedido Recibido Sumercé!* 🛒\n\n`;
        
        if (itemsToDisplay.length > 0) {
          paymentMsg += `*Desglose de su pedido:* \n`;
          itemsToDisplay.forEach((i: any) => {
            const name = i.product || i.productName || 'Producto';
            const qty = i.quantity || i.unitsNeeded || 1;
            const price = i.totalPrice || 'Pendiente';
            paymentMsg += `- ${qty}x ${name} ($${price})`;
            if (i.isPartial) {
               paymentMsg += ` _(Sumercé, solo alcancé a guardarle ${qty} de las ${i.originalRequestedQuantity} que quería)_`;
            }
            if (i.isWaitlist) {
               paymentMsg += ` _(Agotado por hoy, sumercé)_`;
            }
            paymentMsg += `\n`;
          });
        } else if (isCatalogOrder && message.metadata?.orderItems) {
           // Fallback si delegateToSales no devolvió items pero los tenemos en metadata
           paymentMsg += `*Desglose de su pedido:* \n`;
           message.metadata.orderItems.forEach((i: any) => {
             paymentMsg += `- ${i.quantity}x ${i.product} ($${i.price || 'N/A'})\n`;
           });
        } else if (isCatalogOrder) {
          paymentMsg += `_(Sumercé, recibí su pedido del catálogo por un valor de $${subtotal})_\n`;
        }

        paymentMsg += `\n*Subtotal:* $${subtotal}\n`;
        paymentMsg += `*Domicilio:* $${deliveryFee}\n`;
        paymentMsg += `*TOTAL A PAGAR:* $${total}\n\n`;

        // REGISTRO AUTOMÁTICO EN PREPAGO SI ES CATÁLOGO (Omitir confirmación manual)
        if (isCatalogOrder && (itemsToDisplay.length > 0 || message.metadata?.orderItems)) {
          // EVITAR DUPLICADOS: Solo registrar si no ha sido registrado ya en esta sesión
          if (!session.metadata?.registeredInPrepago) {
            this.logger.log(`✅ Registrando pedido de catálogo automáticamente en lista de prepago para ${client.name} con ID: ${orderId}`);

            const finalItems = itemsToDisplay.length > 0 ? itemsToDisplay : message.metadata?.orderItems;
            try {
              await this.salesAgent.handleRequest({
                from: 'fresquitoh-orchestrator',
                to: 'fulfillment-agent' as any,
                action: 'register_prepaid',
                context: { clientId: client.id, orderId },
                data: { items: finalItems },
              });
              // Mensaje limpio y directo
              paymentMsg += `✅ *Pedido registrado con éxito (ID: ${orderId}).*\n\n`;
              
              // BANDERA DE CONTROL: Marcar como registrado en lugar de borrar los items
              session.metadata.registeredInPrepago = true;
              await this.sessionsService.update(session);
            } catch (e: any) {
              this.logger.error(`❌ Error en registro automático de catálogo: ${e.message}`);
            }
          } else {
            this.logger.log(`ℹ️ El pedido ${orderId} ya estaba registrado en prepago. Omitiendo duplicado.`);
            paymentMsg += `✅ *Su pedido (ID: ${orderId}) sigue en proceso de validación.*\n\n`;
          }
        }

        if (salesResponse.data.hasStockIssues) {
           paymentMsg += `⚠️ *Sumercé, como vio arribita, no me alcanzó para todo lo que pidió.* ¿Quiere que le anote lo que faltó en la lista de cosecha para avisarle apenas tengamos más? (Dígame *Sí* o *No*)\n\n`;
        }

        paymentMsg += `🏦 *MEDIOS DE PAGO DISPONIBLES:*\n`;
        paymentMsg += `1. *Transferencia Bancolombia:* Ahorros 571 000051 61\n`;
        paymentMsg += `2. *Pago por Llave (Bre-B):* @frescoh\n`;
        paymentMsg += `3. *Código QR:* (A continuación se lo comparto sumercé)\n\n`;
        paymentMsg += `Apenas realice el paguito, por favor me manda el comprobante por aquí mismo para agendar su entrega. ¡Muchas gracias! [SEND_QR]`;

        const reply = Message.create({
          content: paymentMsg,
          role: 'assistant',
          channel: message.channel
        });
        
        await presenceCallback(false);
        session.addMessage(reply);
        
        // GESTIÓN DE ESTADOS: Prioridad a la lista de espera si hay problemas, sino a comprobante
        if (salesResponse.data.hasStockIssues) {
           session.setFlowState('AWAITING_WAITLIST_CONFIRMATION');
           // Guardar que venimos de un catálogo para volver a AWAITING_PAYMENT_PROOF después
           session.metadata.pendingPaymentProof = true;
        } else if (isCatalogOrder) {
          session.setFlowState('AWAITING_PAYMENT_PROOF');
        }

        await this.sessionsService.update(session);
        await replyCallback(reply);
        return;
      }
    }

    // (El resto del código para casos que no son compra directa)
    if (agentFact.intent.includes('INTENT_GREETING')) {
      this.logger.log(`👋 Preparando saludo con cosecha.`);
      const invResponse = await this.inventoryAgent.handleRequest({
        from: 'fresquitoh-orchestrator',
        to: 'inventory-agent',
        action: 'get_available_list',
        context: { clientId: clientId },
      });
      const products = invResponse.data.availableProducts || [];
      // Enriquecer con índice para selección numérica
      agentFact.availableProducts = products.map((p: any, idx: number) => ({ ...p, index: idx + 1 }));
      
      // Persistir en sesión para permitir selección por número/código en el siguiente turno
      session.metadata = { 
        ...session.metadata, 
        lastAvailableProducts: agentFact.availableProducts 
      };
      await this.sessionsService.update(session);
    } else if (
      intent.includes('INTENT_CHECK_INVENTORY') ||
      intent.includes('INTENT_BUY') ||
      intent.includes('INTENT_ORDER_PROCESS')
    ) {
      const isLandingPage = effectiveMessage.content.includes(
        'Vengo de su página de enlaces',
      );
      const isGeneral =
        isLandingPage ||
        (/qué.*tienes|productos|stock|cosecha|vendes|disponible|lista|tipo de productos|para esta semana/i.test(
          effectiveMessage.content,
        ) &&
          effectiveMessage.content.length < 150);

      if (isGeneral && !this.checkIfConfirmation(effectiveMessage.content)) {
        this.logger.log(`📋 Consulta general de stock detectada.`);
        const invResponse = await this.inventoryAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'inventory-agent',
          action: 'get_available_list',
          context: { clientId: clientId },
        });
        const products = invResponse.data.availableProducts || [];
        agentFact.availableProducts = products.map((p: any, idx: number) => ({ ...p, index: idx + 1 }));
        
        session.metadata = { 
          ...session.metadata, 
          lastAvailableProducts: agentFact.availableProducts 
        };
        await this.sessionsService.update(session);
      } else {
        const totalRegex = /total|la cuenta|cuánto es|cuanto es|cuánto vale|cuanto vale|valor|pago|pagar/i;
        const isTotalRequest = totalRegex.test(content) && content.length < 30;

        const salesResponse = await this.delegateToSales(
          effectiveMessage,
          clientId,
          session,
          client,
          isTotalRequest // Pasamos la detección aquí
        );

        // --- MANEJO ADK ---
        if (salesResponse.data?.phase === 'ADK_MANAGED') {
          const reply = Message.create({
            content: salesResponse.data.content,
            role: 'assistant',
            channel: message.channel,
          });
          await presenceCallback(false);
          session.addMessage(reply);
          await this.sessionsService.update(session);
          await replyCallback(reply);
          return;
        }

        // Priorizar el estado de la venta sobre la intención original
        agentFact = { 
          ...salesResponse.data, 
          status: salesResponse.status,
          intent: salesResponse.status === 'SUCCESS' || salesResponse.status === 'REQUIRES_USER_INPUT' ? 'INTENT_ORDER_PROCESS' : intent 
        };

        if ((salesResponse.status === 'SUCCESS' || salesResponse.status === 'REQUIRES_USER_INPUT') && salesResponse.data.items) {
          session.metadata = {
            ...session.metadata,
            currentOrderItems: salesResponse.data.items.filter((i: any) => !i.error),
            deliveryFee: salesResponse.data.deliveryFee || session.metadata?.deliveryFee,
            deliveryDate: salesResponse.data.deliveryDate || session.metadata?.deliveryDate,
            total: salesResponse.data.total || session.metadata?.total,
          };

          if (salesResponse.data.phase === 'BILLING') {
            session.setFlowState('AWAITING_PAYMENT_METHOD');
          }

          // ACTIVACIÓN DE LISTA DE ESPERA: Si hay problemas de stock, pedimos confirmación
          if (salesResponse.data.hasStockIssues && session.flowState === 'IDLE') {
            this.logger.log(`⚠️ Detectadas incidencias de stock. Activando confirmación de lista de espera.`);
            session.setFlowState('AWAITING_WAITLIST_CONFIRMATION');
          }

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
    
    // OPTIMIZACIÓN: Solo enviar availableProducts si el intent es de inventario o saludo
    const optimizedFacts = { ...agentFact };
    const isInventoryQuery = intent.includes('INTENT_CHECK_INVENTORY') || 
                            (intent.includes('INTENT_GREETING') && (!agentFact.items || agentFact.items.length === 0));
    
    if (!isInventoryQuery && optimizedFacts.availableProducts) {
      this.logger.log(`✂️ Optimizando tokens: Eliminando catálogo de 'facts' (No es consulta de inventario)`);
      delete optimizedFacts.availableProducts;
    }

    const voiceResponse = await this.voiceAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'fulfillment-agent' as any,
      action: 'synthesize',
      context: {
        clientId: clientId,
        clientName: client.name,
        emotion: session.emotionalState,
      },
      data: { facts: optimizedFacts, history: session.history.slice(-10) },
    });

    const replyContent = voiceResponse.data.content;
    const replyMetadata: any = {};

    // Inyectar interactividad mínima o nula (basado en catálogo por códigos)
    // Se eliminan Polls y Botones por falta de compatibilidad en cuentas estándar

    const replyMessage = Message.create({
      content: replyContent,
      role: 'assistant',
      channel: message.channel,
      metadata: replyMetadata
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
    forceBilling: boolean = false,
  ): Promise<any> {
    const invResponse = await this.inventoryAgent.handleRequest({
      from: 'fresquitoh-orchestrator',
      to: 'inventory-agent',
      action: 'get_available_list',
      context: { clientId },
    });
    const available = invResponse.data.availableProducts || [];

    let items: any[] = [];
    const isCatalog = message.content.toLowerCase().includes('*¡nuevo pedido del catálogo!*');
    
    // MEJORA: Si el mensaje ya trae orderItems estructurados (desde WhatsAppAdapter), usarlos directamente
    if (message.metadata?.orderItems && message.metadata.orderItems.length > 0) {
      this.logger.log(`📦 Usando items estructurados recibidos del canal (${message.metadata.orderItems.length} items)`);
      items = message.metadata.orderItems;
    } else if (!forceBilling || isCatalog) {
      // Si NO estamos forzando factura, o es un pedido de catálogo que necesita extracción de texto
      const extractionPrompt = Message.create({
        content: `
        Eres un experto en extracción de datos para la tienda "Frescoh!".
        Tu misión es extraer productos del mensaje del cliente en un formato JSON estricto.

        PRODUCTOS DE REFERENCIA (CATÁLOGO POR CÓDIGOS Y NÚMEROS):
        ${available.map((p: any) => `${p.index}. ${p.code}. ${p.name}`).join('\n')}

        REGLAS DE EXTRACCIÓN:
        1. PRIORIDAD MÁXIMA: Si el cliente usa el NÚMERO DE ÍNDICE o el CÓDIGO (ej: "2 de la 1" o "2 de la T1"), extrae el producto asociado.
        2. Si el mensaje contiene un "pedido del catálogo", busca la sección "Detalle del pedido" y extrae productos y cantidades.
        3. Si no hay números/códigos claros, intenta por nombre de producto como respaldo.
        4. Extrae la cantidad numérica explícita. Si no hay, asume 1.
        5. Ignora saludos y charla innecesaria.
        6. Formato: [{"product": "Nombre Real del Producto", "quantity": numero, "unit": "unidad/caja/bandeja"}]

        Ejemplo:
        Usuario: "quiero 2 de la 1 y una caja de la T2"
        Salida: [{"product": "Tilapia", "quantity": 2, "unit": "unidad"}, {"product": "Huevos Jumbo", "quantity": 1, "unit": "caja"}]
        `.trim(),
        role: 'system',
        channel: 'system',
      });

      let extraction;
      try {
        extraction = await this.aiService.getResponse([
          ...session.history.slice(-10),
          extractionPrompt,
        ], 'product_extraction');
        
        const content = extraction.content.trim();
        const jsonMatch = content.match(/\[.*\]/s);
        if (jsonMatch) {
          items = JSON.parse(jsonMatch[0]);
          items = items.filter((i) => i && i.product && i.product.length > 2);
        }
      } catch (e: any) {
        this.logger.error(`❌ Error crítico en extracción IA: ${e.message}`);
      }

      // Fallback: Si sigue vacío y NO es confirmación, solo entonces intentar con el texto plano
      if (items.length === 0 && !this.checkIfConfirmation(message.content)) {
        if (message.content.length > 3 && !message.content.includes('Hola')) {
          items = [{ product: message.content, quantity: 1, unit: 'unidad' }];
        }
      }
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
        currentCart: session.metadata?.currentOrderItems || [],
        forceBilling, // Pasamos el flag aquí
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
      low.includes('cuanto es') ||
      low.includes('cuanto vale') ||
      low.includes('listo') ||
      low.includes('dale') ||
      low.includes('de una') ||
      low.includes('perfecto') ||
      low.includes('así está bien') ||
      low.includes('la cuenta') ||
      low.includes('total') ||
      low.includes('valor')
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
    sessionClientId: string,
    replyCallback: any,
    presenceCallback: any,
  ): Promise<boolean> {
    if (session.flowState === 'AWAITING_WAITLIST_CONFIRMATION') {
      const choice = message.content.toLowerCase();
      const isYes = choice.includes('si') || choice.includes('sí') || choice.includes('bueno') || choice.includes('dale') || choice.includes('anóteme') || choice.includes('anoteme');
      const isNo = choice.includes('no') || choice.includes('deja así') || choice.includes('deja asi') || choice.includes('después');

      if (isYes) {
        this.logger.log(`📝 Registrando items en lista de espera para ${client.name}`);
        const orderItems = session.metadata?.currentOrderItems || [];
        const waitlistItems = orderItems.filter((i: any) => i.isWaitlist || i.isPartial);
        
        if (waitlistItems.length > 0) {
          const waitlistOrder = Order.create({
            clientId: client.id,
            agentId: 'inventory-agent',
            items: waitlistItems.map((i: any) => ({
              productId: i.productId || i.product,
              name: i.productName || i.product,
              quantity: i.isPartial ? (i.originalRequestedQuantity - i.availableQuantity) : i.quantity,
              price: i.pricePerUnit || 0,
            })),
          });
          await this.inventoryProvider.registerWaitlistOrder(waitlistOrder, client);
        }
      }

      if (isYes || isNo) {
        if (session.metadata?.pendingPaymentProof) {
           session.setFlowState('AWAITING_PAYMENT_PROOF');
           delete session.metadata.pendingPaymentProof;
        } else {
           session.setFlowState('IDLE');
        }
        await this.sessionsService.update(session);
        
        const text = isYes 
          ? '¡Listo sumercé! Ya lo anoté en mi lista de cosecha para avisarle apenas tengamos más. ¿Desea algo más o ya le saco la cuenta?'
          : 'Entendido sumercé, no se preocupe. ¿Desea añadir algo más o ya le liquido el pedido con lo que hay?';
          
        await presenceCallback(false);
        await replyCallback(Message.create({ content: text, role: 'assistant', channel: message.channel }));
        return true;
      }
    }

    if (session.flowState === 'AWAITING_BULK_DATA') {
      this.logger.log(`📊 Extrayendo datos masivos de ${client.name}...`);
      
      const extractionPrompt = Message.create({
        content: `
        Eres un extractor de datos de clientes para la tienda "Frescoh!".
        Tu misión es extraer los datos de facturación del mensaje del cliente y devolverlos en un JSON plano.

        REGLAS:
        1. "fullName": El nombre completo o razón social.
        2. "documentNumber": La cédula o NIT (solo números).
        3. "address": La dirección física de entrega completa.
        4. "email": El correo electrónico del cliente.
        5. "documentType": Si detectas que es CC, NIT, CE o PP, ponlo aquí. Por defecto CC.
        6. Responde ÚNICAMENTE con el objeto JSON.
        7. IMPORTANTE: La ciudad siempre será "Bogotá" a menos que el cliente indique explícitamente otra muy diferente.

        Mensaje del cliente: "${message.content}"
        `.trim(),
        role: 'system',
        channel: 'system',
      });

      try {
        const extraction = await this.aiService.getResponse([extractionPrompt], 'customer_data_extraction');
        const content = extraction.content.trim();
        const jsonMatch = content.match(/\{.*\}/s);
        
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          
          // Actualización incremental (Solo lo que venga en el JSON)
          client.updateProfile({
            fullName: data.fullName || client.fullName,
            documentNumber: data.documentNumber || client.documentNumber,
            documentType: data.documentType || client.documentType || 'CC',
            address: data.address || client.address,
            city: 'Bogotá',
            email: data.email || client.email
          });
          await this.clientsService.create(client);
          
          // Verificar si ya tenemos el "triunvirato + email" de datos (Nombre, Documento, Dirección, Email)
          const isNowComplete = !!(client.fullName && client.documentNumber && client.address && client.email);

          if (isNowComplete) {
            this.logger.log(`✅ Datos completados para ${client.name}. Finalizando registro de pedido.`);

            if (session.metadata?.pendingDeliveryRegistration) {
              const orderId = session.metadata.pendingDeliveryRegistration.orderId;
              const prepaidOrder = await this.inventoryProvider.getPrepaidOrderDetails(orderId);
              
              if (prepaidOrder) {
                const order = Order.create({
                  id: prepaidOrder.id,
                  clientId: client.id,
                  agentId: 'sales-agent',
                  items: prepaidOrder.items,
                  deliveryFee: session.metadata.deliveryFee || 0,
                  total: session.metadata.total || 0,
                });
                
                await this.inventoryProvider.registerDeliveryOrder(order, client);
                await this.inventoryProvider.removeFromPrepaidList(orderId);
                
                const config = await this.inventoryProvider.getConfig();
                const deliveryDate = this.calculateDeliveryDate(prepaidOrder.items, config);

                await presenceCallback(false);
                await replyCallback(Message.create({
                  content: `¡Todo listo don *${client.fullName || client.name}*! Ya tengo sus datos completos y su pedido agendado para el día *${deliveryDate}*. Pronto le avisaremos cuando salga el camión. ¡Muchas gracias!`,
                  role: 'assistant',
                  channel: message.channel
                }));
              }
            }

            session.setFlowState('IDLE');
            if (session.metadata) {
              delete session.metadata.pendingDeliveryRegistration;
            }
            await this.sessionsService.update(session);
            return true;
          } else {
            // FALTAN DATOS: Ser amable y pedir solo lo que falta
            this.logger.log(`⚠️ Datos parciales recibidos de ${client.name}. Pidiendo faltantes.`);
            let missing: string[] = [];
            if (!client.fullName) missing.push('Nombre Completo');
            if (!client.documentNumber) missing.push('Cédula/NIT');
            if (!client.address) missing.push('Dirección');
            if (!client.email) missing.push('Email');

            await replyCallback(Message.create({
              content: `¡Muchas gracias sumercé! Ya anoté una parte. Solo me faltaría el dato de: *${missing.join(', ')}* para terminar de agendar su cosecha.`,
              role: 'assistant',
              channel: message.channel
            }));
            return true;
          }
        }
      } catch (e: any) {
        this.logger.error(`❌ Error en extracción masiva: ${e.message}`);
      }
      
      await replyCallback(Message.create({
        content: '¡Ay sumercé! Me confundí un poco. ¿Podría repetirme los datos (Nombre, Cédula, Dirección y Ciudad)? Es para que la factura le llegue bien clarita.',
        role: 'assistant',
        channel: message.channel
      }));
      return true;
    }

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

    if (session.flowState === 'AWAITING_PAYMENT_METHOD') {
      const low = message.content.toLowerCase();
      if (
        low.includes('nequi') ||
        low.includes('bancolombia') ||
        low.includes('ahorros') ||
        low.includes('transferencia')
      ) {
        const method = low.includes('nequi') ? 'Nequi' : 'Bancolombia';
        const account = method === 'Nequi' ? '312 456 7890' : '123-456789-01';

        session.setFlowState('AWAITING_E_BILLING_CHOICE');
        await this.sessionsService.update(session);

        await presenceCallback(false);
        await replyCallback(
          Message.create({
            content: `¡Listo sumercé! Para su pago por *${method}*, la cuenta es:\n\n*Número:* ${account}\n\n¡Apenas tenga el soporte me lo manda por aquí mismo! Por cierto sumercé, ¿desea factura electrónica para su compra?`,
            role: 'assistant',
            channel: message.channel,
          }),
        );
        return true;
      }
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
      session.setFlowState('AWAITING_CITY');
      await this.clientsService.create(client);
      await this.sessionsService.update(session);
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            '¿En qué ciudad o municipio se encuentra sumercé?',
          role: 'assistant',
          channel: message.channel,
        }),
      );
      return true;
    }

    if (session.flowState === 'AWAITING_CITY') {
      client.updateProfile({ city: message.content });
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
      await this.clientsService.create(client);

      // Asegurar que metadata existe
      session.metadata = session.metadata || {};

      // CASO ESPECIAL: El pedido ya fue pagado y aprobado, solo faltaban datos
      if (session.metadata.pendingDeliveryRegistration) {
        const orderId = session.metadata.pendingDeliveryRegistration.orderId;
        this.logger.log(`🎊 Finalizando pedido aprobado ${orderId} tras completar datos.`);
        
        try {
          const prepaidOrder = await this.inventoryProvider.getPrepaidOrderDetails(orderId);
          if (prepaidOrder) {
             const order = Order.create({
               id: prepaidOrder.id,
               clientId: client.id,
               agentId: 'sales-agent',
               items: prepaidOrder.items,
               deliveryFee: session.metadata.deliveryFee || 0,
               total: session.metadata.total || 0,
             });
             
             await this.inventoryProvider.registerDeliveryOrder(order, client);
             await this.inventoryProvider.removeFromPrepaidList(orderId);
             
             await presenceCallback(false);
             await replyCallback(Message.create({
               content: `¡Todo listo don *${client.name}*! Ya tengo sus datos completos y su pedido agendado para despacho. Pronto le avisaremos cuando salga el camión. ¡Muchas gracias!`,
               role: 'assistant',
               channel: message.channel
             }));
          }
        } catch (e: any) {
          this.logger.error(`❌ Error finalizando pedido tras datos: ${e.message}`);
        }
        
        session.setFlowState('IDLE');
        delete session.metadata.pendingDeliveryRegistration;
        await this.sessionsService.update(session);
        return true;
      }

      // FLUJO NORMAL: Pedir comprobante de pago
      session.setFlowState('AWAITING_PAYMENT_PROOF');

      // Asegurar que exista un ID
      if (!session.metadata.currentOrderId) {
         session.metadata.currentOrderId = `ORD-${Date.now().toString().slice(-6)}`;
      }
      const orderId = session.metadata.currentOrderId;

      await this.sessionsService.update(session);

      try {
        const items = session.metadata?.currentOrderItems || [];
        await this.salesAgent.handleRequest({
          from: 'fresquitoh-orchestrator',
          to: 'fulfillment-agent' as any,
          action: 'register_prepaid',
          context: { clientId: client.id, orderId },
          data: { items },
        });
      } catch (e: any) {
        this.logger.error(`❌ Error registrando en prepago: ${e.message}`);
      }
      await presenceCallback(false);
      await replyCallback(
        Message.create({
          content:
            `¡Listo sumercé! Ya tengo sus datos completos y ya anoté su pedido (ID: ${orderId}) en mi libreta de "Pendientes de Pago". Por favor, envíeme el soporte de la transferencia por el valor del pedido para confirmarlo.`,
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
        
        const orderItems = session.metadata?.currentOrderItems || [];
        const deliveryFee = session.metadata?.deliveryFee || 0;
        const subtotal = orderItems.reduce((sum: number, i: any) => sum + (i.totalPrice || 0), 0);
        const total = session.metadata?.total || (subtotal + deliveryFee);

        // Garantizar que la sesión siempre tenga el ID correcto para todo el ciclo
        session.metadata = session.metadata || {};
        if (!session.metadata.currentOrderId) {
           session.metadata.currentOrderId = `ORD-${Date.now().toString().slice(-6)}`;
           await this.sessionsService.update(session);
        }

        // 1. Notificar vía Evento - La Saga se encargará de:
        // - Notificar al Admin (Telegram)
        // - Intentar validación automática (FinanceAgent)
        this.eventEmitter.emit(
          'payment.proof.submitted',
          new PaymentProofSubmittedEvent(
            session.metadata.currentOrderId,
            sessionClientId, // Unificado: usar el mismo ID de la sesión
            message.metadata?.media,
            {
              clientName: client.name,
              items: orderItems,
              subtotal,
              deliveryFee,
              total,
              channel: message.channel
            },
          ),
        );        // Feedback inmediato al cliente
        await presenceCallback(false);
        await replyCallback(Message.create({
          content: `¡Gracias sumercé! Ya recibí su soporte. Déme un momentico mientras verificamos el pago y yo le aviso apenas estemos listos para el despacho.`,
          role: 'assistant', 
          channel: message.channel
        }));

        session.setFlowState('AWAITING_ADMIN_APPROVAL');
        await this.sessionsService.update(session);
        return true;
      }
    }

    return false;
  }

  private calculateDeliveryDate(items: any[], config: Record<string, string>): string {
    let date = 'Jueves';
    
    if (config['FECHA_ENTREGA_EXACTA'] && config['FECHA_ENTREGA_EXACTA'].length > 3) {
      date = config['FECHA_ENTREGA_EXACTA'];
      this.logger.log(`📅 Usando fecha de entrega exacta desde config: ${date}`);
    } else {
      const d1 = config['DIAS_ENTREGA_1'] || 'Jueves';
      const d2 = config['DIAS_ENTREGA_2'] || 'Lunes';
      
      const now = new Date();
      const today = now.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab

      // Lógica solicitada:
      // Martes (2) o Miércoles (3) -> Entrega el Jueves (d1)
      // Viernes (5) o Sábado (6) -> Entrega el Lunes (d2)
      if (today === 2 || today === 3) {
        date = d1;
      } else if (today === 5 || today === 6) {
        date = d2;
      } else if (today === 1) {
        date = d1; // Lunes -> Jueves
      } else {
        date = d2; // Jueves o Domingo -> Lunes
      }
      
      this.logger.log(`📅 Fecha de entrega calculada: ${date} (D1: ${d1}, D2: ${d2}, Hoy: ${today})`);
    }

    // Validación final de seguridad contra valores basura como "frutas"
    if (date.toLowerCase().includes('fruta') || date.toLowerCase().includes('futra')) {
       this.logger.warn(`⚠️ Detectado valor basura en fecha de entrega: "${date}". Revirtiendo a Jueves.`);
       return 'Jueves';
    }

    return date;
  }
}
