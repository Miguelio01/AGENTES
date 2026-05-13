import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';
import { AgentsModule } from '../agents/agents.module';
import { LlmEmotionAnalyzerAdapter } from '@agentes/infrastructure';

@Module({
  imports: [AiModule, SessionsModule, ClientsModule, AgentsModule],
  providers: [
    OrchestratorService,
    {
      provide: 'IEmotionAnalyzer',
      useFactory: (aiService: AiService) => {
        // En lugar de pasar el provider ahora, pasamos un proxy o el servicio
        // Para este caso, creamos un objeto que cumpla con ILLMProvider pero delegue al aiService
        const lazyProvider = {
          generateResponse: (messages) => aiService.getResponse(messages),
        };
        return new LlmEmotionAnalyzerAdapter(lazyProvider as any);
      },
      inject: [AiService],
    },
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
