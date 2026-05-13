import { DomainEvent } from './domain-event';

export class PaymentProofSubmittedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string, 
    public readonly clientId: string, 
    public readonly mediaBuffer?: Buffer,
    public readonly metadata?: Record<string, any>
  ) {
    super();
  }
}

export class AdminPaymentApprovedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string, 
    public readonly adminId: string,
    public readonly clientId?: string
  ) {
    super();
  }
}

export class OrderOutOfStockEvent extends DomainEvent {
  constructor(
    public readonly clientId: string, 
    public readonly missingProducts: string[]
  ) {
    super();
  }
}
