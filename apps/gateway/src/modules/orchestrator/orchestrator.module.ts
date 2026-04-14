import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { AiModule } from '../ai/ai.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [AiModule, SessionsModule, ClientsModule],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
