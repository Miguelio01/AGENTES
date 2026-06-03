import { IChannel, Message } from '@agentes/domain';
import makeWASocket, { 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  ConnectionState,
  downloadMediaMessage,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { MongoClient } from 'mongodb';
import { useMongoDBAuthState } from './mongodb-auth-state.adapter';
import * as fs from 'fs';
import * as path from 'path';

export class WhatsAppAdapter implements IChannel {
  private sock: any;
  private isConnected: boolean = false;
  private onMessageReceived: (message: Message, senderId: string) => Promise<void>;

  constructor(
    private readonly sessionOptions: { path?: string; mongoClient?: MongoClient; dbName?: string },
    callback: (message: Message, senderId: string) => Promise<void>
  ) {
    this.onMessageReceived = callback;
  }

  getName(): string {
    return 'whatsapp';
  }

  async start(): Promise<void> {
    let authState: any;

    if (this.sessionOptions.mongoClient) {
      console.log('📦 WhatsApp: Usando persistencia en MongoDB');
      const db = this.sessionOptions.mongoClient.db(this.sessionOptions.dbName || 'frescoh');
      const collection = db.collection('whatsapp_sessions');
      authState = await useMongoDBAuthState(collection, 'main-session');
    } else if (this.sessionOptions.path) {
      console.log(`📂 WhatsApp: Usando persistencia local en ${this.sessionOptions.path}`);
      authState = await useMultiFileAuthState(this.sessionOptions.path);
    } else {
      throw new Error('Debe proporcionar sessionOptions.path o sessionOptions.mongoClient');
    }

    const { state, saveCreds } = authState;
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ 
      version: [2, 3000, 1017531287] as [number, number, number],
      isLatest: false
    }));

    console.log(`📡 [WhatsApp] Baileys Version: ${version.join('.')} (Latest: ${isLatest})`);

    this.sock = makeWASocket({
      version,
      printQRInTerminal: false, // Lo manejamos nosotros
      browser: ['FRESCOH!', 'Chrome', '121.0.6167.140'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, { 
          level: 'warn',
          log: () => {},
          debug: () => {},
          info: () => {},
          warn: (msg: any) => console.warn('[Baileys-Keys]', msg),
          error: (msg: any) => console.error('[Baileys-Keys]', msg),
          trace: () => {},
          child: function() { return this; }
        } as any),
      },
      logger: { 
        level: 'warn',
        log: () => {},
        debug: () => {},
        info: () => {},
        warn: (msg: any) => console.warn('[Baileys]', msg),
        error: (msg: any) => console.error('[Baileys]', msg),
        trace: () => {},
        child: function() { return this; }
      } as any,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.update', async (updates: any) => {
      // ... (rest of poll updates logic)
    });

    this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('📡 [WhatsApp] Connection Update:', { connection, qr: !!qr });
      
      if (qr) {
        console.log('📢 [WhatsApp] Nuevo código QR generado. Escanéalo para conectar:');
        qrcode.generate(qr, { small: true });
      }
      
      if (connection === 'close') {
        const error = (lastDisconnect?.error as Boom);
        const statusCode = error?.output?.statusCode;
        const reason = error?.message || 'Unknown reason';
        console.log(`❌ [WhatsApp] Conexión cerrada. Status: ${statusCode}, Razón: ${reason}`);
        
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log('🔄 [WhatsApp] Intentando reconectar en 5 segundos...');
          setTimeout(() => this.start(), 5000);
        } else {
          console.log('🚪 [WhatsApp] Sesión cerrada permanentemente (Logged Out).');
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp connected successfully');
        this.isConnected = true;
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;

        // LIMPIEZA TOTAL: Baileys manda espacios en los JIDs a veces ('... @lid')
        const remoteJid = (m.key.remoteJid || '').replace(/\s+/g, ''); 
        let realPhone = remoteJid.split('@')[0];
        let detectedLid = remoteJid.includes('@lid') ? remoteJid.split('@')[0] : undefined;
        
        if (remoteJid.includes('@lid')) {
           // RESCATE DE IDENTIDAD: Baileys pone el JID real en remoteJidAlt según el volcado
           const alternativeJid = (m.key.remoteJidAlt || m.key.participant || m.participant || '').toString().replace(/\s+/g, '');
           
           if (alternativeJid && alternativeJid.includes('@s.whatsapp.net')) {
              realPhone = alternativeJid.split('@')[0];
              console.log(`🛡️ Rescate de Identidad: LID ${detectedLid} -> Teléfono Real ${realPhone}`);
           }
        }

        const pushName = m.pushName || m.verifiedName || '';
        let msg = m.message;
        if (msg.ephemeralMessage) msg = msg.ephemeralMessage.message;
        if (msg.viewOnceMessage) msg = msg.viewOnceMessage.message;
        if (msg.viewOnceMessageV2) msg = msg.viewOnceMessageV2.message;
        if (msg.viewOnceMessageV2Extension) msg = msg.viewOnceMessageV2Extension.message;
        if (!msg) continue;

        const messageType = Object.keys(msg).find(key => ![
          'messageContextInfo', 
          'senderKeyDistributionMessage', 
          'contextInfo'
        ].includes(key));
        
        if (!messageType) continue;

        let content = '';
        let mediaBuffer: Buffer | null = null;
        let mimeType = '';
        let orderItems: any[] = [];
        const cleanPhone = realPhone.replace(/[^0-9]/g, '');

        if (messageType === 'conversation') {
          content = msg.conversation;
        } else if (messageType === 'extendedTextMessage') {
          content = msg.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
          content = msg.imageMessage.caption || '[Imagen]';
          mimeType = msg.imageMessage.mimetype;
          try { mediaBuffer = await downloadMediaMessage(m, 'buffer', {}); } catch (err) {}
        } else if (messageType === 'order' || messageType === 'orderMessage') {
          const order = (msg as any).order || (msg as any).orderMessage;
          const orderId = order.orderId || order.id;
          const totalAmount = order.totalAmount1000 ? (order.totalAmount1000 / 1000).toFixed(2) : (order.total_price || null);
          const currency = order.totalCurrencyCode || order.currency || 'COP';
          
          let orderContent = `*¡Nuevo pedido del catálogo!* 🛒\n\n`;
          orderContent += `*ID de pedido:* ${orderId}\n`;
          if (totalAmount) orderContent += `*Total:* ${totalAmount} ${currency}\n`;

          // EXTRAER ITEMS SI VIENEN NATIVOS
          if (order.product_items && order.product_items.length > 0) {
            orderContent += `\n*Detalle del pedido:* \n`;
            order.product_items.forEach((item: any) => {
              const itemName = item.product_name || item.product_retailer_id;
              orderContent += `- ${item.quantity}x ${itemName} ($${item.item_price || 'N/A'})\n`;
              orderItems.push({
                product: itemName,
                productName: itemName,
                quantity: parseInt(item.quantity),
                price: item.item_price,
                productId: item.product_retailer_id
              });
            });
          } else {
            // INTENTO DE RECUPERAR DETALLES COMPLETOS
            try {
              console.log(`🔍 Intentando recuperar detalles para pedido ${orderId} con token ${order.token?.slice(0, 10)}...`);
              let details: any = null;
              if (this.sock.getOrderDetails) {
                try { details = await this.sock.getOrderDetails(orderId, order.token, remoteJid); } 
                catch (e) { details = await this.sock.getOrderDetails(orderId, order.token); }
              }

              if (details && (details.items || details.products)) {
                const itemsList = details.products || details.items || details.product_items || [];
                if (itemsList.length > 0) {
                  orderContent += `\n*Detalle del pedido:* \n`;
                  itemsList.forEach((item: any) => {
                    const itemName = item.name || item.product_name || 'Producto';
                    const rawPrice = item.price || item.priceAmount1000;
                    const itemPrice = rawPrice ? (parseInt(rawPrice.toString()) / 1000).toFixed(0) : 'N/A';
                    const itemQty = item.quantity?.quantity || item.quantity || 1;
                    orderContent += `- ${itemQty}x ${itemName} ($${itemPrice} ${currency})\n`;
                    orderItems.push({
                      product: itemName,
                      productName: itemName,
                      quantity: parseInt(itemQty.toString()),
                      price: itemPrice,
                      productId: item.retailerId || item.productId || item.id
                    });
                  });
                  console.log(`✅ Se recuperaron ${orderItems.length} items estructurados.`);
                }
              }
            } catch (e: any) { console.error('❌ Error recuperando detalles:', e.message); }
          }
          
          // FALLBACK FINAL: Parseo de texto
          if (orderItems.length === 0 && order.message) {
             const lines = order.message.split('\n');
             lines.forEach((line: string) => {
               const match = line.match(/(\d+)x\s+(.+)/);
               if (match) {
                 orderItems.push({
                   product: match[2].trim(),
                   quantity: parseInt(match[1]),
                   price: 'Verificar'
                 });
               }
             });
          }
          content = orderContent;
        } else if (messageType === 'productMessage') {
          const product = msg.productMessage.product;
          const price = product.priceAmount1000 ? (product.priceAmount1000 / 1000).toFixed(2) : null;
          content = `Me interesa este producto del catálogo:\n*${product.title || 'Producto'}*\n`;
          if (price) content += `*Precio:* ${price}\n`;
          orderItems.push({
            product: product.title || product.productId,
            quantity: 1,
            price: price,
            productId: product.productId
          });
        }

        if (content || mediaBuffer) {
          await this.onMessageReceived(
            Message.create({
              content,
              role: 'user',
              channel: 'whatsapp',
              metadata: {
                ...(mediaBuffer ? { media: mediaBuffer, mimeType } : {}),
                pushName,
                phone: cleanPhone,
                lid: detectedLid,
                orderItems: orderItems.length > 0 ? orderItems : undefined,
                externalTotal: messageType === 'orderMessage' ? (msg.orderMessage.totalAmount1000 / 1000) : undefined
              }
            }), 
            remoteJid
          );
        }
      }
    });
  }

  async send(message: Message, recipientId: string): Promise<void> {
    if (!this.isConnected) throw new Error('WhatsApp not connected');
    const typingDuration = Math.min(message.content.length * 15, 800);
    await new Promise(resolve => setTimeout(resolve, typingDuration));

    // PROCESAMIENTO DE TAGS TÉCNICOS (QR y Otros)
    const qrPattern = /\[SEND_QR\]|💎ADJUNTAR_QR_FRESCOH💎|\[SEND_QR_FRESCOH\]|#QR_FRESCOH#/gi;
    const hasQRTag = qrPattern.test(message.content);

    if (hasQRTag) {
      const cleanText = message.content.replace(qrPattern, '').trim();

      if (cleanText) {
        await this.sock.sendMessage(recipientId, { text: cleanText });
      }

      // Intentar enviar la imagen del QR con rutas absolutas robustas
      const rootDir = process.cwd();
      const possiblePaths = [
        path.resolve(rootDir, 'apps/gateway/src/assets/qr_frescoh.png'),
        path.resolve(rootDir, 'src/assets/qr_frescoh.png'),
        path.resolve(rootDir, 'assets/qr_frescoh.png'),
        '/Users/miguelio/Documents/GitHub/AGENTES/apps/gateway/src/assets/qr_frescoh.png'
      ];

      console.log(`🔍 [WhatsApp] Disparador QR detectado. Buscando en sistema...`);
      let sent = false;
      for (const qrPath of possiblePaths) {
        if (fs.existsSync(qrPath)) {
          console.log(`✅ [WhatsApp] QR enviado desde: ${qrPath}`);
          await this.sock.sendMessage(recipientId, {
            image: fs.readFileSync(qrPath),
            caption: 'Código QR Bancolombia - Frescoh!'
          });
          sent = true;
          break;
        }
      }

      if (!sent) {
        console.warn('⚠️ [WhatsApp] No se pudo encontrar qr_frescoh.png. Rutas intentadas:', possiblePaths);
      }
    } else {
      await this.sock.sendMessage(recipientId, { text: message.content });
    }
    
    await this.sock.sendPresenceUpdate('paused', recipientId);
  }

  async setTyping(recipientId: string, isTyping: boolean): Promise<void> {
    if (this.isConnected && this.sock) {
      await this.sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', recipientId);
    }
  }

  async stop(): Promise<void> {
    this.sock?.end();
    this.isConnected = false;
  }

  async logout(): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err: any) {
        console.warn('⚠️ WhatsApp: Error al intentar cerrar sesión formalmente (posiblemente ya desconectado):', err?.message || err);
        // Forzamos el cierre del socket si el logout formal falla
        this.sock.end();
      } finally {
        this.isConnected = false;
        console.log('🚪 WhatsApp: Sesión cerrada y credenciales locales invalidadas.');
      }
    }
  }

  /**
   * EXTRAE EL CATÁLOGO COMPLETO DE WHATSAPP BUSINESS
   * Guarda los resultados en apps/gateway/src/assets/whatsapp_catalog.json
   */
  async exportCatalog(): Promise<any> {
    if (!this.isConnected || !this.sock) {
      throw new Error('Debe conectar WhatsApp primero sumercé.');
    }

    console.log('🔍 [WhatsApp] Iniciando extracción de catálogo nativo...');
    try {
      // Intentar obtener el catálogo propio
      const businessOwnerJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
      
      // Baileys usa el método query para pedir el catálogo
      const result = await this.sock.query({
        tag: 'iq',
        attrs: {
          to: 's.whatsapp.net',
          type: 'get',
          xmlns: 'w:biz:catalog'
        },
        content: [
          {
            tag: 'product_list',
            attrs: {
              business_jid: businessOwnerJid
            }
          }
        ]
      });

      // Parsear respuesta (esto depende de la versión de Baileys, pero el iq query es estándar)
      // Como el parseo puede ser complejo, intentamos también con el método simplificado si existe
      let products = [];
      if (this.sock.getCatalog) {
         const cat = await this.sock.getCatalog(businessOwnerJid);
         products = cat.products || [];
      } else {
         // Si no, devolvemos el raw para depurar
         products = result;
      }

      // Corrección de ruta absoluta sumercé (Fix Definitivo)
      const currentCwd = process.cwd();
      console.log(`🔍 [WhatsApp] Depurando CWD actual: ${currentCwd}`);

      // Buscamos la raíz del proyecto (donde esté la carpeta apps)
      let rootDir = currentCwd;
      if (rootDir.includes('apps/gateway')) {
        rootDir = rootDir.split('apps/gateway')[0];
      }

      // Construimos la ruta limpia hacia assets
      const assetsDir = path.resolve(rootDir, 'apps/gateway/src/assets');
      
      console.log(`🔍 [WhatsApp] Ruta final de assets calculada: ${assetsDir}`);
      
      if (!fs.existsSync(assetsDir)) {
        console.log(`📁 [WhatsApp] Creando directorio faltante: ${assetsDir}`);
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const catalogPath = path.join(assetsDir, 'whatsapp_catalog.json');
      fs.writeFileSync(catalogPath, JSON.stringify(products, null, 2));
      console.log(`✅ [WhatsApp] Catálogo exportado con éxito a: ${catalogPath}`);
      return products;
    } catch (error: any) {
      console.error('❌ [WhatsApp] Error extrayendo catálogo:', error.message);
      throw error;
    }
  }
}
