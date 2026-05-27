import { forwardRef, Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { TelegramOrdersService } from './telegram-orders.service';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';
import { AgentsModule } from '../agents/agents.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmEmotionAnalyzerAdapter } from '@agentes/infrastructure';

@Module({
  imports: [
    AiModule,
    SessionsModule,
    ClientsModule,
    AgentsModule,
    InventoryModule,
    forwardRef(() => OrdersModule),
    ConfigModule,
  ],
  providers: [
    OrchestratorService,
    TelegramOrdersService,
    {
      provide: 'IEmotionAnalyzer',
      useFactory: (aiService: AiService, configService: ConfigService) => {
        const lazyProvider = {
          generateResponse: (messages) => aiService.getResponse(messages, 'emotion_analysis'),
        };
        const adkUrl = configService.get<string>('ADK_SALES_AGENT_URL') || 'http://localhost:8000';
        const useAdk = configService.get<string>('USE_ADK_EMOTION_ANALYZER') === 'true';
        return new LlmEmotionAnalyzerAdapter(lazyProvider as any, useAdk ? adkUrl : undefined);
      },
      inject: [AiService, ConfigService],
    },
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
