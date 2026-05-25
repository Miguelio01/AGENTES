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
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.adkUrl = this.configService.get<string>('ADK_SALES_AGENT_URL') || 'http://localhost:8000';
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

    // 2. INTERCEPCIÓN DE FLUJOS MANUALES (Formularios/Hands)
    if (this.shouldInterceptFlow(session)) {
      this.logger.log(`⏳ Procesando flujo de formulario: ${session.flowState}`);
      const handled = await this.handleFormFlow(
        message,
        client,
        session,
        replyCallback,
        presenceCallback,
      );
      if (handled) return;
    }

    // 3. ESTRATEGIA ZERO TOKEN: Saludo inicial optimizado
    if (this.isInitialContact(session, message)) {
      return this.sendFixedGreeting(message, session, replyCallback, presenceCallback);
    }

    // 4. DELEGACIÓN AL CORE COGNITIVO (Python ADK)
    this.logger.log(`🧠 A2A CORE: Delegando razonamiento a Python ADK...`);
    
    try {
      const response = await this.callAdkCore(message, client, session);
      
      const reply = Message.create({
        content: response.reply,
        role: 'assistant',
        channel: message.channel,
      });

      // Sincronizar estado de sesión basado en metadatos de ADK
      await this.syncSessionWithCore(session, response, client, message);

      await presenceCallback(false);
      session.addMessage(message);
      session.addMessage(reply);
      await this.sessionsService.update(session);
      
      await replyCallback(reply);

      // Post-procesamiento: Registro en prepago si es pedido de catálogo
      if (message.metadata?.orderItems && !session.metadata?.registeredInPrepago) {
          await this.registerCatalogueInPrepago(message, client, session);
      }

    } catch (error) {
      this.logger.error(`❌ Error en comunicación A2A: ${error.message}`);
      await presenceCallback(false);
      await replyCallback(Message.create({
        content: '¡Ay sumercé! Me dio un vahído y no pude terminar de hablar. ¿Me repite?',
        role: 'assistant',
        channel: message.channel,
      }));
    }
  }

  private async resolveClient(message: Message, senderId: string): Promise<Client> {
    const metadata = message.metadata || {};
    const pushName = metadata.pushName || '';
    const cleanPhone = metadata.phone || senderId.split('@')[0].replace(/[^0-9]/g, '');
    const currentLid = metadata.lid || (senderId.includes('@lid') ? senderId.split(' ')[0].trim() : undefined);
    
    let client = currentLid ? await this.clientsService.findByLid(currentLid) : null;
    if (!client && cleanPhone) client = await this.clientsService.findByPhone(cleanPhone);
    if (!client) client = await this.clientsService.findOne(cleanPhone);

    if (!client) {
      const primaryId = cleanPhone || (currentLid ? currentLid.split('@')[0] : senderId.split('@')[0]);
      client = Client.create(primaryId, pushName || 'Cliente Nuevo', cleanPhone, currentLid);
      await this.clientsService.create(client);
    } else {
      // Actualización silenciosa de identidad
      let updated = false;
      if (currentLid && client.lid !== currentLid) { client.updateProfile({ lid: currentLid }); updated = true; }
      if (cleanPhone && client.phone !== cleanPhone) { client.updateProfile({ phone: cleanPhone }); updated = true; }
      if (pushName && client.name === 'Cliente Nuevo') { client.updateName(pushName); updated = true; }
      if (updated) await this.clientsService.create(client);
    }
    return client;
  }

  private async resolveSession(client: Client, senderId: string): Promise<Session> {
    const sessionClientId = client.phone || senderId.split(' ')[0].trim();
    let session = await this.sessionsService.findActiveByClientId(sessionClientId);
    if (!session) {
      session = Session.create({ clientId: sessionClientId, agentId: 'fresco-consultor' });
      await this.sessionsService.create(session);
    }
    return session;
  }

  private shouldInterceptFlow(session: Session): boolean {
    return session.flowState !== 'IDLE' && 
           session.flowState !== 'AWAITING_ORDER';
  }

  private isInitialContact(session: Session, message: Message): boolean {
    const userMsgs = session.history.filter(m => m.role === 'user');
    return userMsgs.length === 0 && message.content.length < 10 && !message.metadata?.orderItems;
  }

  private async sendFixedGreeting(message: Message, session: Session, replyCallback: any, presenceCallback: any) {
    const greeting = Message.create({
      content: `¡Hola sumercé! Qué bueno verlo por acá. Por favor haga su pedido por el *Catálogo* que encuentra aquí arribita. ⬆️👆\n\n¡Es más fácil y rápido! Pero si prefiere por aquí, con gusto lo atiendo. ¿Qué se le antoja llevar hoy?`,
      role: 'assistant',
      channel: message.channel,
    });
    await presenceCallback(false);
    session.addMessage(greeting);
    await this.sessionsService.update(session);
    await replyCallback(greeting);
  }

  private async callAdkCore(message: Message, client: Client, session: Session) {
    return (await axios.post(`${this.adkUrl}/run`, {
      user_id: client.id,
      session_id: `session-${client.id}`,
      message: message.content,
      client_id: client.id,
      order_id: session.metadata?.currentOrderId,
      items: message.metadata?.orderItems || [],
    }, { timeout: 30000 })).data;
  }

  private async syncSessionWithCore(session: Session, adkResponse: any, client: Client, message: Message) {
    const metadata = adkResponse.metadata || {};
    
    // Si el ADK detecta que estamos en fase de pago o liquidación, ajustamos el flowState
    if (adkResponse.reply.includes('[SEND_QR]') || adkResponse.reply.includes('cuenta es:')) {
      session.setFlowState('AWAITING_PAYMENT_PROOF');
    }

    // Persistir items si vienen estructurados del ADK (por si hizo extracción)
    if (metadata.items) {
      session.metadata = {
        ...session.metadata,
        currentOrderItems: metadata.items,
        currentOrderId: session.metadata?.currentOrderId || `ORD-${Date.now().toString().slice(-6)}`
      };
    }
  }

  private async registerCatalogueInPrepago(message: Message, client: Client, session: Session) {
      const orderId = session.metadata?.currentOrderId || `ORD-${Date.now().toString().slice(-6)}`;
      try {
        await this.salesAgent.handleRequest({
          from: 'orchestrator' as any,
          to: 'fulfillment-agent' as any,
          action: 'register_prepaid',
          context: { clientId: client.id, orderId },
          data: { items: message.metadata.orderItems },
        });
        session.metadata.registeredInPrepago = true;
        session.metadata.currentOrderId = orderId;
        await this.sessionsService.update(session);
        this.logger.log(`✅ Registro automático en prepago completado para ${client.name}`);
      } catch (e) {
        this.logger.error(`❌ Fallo en registro automático: ${e.message}`);
      }
  }

  // --- MÉTODOS DE FORMULARIO (HANDS) MANTENIDOS PARA CONTROL DE CANAL ---
  private async handleFormFlow(message: Message, client: Client, session: Session, replyCallback: any, presenceCallback: any): Promise<boolean> {
    // Aquí mantenemos la lógica de AWAITING_NAME, AWAITING_PAYMENT_PROOF, etc.
    // que interactúa directamente con el estado del canal (WhatsApp/Telegram).
    // NOTA: Esta lógica se simplificará en una segunda pasada.
    
    if (session.flowState === 'AWAITING_PAYMENT_PROOF') {
      const isComprobante = message.metadata?.media || message.content.toLowerCase().includes('soporte') || message.content.toLowerCase().includes('pagué');
      if (isComprobante) {
        this.logger.log(`💰 Procesando comprobante de pago de ${client.name}...`);
        
        const orderId = session.metadata?.currentOrderId || `ORD-${Date.now().toString().slice(-6)}`;
        this.eventEmitter.emit('payment.proof.submitted', new PaymentProofSubmittedEvent(
          orderId, client.phone || client.id, message.metadata?.media,
          { clientName: client.name, total: session.metadata?.total, channel: message.channel }
        ));

        await presenceCallback(false);
        await replyCallback(Message.create({
          content: `¡Gracias sumercé! Ya recibí su soporte. Déme un momentico mientras verificamos el pago y yo le aviso apenas estemos listos para el despacho.`,
          role: 'assistant', channel: message.channel
        }));

        session.setFlowState('AWAITING_ADMIN_APPROVAL');
        await this.sessionsService.update(session);
        return true;
      }
    }

    // Simplificación extrema: Si no es pago, delegamos al Core ADK para que él decida
    return false; 
  }
}
