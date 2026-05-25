import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryAgentService } from './inventory-agent.service';
import { KnowledgeAgentService } from './knowledge-agent.service';
import { EscalationAgentService } from './escalation-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { FinanceAgentService } from './finance-agent.service';
import { InternalToolsController } from './internal-tools.controller';
import { AgentSchema, MongoAgentRepository } from '@agentes/infrastructure';
import { AGENT_REPOSITORY_PORT } from '@agentes/domain';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InventoryModule } from '../inventory/inventory.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { FinanceModule } from '../finance/finance.module';
import { AiModule } from '../ai/ai.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Agent', schema: AgentSchema }]),
    InventoryModule,
    KnowledgeModule,
    FinanceModule,
    AiModule,
    ClientsModule,
  ],
  providers: [
    InventoryAgentService,
    KnowledgeAgentService,
    EscalationAgentService,
    SalesAgentService,
    FinanceAgentService,
    {
      provide: AGENT_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoAgentRepository(model),
      inject: [getModelToken('Agent')],
    },
  ],
  controllers: [InternalToolsController],
  exports: [
    InventoryAgentService,
    KnowledgeAgentService,
    EscalationAgentService,
    SalesAgentService,
    FinanceAgentService,
  ],
})
export class AgentsModule {}
