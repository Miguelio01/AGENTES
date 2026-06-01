import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Message,
  Session,
  Client,
  PaymentProofSubmittedEvent,
  INVENTORY_PROVIDER_PORT,
} from '@agentes/domain';
import type { IInventoryProvider } from '@agentes/domain';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { InventoryAgentService } from '../agents/inventory-agent.service';
import { SalesAgentService } from '../agents/sales-agent.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class TelegramOrdersService {
  private readonly logger = new Logger(TelegramOrdersService.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly clientsService: ClientsService,
    private readonly inventoryAgent: InventoryAgentService,
    private readonly salesAgent: SalesAgentService,
    private readonly ordersService: OrdersService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  async handleMessage(
    message: Message,
    client: Client,
    session: Session,
    replyCallback: (reply: Message) => Promise<void>,
  ): Promise<boolean> {
    if (!session.metadata) session.metadata = {};
    const content = message.content.trim();
    const contentLow = content.toLowerCase();

    // Actualizar actividad de la sesión para evitar timeouts durante el wizard
    session.addMessage(message);
    await this.sessionsService.update(session);

    // 1. Comandos de Ayuda o Inicio
    if (
      contentLow.startsWith('/start') ||
      contentLow.startsWith('/ayuda') ||
      contentLow.startsWith('/help')
    ) {
      await replyCallback(
        Message.create({
          content: `👋 ¡Hola! Soy el bot de **Pedidos Manuales Frescoh!**\n\nUsa el comando \`/pedido\` para registrar una orden paso a paso.\n\nYo me encargaré de pedirle los datos del cliente, los productos y registrar el inventario automáticamente. 🚀`,
          role: 'assistant',
          channel: 'telegram-orders',
        }),
      );
      return true;
    }

    // 2. Comando de Inicio o Reinicio de Pedido
    if (contentLow.startsWith('/pedido')) {
      session.metadata.telegramOrder = {};
      session.setFlowState('TELEGRAM_AWAITING_CLIENT_NAME');
      await this.sessionsService.update(session);

      await replyCallback(
        Message.create({
          content:
            '🤖 *Asistente de Pedidos Manuales*\n\nIniciando nuevo registro. Por favor, dígame el *nombre completo* del cliente:',
          role: 'assistant',
          channel: 'telegram-orders',
        }),
      );
      return true;
    }

    // 3. Procesamiento por Estados
    switch (session.flowState) {
      case 'TELEGRAM_AWAITING_CLIENT_NAME':
        return this.handleAwaitingClientName(content, session, replyCallback);

      case 'TELEGRAM_AWAITING_CLIENT_PHONE':
        return this.handleAwaitingClientPhone(content, session, replyCallback);

      case 'TELEGRAM_AWAITING_CLIENT_DOC_TYPE':
        return this.handleAwaitingClientDocType(
          contentLow,
          session,
          replyCallback,
        );

      case 'TELEGRAM_AWAITING_CLIENT_DOC_NUMBER':
        return this.handleAwaitingClientDocNumber(
          content,
          session,
          replyCallback,
        );

      case 'TELEGRAM_AWAITING_CLIENT_ADDRESS':
        return this.handleAwaitingClientAddress(
          content,
          session,
          replyCallback,
        );

      case 'TELEGRAM_AWAITING_CLIENT_EMAIL':
        return this.handleAwaitingClientEmail(
          contentLow,
          session,
          replyCallback,
        );

      case 'TELEGRAM_AWAITING_ORDER_ITEMS':
        return this.handleAwaitingOrderItems(content, session, replyCallback);

      case 'TELEGRAM_AWAITING_DELIVERY_CHOICE':
        return this.handleAwaitingDeliveryChoice(
          contentLow,
          session,
          replyCallback,
        );

      case 'AWAITING_PAYMENT_PROOF':
        const isMedia = !!message.metadata?.media;
        const isPaymentKeyword =
          contentLow.includes('pago') ||
          contentLow.includes('soporte') ||
          contentLow.includes('pagué') ||
          contentLow.includes('listo');

        if (isMedia || isPaymentKeyword) {
          return this.handleAwaitingPaymentProof(
            message,
            session,
            replyCallback,
          );
        }
        await replyCallback(
          Message.create({
            content: `⏳ Aún sigo esperando el *comprobante de pago* del pedido ${session.metadata.currentOrderId} para poder avisarle al administrador. Por favor envíelo (foto o texto).`,
            role: 'assistant',
            channel: 'telegram-orders',
          }),
        );
        return true;

      case 'IDLE':
      default:
        if (message.role === 'user') {
          await replyCallback(
            Message.create({
              content: `⚠️ Jefe, use el comando \`/pedido\` para iniciar un nuevo registro manual.`,
              role: 'assistant',
              channel: 'telegram-orders',
            }),
          );
          return true;
        }
        return false;
    }
  }

  private async handleAwaitingClientName(
    name: string,
    session: Session,
    replyCallback: any,
  ) {
    if (!session.metadata) session.metadata = {};
    if (!session.metadata.telegramOrder) session.metadata.telegramOrder = {};

    session.metadata.telegramOrder.clientName = name;

    const allClients = await this.clientsService.findAll();
    const existingClient = allClients.find(
      (c) =>
        c.fullName?.toLowerCase().trim() === name.toLowerCase().trim() ||
        c.name.toLowerCase().trim() === name.toLowerCase().trim(),
    );

    if (
      existingClient &&
      existingClient.documentNumber &&
      existingClient.address &&
      existingClient.email
    ) {
      return this.skipToProductsWithClient(
        existingClient,
        session,
        replyCallback,
      );
    }

    session.setFlowState('TELEGRAM_AWAITING_CLIENT_PHONE');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `Entendido. Ahora por favor, dígame el *teléfono/WhatsApp* de ${name}:`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingClientPhone(
    phone: string,
    session: Session,
    replyCallback: any,
  ) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      await replyCallback(
        Message.create({
          content:
            '⚠️ El teléfono parece inválido. Por favor envíe los 10 dígitos:',
          role: 'assistant',
          channel: 'telegram-orders',
        }),
      );
      return true;
    }

    if (!session.metadata) session.metadata = {};
    if (!session.metadata.telegramOrder) session.metadata.telegramOrder = {};

    session.metadata.telegramOrder.clientPhone = cleanPhone;

    const existingClient = await this.clientsService.findByPhone(cleanPhone);
    if (
      existingClient &&
      existingClient.documentNumber &&
      existingClient.address &&
      existingClient.email
    ) {
      return this.skipToProductsWithClient(
        existingClient,
        session,
        replyCallback,
      );
    }

    session.setFlowState('TELEGRAM_AWAITING_CLIENT_DOC_TYPE');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `¿Qué *tipo de documento* tiene el cliente? (CC, NIT, CE, etc.):`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async skipToProductsWithClient(
    client: Client,
    session: Session,
    replyCallback: any,
  ) {
    this.logger.log(
      `👤 Cliente recurrente detectado: ${client.name}. Omitiendo recolección de datos.`,
    );

    session.metadata!.telegramOrder.clientPhone = client.phone;
    session.metadata!.telegramOrder.clientName = client.fullName || client.name;
    session.metadata!.telegramOrder.docType = client.documentType || 'CC';
    session.metadata!.telegramOrder.docNumber = client.documentNumber;
    session.metadata!.telegramOrder.address = client.address;
    session.metadata!.telegramOrder.email = client.email;

    session.setFlowState('TELEGRAM_AWAITING_ORDER_ITEMS');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content:
          `✅ ¡Cliente encontrado! Se usarán los datos de *${client.fullName || client.name}*.\n` +
          `Doc: ${client.documentType} ${client.documentNumber}\n` +
          `Dir: ${client.address}\n` +
          `Email: ${client.email}\n\n` +
          `Ahora por favor, escriba los *productos* del pedido:`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );

    return this.sendProductCatalogList(replyCallback);
  }

  private async handleAwaitingClientDocType(
    type: string,
    session: Session,
    replyCallback: any,
  ) {
    const docType = type.toUpperCase().trim();
    session.metadata!.telegramOrder.docType = docType;
    session.setFlowState('TELEGRAM_AWAITING_CLIENT_DOC_NUMBER');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `Ahora dígame el *número de documento* (${docType}):`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingClientDocNumber(
    num: string,
    session: Session,
    replyCallback: any,
  ) {
    session.metadata!.telegramOrder.docNumber = num.trim();
    session.setFlowState('TELEGRAM_AWAITING_CLIENT_ADDRESS');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `Por favor, dígame la *dirección de entrega*:`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingClientAddress(
    address: string,
    session: Session,
    replyCallback: any,
  ) {
    session.metadata!.telegramOrder.address = address.trim();
    session.setFlowState('TELEGRAM_AWAITING_CLIENT_EMAIL');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `Por último, ¿cuál es el *correo electrónico* del cliente? (O escriba "N/A" si no tiene):`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingClientEmail(
    email: string,
    session: Session,
    replyCallback: any,
  ) {
    session.metadata!.telegramOrder.email =
      email === 'n/a' ? `manual_${Date.now()}@frescoh.com` : email.trim();
    session.setFlowState('TELEGRAM_AWAITING_ORDER_ITEMS');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: `Perfecto. Ahora escriba los *productos* del pedido:`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );

    return this.sendProductCatalogList(replyCallback);
  }

  private async handleAwaitingOrderItems(
    itemsText: string,
    session: Session,
    replyCallback: any,
  ) {
    if (!session.metadata) session.metadata = {};
    if (!session.metadata.telegramOrder) session.metadata.telegramOrder = {};

    session.metadata.telegramOrder.itemsRaw = itemsText;
    session.setFlowState('TELEGRAM_AWAITING_DELIVERY_CHOICE');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: '¿El pedido incluye *domicilio*? Responda "Sí" o "No":',
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingDeliveryChoice(
    choice: string,
    session: Session,
    replyCallback: any,
  ) {
    const includesDelivery = choice.includes('si') || choice.includes('sí');
    const config = await this.inventoryProvider.getConfig();

    let deliveryFee = 0;
    if (includesDelivery) {
      const rawFee =
        config['COSTO_DOMICILIO'] || config['VALOR_DOMICILIO'] || '9000';
      deliveryFee =
        parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 9000;
    }

    if (!session.metadata) session.metadata = {};
    if (!session.metadata.telegramOrder) session.metadata.telegramOrder = {};

    session.metadata.telegramOrder.deliveryFee = deliveryFee;

    // 1. Asegurar registro/actualización del cliente
    const clientPhone = session.metadata.telegramOrder.clientPhone;
    let client = await this.clientsService.findByPhone(clientPhone);
    const profileUpdate = {
      fullName: session.metadata.telegramOrder.clientName,
      documentType: session.metadata.telegramOrder.docType,
      documentNumber: session.metadata.telegramOrder.docNumber,
      address: session.metadata.telegramOrder.address,
      email: session.metadata.telegramOrder.email,
    };

    if (!client) {
      client = Client.create(
        clientPhone,
        session.metadata.telegramOrder.clientName,
        clientPhone,
      );
      client.updateProfile(profileUpdate);
      await this.clientsService.create(client);
    } else {
      client.updateProfile(profileUpdate);
      await this.clientsService.save(client);
    }

    // 2. Resolver productos y precios
    const orderId = await this.ordersService.getNextOrderId();
    session.metadata.currentOrderId = orderId;

    const rawItems = session.metadata.telegramOrder.itemsRaw
      .split(/[\n,]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const allProducts = await this.inventoryProvider.listProducts();

    let subtotal = 0;
    const resolvedItems = rawItems.map((text: string) => {
      const match = text.match(/(\d+)\s+(.+)/);
      const qty = match ? parseInt(match[1]) : 1;
      const inputToSearch = (match ? match[2] : text).trim();
      const searchLow = inputToSearch.toLowerCase();

      let found = allProducts.find((p) => p.id.toLowerCase() === searchLow);
      if (!found) {
        found = allProducts.find(
          (p) =>
            p.name.toLowerCase().includes(searchLow) ||
            searchLow.includes(p.name.toLowerCase()),
        );
      }

      if (found) {
        subtotal += qty * found.price;
        return {
          productId: found.id,
          productName: found.name,
          quantity: qty,
          pricePerUnit: found.price,
        };
      }
      return {
        productId: 'MANUAL',
        productName: inputToSearch,
        quantity: qty,
        pricePerUnit: 0,
      };
    });

    const total = subtotal + deliveryFee;
    session.metadata.currentOrderItems = resolvedItems;
    session.metadata.total = total;
    session.metadata.deliveryFee = deliveryFee;

    // --- MEJORA: Validación de Stock Real y Lista de Espera ---
    this.logger.log(`🔍 Validando stock para pedido manual de ${client.name}`);
    const inventoryResponse = await this.inventoryAgent.handleRequest({
      from: 'telegram-orders' as any,
      to: 'inventory-agent' as any,
      action: 'check_stock_batch' as any,
      data: {
        items: resolvedItems.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
        })),
      },
      context: { clientId: client.id },
    });

    let finalResolvedItems = resolvedItems;
    let availableSubtotal = 0;
    const outOfStockMessages: string[] = [];

    if (inventoryResponse.status === 'SUCCESS') {
      const results = inventoryResponse.data.results;
      const availableItems = results.filter(
        (r: any) => r.availableQuantity > 0,
      );
      const outOfStockItems = results.filter((r: any) => r.missingQuantity > 0);

      // 1. Cobrar solo lo disponible
      finalResolvedItems = availableItems.map((i: any) => {
        availableSubtotal += i.pricePerUnit * i.availableQuantity;
        return {
          productId: i.productId || i.productName,
          productName: i.productName,
          quantity: i.availableQuantity,
          pricePerUnit: i.pricePerUnit,
        };
      });

      // 2. Gestionar Lista de Espera para lo que falta
      if (outOfStockItems.length > 0) {
        this.logger.log(
          `📋 Registrando ${outOfStockItems.length} items en lista de espera`,
        );
        session.metadata.missingItems = outOfStockItems.map((i: any) => ({
          productId: i.productId || i.productName,
          productName: i.productName,
          quantity: i.missingQuantity,
        }));

        for (const missing of outOfStockItems) {
          await this.inventoryProvider.addToWaitlist(
            client.id,
            missing.productId || missing.productName,
          );
          outOfStockMessages.push(
            `• ${missing.missingQuantity}x ${missing.productName} (No disponible, anotado en lista de espera)`,
          );
        }
      }
    } else {
      // Si falla la verificación, usamos lo procesado inicialmente (fallback)
      availableSubtotal = subtotal;
    }

    const finalTotal = availableSubtotal + deliveryFee;
    session.metadata.currentOrderItems = finalResolvedItems;
    session.metadata.total = finalTotal;

    // 3. Registrar en Prepago (Sheets) con los items REALMENTE disponibles
    await this.salesAgent.handleRequest({
      from: 'telegram-orders' as any,
      to: 'fulfillment-agent' as any,
      action: 'register_prepaid',
      context: { clientId: client.id, orderId },
      data: {
        items: finalResolvedItems,
        deliveryFee,
      },
    });

    let resumen =
      `📝 *RESUMEN DEL PEDIDO*\n\n` +
      `*ID:* ${orderId}\n` +
      `*Cliente:* ${session.metadata.telegramOrder.clientName}\n` +
      `*Doc:* ${session.metadata.telegramOrder.docType} ${session.metadata.telegramOrder.docNumber}\n` +
      `*Dirección:* ${session.metadata.telegramOrder.address}\n` +
      `*Email:* ${session.metadata.telegramOrder.email}\n` +
      `*Teléfono:* ${session.metadata.telegramOrder.clientPhone}\n\n` +
      `*Productos Disponibles:* \n${finalResolvedItems.map((i) => `• ${i.quantity}x ${i.productName} ($${(i.pricePerUnit * i.quantity).toLocaleString('es-CO')})`).join('\n')}\n`;

    if (outOfStockMessages.length > 0) {
      resumen += `\n*Faltantes (Lista de Espera):* \n${outOfStockMessages.join('\n')}\n`;
    }

    resumen +=
      `\n*Subtotal:* $${availableSubtotal.toLocaleString('es-CO')}\n` +
      `*Domicilio:* $${deliveryFee.toLocaleString('es-CO')}\n` +
      `*TOTAL A PAGAR:* $${finalTotal.toLocaleString('es-CO')}\n\n` +
      `El pedido ha sido registrado en la lista de espera de pago. Por favor, envíe el *comprobante* para notificar al administrador principal:`;

    session.setFlowState('AWAITING_PAYMENT_PROOF');
    await this.sessionsService.update(session);

    await replyCallback(
      Message.create({
        content: resumen,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }

  private async handleAwaitingPaymentProof(
    message: Message,
    session: Session,
    replyCallback: any,
  ) {
    if (!session.metadata || !session.metadata.telegramOrder) return false;

    const orderId = session.metadata.currentOrderId;
    const clientPhone = session.metadata.telegramOrder.clientPhone;
    const total = session.metadata.total || 0;

    this.logger.log(
      `💰 Telegram Orders: Procesando comprobante para ${orderId}`,
    );

    this.eventEmitter.emit(
      'payment.proof.submitted',
      new PaymentProofSubmittedEvent(
        orderId,
        clientPhone,
        message.metadata?.media,
        {
          clientName: session.metadata.telegramOrder.clientName,
          total: total,
          channel: 'telegram-orders',
          isManual: true,
        },
      ),
    );

    await replyCallback(
      Message.create({
        content: `✅ ¡Listo! El comprobante del pedido ${orderId} ha sido enviado al administrador principal para su aprobación por un total de $${total.toLocaleString('es-CO')}.`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );

    session.setFlowState('IDLE');
    await this.sessionsService.update(session);
    return true;
  }

  private async sendProductCatalogList(replyCallback: any) {
    let availableProductsText = '';
    try {
      const inventory = await this.inventoryProvider.listProducts();
      availableProductsText = inventory
        .filter((p) => p.stock > 0)
        .map(
          (p) =>
            `• *${p.id}* | ${p.name} ($${p.price.toLocaleString('es-CO')})`,
        )
        .join('\n');
    } catch (e) {}

    await replyCallback(
      Message.create({
        content: `*Catálogo Vigente:*\nPuede usar el *Código* (ej: 2 PROD-01) o el nombre.\n\n${availableProductsText || 'Consultando catálogo...'}\n\nEscriba el pedido del cliente:`,
        role: 'assistant',
        channel: 'telegram-orders',
      }),
    );
    return true;
  }
}
