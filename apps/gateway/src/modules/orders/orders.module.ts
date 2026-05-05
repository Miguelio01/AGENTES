import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderSaga } from './sagas/order.saga';
import { ChannelsModule } from '../channels/channels.module';
import { SessionsModule } from '../sessions/sessions.module';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';

@Module({
  imports: [ConfigModule, ChannelsModule, SessionsModule],
  providers: [
    OrdersService,
    OrderSaga,
    {
      provide: INVENTORY_PROVIDER_PORT,
      useFactory: (configService: ConfigService) => {
        const spreadsheetId = configService.get<string>('GOOGLE_SHEETS_INVENTORY_ID') || 'mock-id';
        // En una implementación real, aquí cargaríamos las credenciales desde un archivo o env
        const credentials = {}; 
        return new GoogleSheetsInventoryAdapter(spreadsheetId, credentials);
      },
      inject: [ConfigService],
    },
  ],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
