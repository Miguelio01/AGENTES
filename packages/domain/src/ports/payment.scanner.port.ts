export const PAYMENT_SCANNER_PORT = 'IPaymentScanner';

export interface PaymentConfirmation {
  id: string; // ID de la transacción bancaria
  amount: number;
  senderName?: string;
  timestamp: Date;
  reference?: string;
  provider: string; // e.g., 'Bancolombia', 'PayPal', 'Nequi'
}

export interface IPaymentScanner {
  /**
   * Busca en Gmail confirmaciones de pago que coincidan con un monto y fecha
   */
  findConfirmation(amount: number, dateLimit: Date): Promise<PaymentConfirmation | null>;

  /**
   * Lista las últimas confirmaciones de pago recibidas
   */
  listRecentConfirmations(limit?: number): Promise<PaymentConfirmation[]>;
}
