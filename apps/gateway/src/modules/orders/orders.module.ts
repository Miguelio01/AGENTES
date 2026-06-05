import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CounterSchema, InfrastructureModule } from '@agentes/infrastructure'; // Ajustar si es necesario
import { OrdersService as GatewayOrdersService } from './orders.service';
import { OrdersService as DomainOrdersService } from '@agentes/domain';
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
    InfrastructureModule, // Asumiendo que provee los repositorios inyectables
  ],
  providers: [
    GatewayOrdersService, 
    DomainOrdersService, 
    OrderSaga, 
    InvoiceService
  ],
  controllers: [OrdersController, WebOrdersController],
  exports: [GatewayOrdersService, DomainOrdersService, InvoiceService],
})
export class OrdersModule {}
