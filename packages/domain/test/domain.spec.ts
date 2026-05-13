import { describe, it, expect } from 'vitest';
import { Client, Session, PaymentProofSubmittedEvent } from '../src';

describe('Domain Entities and Events', () => {
  it('should allow updating billing data on Client', () => {
    const client = Client.create('123', 'Miguel', '123');
    const billingData = {
      taxId: '102030',
      email: 'miguel@example.com',
      address: 'Calle Falsa 123',
      city: 'Bogotá',
      phone: '3001234567'
    };
    
    client.updateBillingData(billingData);
    expect(client.billingData).toEqual(billingData);
  });

  it('should manage Session flow state', () => {
    const session = Session.create({ clientId: '123', agentId: 'bot' });
    expect(session.flowState).toBe('IDLE');
    
    session.setFlowState('AWAITING_ADDRESS');
    expect(session.flowState).toBe('AWAITING_ADDRESS');
  });

  it('should create domain events correctly', () => {
    const event = new PaymentProofSubmittedEvent('order-1', 'client-1', 'http://image.url');
    expect(event.orderId).toBe('order-1');
    expect(event.occurredOn).toBeInstanceOf(Date);
  });
});
