import { IPaymentScanner, PaymentConfirmation } from '@agentes/domain';
import { google } from 'googleapis';

export class GmailAdapter implements IPaymentScanner {
  private gmail: any;

  constructor(
    private readonly credentials: any
  ) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async findConfirmation(amount: number, dateLimit: Date): Promise<PaymentConfirmation | null> {
    // Ejemplo de búsqueda: mensajes de Bancolombia con el monto específico
    const query = `Bancolombia ${amount} after:${dateLimit.toISOString().split('T')[0].replace(/-/g, '/')}`;
    
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
    });

    if (!response.data.messages || response.data.messages.length === 0) {
      return null;
    }

    const messageId = response.data.messages[0].id;
    const detail = await this.gmail.users.messages.get({ userId: 'me', id: messageId });
    
    // Aquí iría el parsing del cuerpo del correo para extraer detalles reales
    return {
      id: messageId,
      amount,
      timestamp: new Date(),
      provider: 'Bancolombia (Parsed)',
    };
  }

  async listRecentConfirmations(limit: number = 10): Promise<PaymentConfirmation[]> {
    return []; // Implementación futura
  }
}
