import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
