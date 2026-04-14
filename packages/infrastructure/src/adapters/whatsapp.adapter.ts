import { IChannel, Message } from '@agentes/domain';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  ConnectionState
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
        keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' } as any),
      },
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

        const senderId = m.key.remoteJid!;
        const content = m.message.conversation || 
                        m.message.extendedTextMessage?.text || 
                        '';

        if (content) {
          const domainMessage = Message.create({
            content,
            role: 'user',
            channel: 'whatsapp',
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
    await this.sock.sendMessage(recipientId, { text: message.content });
  }

  async stop(): Promise<void> {
    this.sock?.end();
    this.isConnected = false;
  }
}
