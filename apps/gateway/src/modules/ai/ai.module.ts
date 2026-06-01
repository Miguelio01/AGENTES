import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiService } from './ai.service';
import {
  AiMetricSchema,
  MongoAiMetricRepository,
} from '@agentes/infrastructure';
import { AI_METRIC_REPOSITORY_PORT, LLM_PROVIDER_PORT } from '@agentes/domain';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'AiMetric', schema: AiMetricSchema }]),
  ],
  providers: [
    AiService,
    {
      provide: AI_METRIC_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoAiMetricRepository(model),
      inject: [getModelToken('AiMetric')],
    },
    {
      provide: LLM_PROVIDER_PORT,
      useFactory: (aiService: AiService) => aiService.getProvider(),
      inject: [AiService],
    },
  ],
  exports: [AiService, AI_METRIC_REPOSITORY_PORT, LLM_PROVIDER_PORT],
})
export class AiModule {}
