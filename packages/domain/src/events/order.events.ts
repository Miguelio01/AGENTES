import { DomainEvent } from './domain-event';

export class PaymentProofSubmittedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string, 
    public readonly clientId: string, 
    public readonly mediaUrl: string
  ) {
    super();
  }
}

export class AdminPaymentApprovedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string, 
    public readonly adminId: string
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
