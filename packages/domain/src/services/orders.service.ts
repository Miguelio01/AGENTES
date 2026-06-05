import { Injectable, Inject } from '@nestjs/common';
import {
  Order,
  IInventoryProvider,
  INVENTORY_PROVIDER_PORT,
  IClientRepository,
  CLIENT_REPOSITORY_PORT,
} from '../index';

export interface CreateOrderData {
  orderId: string;
  clientId: string;
  items: Array<{
    productId?: string;
    product?: string;
    id?: string;
    productName?: string;
    name?: string;
    quantity?: number;
    unitsNeeded?: number;
    pricePerUnit?: number;
    price?: number;
  }>;
  deliveryFee?: number | null;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  async createOrder(data: CreateOrderData) {
    const client = await this.clientRepository.findById(data.clientId);
    if (!client) {
      throw new Error('Cliente no encontrado');
    }

    const config = await this.inventoryProvider.getConfig();
    const rawFee = config['COSTO_DOMICILIO'] || '0';
    const configDeliveryFee =
      parseInt(rawFee.replace(/[$. ]/g, '').split(',')[0]) || 0;

    const deliveryFee =
      data.deliveryFee !== undefined && data.deliveryFee !== null
        ? data.deliveryFee
        : configDeliveryFee;

    const order = Order.create({
      id: data.orderId,
      clientId: client.id,
      agentId: 'sales-agent', // Mantener por compatibilidad inicial
      deliveryFee,
      items: data.items.map((i) => ({
        productId: i.productId || i.product || i.id || 'MANUAL',
        name: i.productName || i.product || i.name || 'Producto',
        quantity: i.quantity || i.unitsNeeded || 1,
        price: i.pricePerUnit || i.price || 0,
      })),
    });

    await this.inventoryProvider.registerPrepaidOrder(order, client);

    return order;
  }
}
