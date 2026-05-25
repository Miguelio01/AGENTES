import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';

import { ConfigService } from '@nestjs/config';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'LLM_PROVIDER') return 'OLLAMA';
              return null;
            }),
          },
        },
        {
          provide: 'IAiMetricRepository',
          useValue: {
            save: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
