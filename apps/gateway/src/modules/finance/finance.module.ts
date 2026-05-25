import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PAYMENT_SCANNER_PORT } from '@agentes/domain';
import { GmailAdapter } from '@agentes/infrastructure';
import * as fs from 'fs';
import * as path from 'path';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_SCANNER_PORT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        let credentials = {};
        try {
          const credsRoute = path.join(process.cwd(), 'google-credentials.json');
          if (fs.existsSync(credsRoute)) {
            credentials = JSON.parse(fs.readFileSync(credsRoute, 'utf8'));
          }
        } catch (e) {
          console.error('Error loading Google credentials for Gmail:', e);
        }

        const subject = configService.get<string>('GOOGLE_GMAIL_SUBJECT') || 'facturacion@frescoh.com';
        return new GmailAdapter(credentials, subject);
      },
    },
  ],
  exports: [PAYMENT_SCANNER_PORT],
})
export class FinanceModule {}
