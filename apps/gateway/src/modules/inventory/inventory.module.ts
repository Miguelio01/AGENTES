import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';
import { PrismaInventoryAdapter } from './prisma-inventory.adapter';
import { SheetsSyncListener } from './sheets-sync.listener';
import * as fs from 'fs';
import * as path from 'path';

import { InventoryAdminController } from './inventory-admin.controller';
import { OrdersAdminController } from './orders-admin.controller';
import { SalesCyclesAdminController } from './sales-cycles.controller';
import { ClientsModule } from '../clients/clients.module';
import { OrdersModule } from '../orders/orders.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ClientsModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [
    InventoryAdminController,
    OrdersAdminController,
    SalesCyclesAdminController,
  ],
  providers: [
    SheetsSyncListener,
    {
      provide: 'GOOGLE_SHEETS_ADAPTER_INTERNAL',
      useFactory: (configService: ConfigService) => {
        const spreadsheetId =
          configService.get<string>('GOOGLE_SHEETS_INVENTORY_ID') || 'mock-id';
        const ordersSpreadsheetId = configService.get<string>(
          'GOOGLE_SHEETS_ORDERS_ID',
        );

        let credentials = {};
        try {
          const credsRoute = path.join(
            process.cwd(),
            'google-credentials.json',
          );
          if (fs.existsSync(credsRoute)) {
            credentials = JSON.parse(fs.readFileSync(credsRoute, 'utf8'));
          }
        } catch (e) {
          console.error('Error loading Google credentials:', e);
        }

        return new GoogleSheetsInventoryAdapter(
          spreadsheetId,
          credentials,
          ordersSpreadsheetId,
        );
      },
      inject: [ConfigService],
    },
    {
      provide: INVENTORY_PROVIDER_PORT,
      useClass: PrismaInventoryAdapter,
    },
  ],
  exports: [INVENTORY_PROVIDER_PORT],
})
export class InventoryModule {}
