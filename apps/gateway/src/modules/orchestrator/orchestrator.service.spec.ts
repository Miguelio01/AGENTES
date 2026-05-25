import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { AiService } from '../ai/ai.service';
import { SessionsService } from '../sessions/sessions.service';
import { ClientsService } from '../clients/clients.service';
import { InventoryAgentService } from '../agents/inventory-agent.service';
import { EscalationAgentService } from '../agents/escalation-agent.service';
import { SalesAgentService } from '../agents/sales-agent.service';
import { KnowledgeAgentService } from '../agents/knowledge-agent.service';
import { FinanceAgentService } from '../agents/finance-agent.service';
import { OrdersService } from '../orders/orders.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INVENTORY_PROVIDER_PORT } from '@agentes/domain';
import { ConfigService } from '@nestjs/config';

describe('OrchestratorService', () => {
  let service: OrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: AiService, useValue: {} },
        { provide: SessionsService, useValue: {} },
        { provide: ClientsService, useValue: {} },
        { provide: InventoryAgentService, useValue: {} },
        { provide: EscalationAgentService, useValue: {} },
        { provide: SalesAgentService, useValue: {} },
        { provide: KnowledgeAgentService, useValue: {} },
        { provide: FinanceAgentService, useValue: {} },
        { provide: OrdersService, useValue: { getNextOrderId: vi.fn() } },
        { provide: EventEmitter2, useValue: {} },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: 'IEmotionAnalyzer', useValue: {} },
        { provide: INVENTORY_PROVIDER_PORT, useValue: {} },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
