import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Order,
  INVENTORY_PROVIDER_PORT,
  CLIENT_REPOSITORY_PORT,
} from '@agentes/domain';
import type { IInventoryProvider, IClientRepository } from '@agentes/domain';

export interface CreateOrderData {
  orderId?: string;
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
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel('Counter') private readonly counterModel: Model<any>,
    @Inject(CLIENT_REPOSITORY_PORT)
    private readonly clientRepository: IClientRepository,
    @Inject(INVENTORY_PROVIDER_PORT)
    private readonly inventoryProvider: IInventoryProvider,
  ) {}

  async getNextOrderId(): Promise<string> {
    const counter = await this.counterModel.findOneAndUpdate(
      { id: 'order_id' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const sequence = counter.seq.toString().padStart(6, '0');
    return `ORD-${sequence}`;
  }

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

    const orderId = data.orderId || (await this.getNextOrderId());

    const order = Order.create({
      id: orderId,
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
