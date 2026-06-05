import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CounterSchema } from '@agentes/infrastructure';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { WebOrdersController } from './web-orders.controller';
import { InvoiceService } from './invoice.service';
import { OrderSaga } from './sagas/order.saga';
import { ChannelsModule } from '../channels/channels.module';
import { SessionsModule } from '../sessions/sessions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ClientsModule } from '../clients/clients.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Counter', schema: CounterSchema }]),
    ConfigModule,
    forwardRef(() => ChannelsModule),
    SessionsModule,
    forwardRef(() => InventoryModule),
    ClientsModule,
    forwardRef(() => AgentsModule),
  ],
  providers: [
    OrdersService, 
    OrderSaga, 
    InvoiceService
  ],
  controllers: [OrdersController, WebOrdersController],
  exports: [OrdersService, InvoiceService],
})
export class OrdersModule {}
