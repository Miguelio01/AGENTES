import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel('Counter') private readonly counterModel: Model<any>,
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
}
