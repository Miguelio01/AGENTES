import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderSaga } from './sagas/order.saga';
import { ChannelsModule } from '../channels/channels.module';
import { SessionsModule } from '../sessions/sessions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ClientsModule } from '../clients/clients.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    ConfigModule,
    ChannelsModule,
    SessionsModule,
    InventoryModule,
    ClientsModule,
    AgentsModule,
  ],
  providers: [OrdersService, OrderSaga],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
