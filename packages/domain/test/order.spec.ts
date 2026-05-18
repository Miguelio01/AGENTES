import { describe, it, expect } from 'vitest';
import { Order } from '../src';

describe('Order Entity', () => {
  it('should calculate total including deliveryFee', () => {
    const order = Order.create({
      clientId: 'client-1',
      agentId: 'sales-agent',
      deliveryFee: 5000,
      items: [
        {
          productId: 'item-1',
          name: 'Fresas',
          quantity: 2,
          price: 10000,
        },
      ],
    });

    expect(order.total).toBe(25000); // (2 * 10000) + 5000
    expect(order.deliveryFee).toBe(5000);
  });

  it('should calculate total with zero deliveryFee if not provided', () => {
    const order = Order.create({
      clientId: 'client-1',
      agentId: 'sales-agent',
      items: [
        {
          productId: 'item-1',
          name: 'Fresas',
          quantity: 2,
          price: 10000,
        },
      ],
    });

    expect(order.total).toBe(20000);
    expect(order.deliveryFee).toBe(0);
  });
});
