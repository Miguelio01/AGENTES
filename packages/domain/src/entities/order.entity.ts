export type OrderStatus = 'pending' | 'paid' | 'confirmed' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  unitCost?: number;
}

export interface OrderProps {
  id: string;
  clientId: string;
  agentId: string;
  salesCycleId?: string;
  items: OrderItem[];
  deliveryFee?: number;
  total: number;
  status: OrderStatus;
  paymentConfirmationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  constructor(private readonly props: OrderProps) {}

  get id(): string { return this.props.id; }
  get clientId(): string { return this.props.clientId; }
  get agentId(): string { return this.props.agentId; }
  get salesCycleId(): string | undefined {
    return this.props.salesCycleId;
  }

  get items(): OrderItem[] {
    return [...this.props.items];
  }

  get deliveryFee(): number {
    return this.props.deliveryFee || 0;
  }
  get total(): number { return this.props.total; }
  get status(): OrderStatus { return this.props.status; }
  get paymentConfirmationId(): string | undefined { return this.props.paymentConfirmationId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  static create(props: Omit<OrderProps, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'total' | 'deliveryFee'> & { id?: string, total?: number, deliveryFee?: number }): Order {
    const deliveryFee = props.deliveryFee || 0;
    const total = props.total !== undefined 
      ? props.total 
      : props.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) + deliveryFee;
    
    return new Order({
      ...props,
      id: props.id || crypto.randomUUID(),
      deliveryFee,
      total,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  markAsPaid(confirmationId?: string): void {
    this.props.status = 'paid';
    this.props.paymentConfirmationId = confirmationId;
    this.props.updatedAt = new Date();
  }

  confirm(): void {
    this.props.status = 'confirmed';
    this.props.updatedAt = new Date();
  }

  deliver(): void {
    this.props.status = 'delivered';
    this.props.updatedAt = new Date();
  }
}
