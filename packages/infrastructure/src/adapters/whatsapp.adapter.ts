import { IChannel, Message } from '@agentes/domain';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  ConnectionState,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import * as path from 'path';
import { Boom } from '@hapi/boom';

export class WhatsAppAdapter implements IChannel {
  private sock: any;
  private isConnected: boolean = false;
  private onMessageReceived: (message: Message, senderId: string) => Promise<void>;

  constructor(
    private readonly sessionPath: string,
    callback: (message: Message, senderId: string) => Promise<void>
  ) {
    this.onMessageReceived = callback;
  }

  getName(): string {
    return 'whatsapp';
  }

  async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ 
      version: [2, 3000, 1017531287] as [number, number, number]
    }));

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, { 
          level: 'silent',
          log: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          trace: () => {},
          child: function() { return this; }
        } as any),
      },
      logger: { 
        level: 'silent',
        log: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
        child: function() { return this; }
      } as any,
      printQRInTerminal: true,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📡 QR Code received, scan it with WhatsApp:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('❌ WhatsApp connection closed, reconnecting:', shouldReconnect);
        if (shouldReconnect) {
          this.start();
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp connected successfully');
        this.isConnected = true;
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;

        const remoteJid = m.key.remoteJid || '';
        const remoteJidAlt = (m.key as any).remoteJidAlt || '';
        const participant = m.key.participant || '';
        
        let realPhone = '';
        
        // Prioridad 1: remoteJid si es un JID estándar
        if (remoteJid.includes('@s.whatsapp.net')) {
          realPhone = remoteJid.split('@')[0];
        } 
        // Prioridad 2: remoteJidAlt si el principal es un LID
        else if (remoteJidAlt.includes('@s.whatsapp.net')) {
          realPhone = remoteJidAlt.split('@')[0];
        }
        // Prioridad 3: participant (en grupos)
        else if (participant.includes('@s.whatsapp.net')) {
          realPhone = participant.split('@')[0];
        } 
        // Fallback: usar lo que tengamos
        else {
          realPhone = remoteJid.split('@')[0];
        }

        const senderId = remoteJid; // Mantenemos el JID original para responder
        const pushName = m.pushName || m.verifiedName || '';
        const cleanPhone = realPhone;
        const messageType = Object.keys(m.message)[0];
        
        let content = '';
        let mediaBuffer: Buffer | null = null;
        let mimeType = '';

        if (messageType === 'conversation') {
          content = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
          content = m.message.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
          content = m.message.imageMessage.caption || '[Imagen de comprobante]';
          mimeType = m.message.imageMessage.mimetype;
          // Descargar la imagen
          try {
            mediaBuffer = await downloadMediaMessage(m, 'buffer', {});
          } catch (err) {
            console.error('Error downloading media:', err);
          }
        }

        if (content || mediaBuffer) {
          const domainMessage = Message.create({
            content,
            role: 'user',
            channel: 'whatsapp',
            metadata: {
              ...(mediaBuffer ? { media: mediaBuffer, mimeType } : {}),
              pushName,
              phone: cleanPhone
            }
          });
          await this.onMessageReceived(domainMessage, senderId);
        }
      }
    });
  }

  async send(message: Message, recipientId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }
    
    // Small delay to simulate typing if message is long
    const typingDuration = Math.min(message.content.length * 50, 2000);
    await new Promise(resolve => setTimeout(resolve, typingDuration));
    
    await this.sock.sendMessage(recipientId, { text: message.content });
    
    // Reset presence
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
}
