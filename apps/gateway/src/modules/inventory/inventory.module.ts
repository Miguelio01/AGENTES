import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import { GoogleSheetsInventoryAdapter } from '@agentes/infrastructure';
import * as fs from 'fs';
import * as path from 'path';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: INVENTORY_PROVIDER_PORT,
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
  ],
  exports: [INVENTORY_PROVIDER_PORT],
})
export class InventoryModule {}
