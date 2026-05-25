import { IPaymentScanner, PaymentConfirmation } from '@agentes/domain';
import { google } from 'googleapis';

export class GmailAdapter implements IPaymentScanner {
  private gmail: any;

  constructor(private readonly credentials: any, private readonly clientEmail?: string) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      clientOptions: {
        subject: clientEmail,
      },
    });
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async findConfirmation(
    amount: number,
    dateLimit: Date,
  ): Promise<PaymentConfirmation | null> {
    // Formato de fecha para Gmail: YYYY/MM/DD
    const yyyy = dateLimit.getFullYear();
    const mm = String(dateLimit.getMonth() + 1).padStart(2, '0');
    const dd = String(dateLimit.getDate()).padStart(2, '0');
    const afterDate = `${yyyy}/${mm}/${dd}`;
    
    // Búsqueda simplificada: Gmail a veces falla con formatos complejos de monto o fecha
    // Probamos con un formato muy estándar: (Termino1 OR Termino2) Monto
    const query = `(${amount}) after:${afterDate}`;

    try {
      if (!this.credentials || !this.credentials.private_key) {
        console.warn('⚠️ Gmail credentials incomplete, skipping scan.');
        return null;
      }

      const response = await this.gmail.users.messages.list({
        userId: 'me', // Esto asume que la cuenta de servicio tiene delegación o el usuario es 'me'
        q: query,
      }).catch((err: any) => {
        // Capturar error de precondición (común si la cuenta de servicio no tiene buzón)
        if (err.message.includes('Precondition check failed')) {
           throw new Error('La cuenta de servicio de Google no tiene acceso a un buzón de Gmail. Verifique la configuración de delegación de dominio.');
        }
        throw err;
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        return null;
      }

      for (const msg of response.data.messages) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
        });
        const body = this.decodeMessageBody(detail.data);

        if (this.isConfirmedPayment(body, amount)) {
          return {
            id: msg.id,
            amount,
            timestamp: new Date(parseInt(detail.data.internalDate)),
            provider: body.includes('Nequi') ? 'Nequi' : 'Bancolombia',
            reference: this.extractReference(body),
          };
        }
      }
    } catch (e) {
      console.error('Error scanning Gmail:', e);
    }

    return null;
  }

  async listRecentConfirmations(
    limit: number = 10,
  ): Promise<PaymentConfirmation[]> {
    const today = new Date();
    const afterDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    
    // Búsqueda de términos bancarios comunes
    const query = `(Transferencia OR Pago OR Recibido) after:${afterDate}`;

    try {
      if (!this.credentials || !this.credentials.private_key) return [];

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: limit,
      });

      if (!response.data.messages) return [];

      const confirmations: PaymentConfirmation[] = [];
      for (const msg of response.data.messages) {
        const detail = await this.gmail.users.messages.get({ userId: 'me', id: msg.id });
        const body = this.decodeMessageBody(detail.data);
        
        // Extraer monto (buscando números precedidos por $ o similares)
        const amountMatch = body.match(/\$\s?([0-9.,]+)/);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(/[.,]/g, '')) : 0;

        if (amount > 0) {
          confirmations.push({
            id: msg.id,
            amount,
            timestamp: new Date(parseInt(detail.data.internalDate)),
            provider: body.includes('Nequi') ? 'Nequi' : 'Bancolombia',
            reference: this.extractReference(body),
          });
        }
      }
      return confirmations;
    } catch (e) {
      console.error('Error listing recent Gmail payments:', e);
      return [];
    }
  }

  private decodeMessageBody(message: any): string {
    let body = '';
    if (message.payload.parts) {
      body = message.payload.parts
        .map((part: any) =>
          part.body.data
            ? Buffer.from(part.body.data, 'base64').toString('utf-8')
            : '',
        )
        .join(' ');
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
    return body;
  }

  private isConfirmedPayment(body: string, amount: number): boolean {
    const cleanBody = body.replace(/\s+/g, ' ');
    // Verificar si el monto aparece en el cuerpo (con o sin separadores de miles)
    const amountStr = amount.toString();
    const formattedAmount = amount.toLocaleString('es-CO');
    return cleanBody.includes(amountStr) || cleanBody.includes(formattedAmount);
  }

  private extractReference(body: string): string {
    const refMatch = body.match(/(referencia|comprobante|nro|id):\s*(\d+)/i);
    return refMatch ? refMatch[2] : 'N/A';
  }
}
