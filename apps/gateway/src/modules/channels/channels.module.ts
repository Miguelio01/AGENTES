import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
