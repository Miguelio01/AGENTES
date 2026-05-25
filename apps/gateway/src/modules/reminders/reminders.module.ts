import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';
import { InventoryModule } from '../inventory/inventory.module';
import { forwardRef } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [
    SessionsModule,
    ClientsModule,
    InventoryModule,
    forwardRef(() => ChannelsModule),
  ],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
