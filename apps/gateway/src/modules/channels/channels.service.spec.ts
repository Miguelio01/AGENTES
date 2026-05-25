import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ChannelsService', () => {
  let service: ChannelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('mock-token'),
          },
        },
        {
          provide: OrchestratorService,
          useValue: {},
        },
        {
          provide: EventEmitter2,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
