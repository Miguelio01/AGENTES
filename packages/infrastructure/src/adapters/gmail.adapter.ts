import { IPaymentScanner, PaymentConfirmation } from '@agentes/domain';
import { google } from 'googleapis';

export class GmailAdapter implements IPaymentScanner {
  private gmail: any;

  constructor(private readonly credentials: any) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
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
    
    // Búsqueda simplificada para evitar errores de parseo en Gmail
    // Quitamos las comillas del monto para que sea más flexible
    const query = `(Nequi OR Bancolombia) ${amount} after:${afterDate}`;

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
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
    // Implementación para ver los últimos sin filtrar por monto
    return [];
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
