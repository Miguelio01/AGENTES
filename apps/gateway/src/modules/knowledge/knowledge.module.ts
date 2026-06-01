import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  KNOWLEDGE_BASE_PORT,
  KNOWLEDGE_REPOSITORY_PORT,
  LLM_PROVIDER_PORT,
  ILLMProvider,
  IKnowledgeRepository,
} from '@agentes/domain';
import {
  KnowledgeSchema,
  MongoKnowledgeRepository,
  VectorRAGAdapter,
} from '@agentes/infrastructure';
import { KnowledgeSyncService } from './sync.service';
import { AiModule } from '../ai/ai.module';
import { Model } from 'mongoose';

@Module({
  imports: [
    ConfigModule,
    AiModule,
    MongooseModule.forFeature([
      { name: 'KnowledgeChunk', schema: KnowledgeSchema },
    ]),
  ],
  providers: [
    KnowledgeSyncService,
    {
      provide: KNOWLEDGE_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoKnowledgeRepository(model),
      inject: [getModelToken('KnowledgeChunk')],
    },
    {
      provide: KNOWLEDGE_BASE_PORT,
      useFactory: (
        llmProvider: ILLMProvider,
        knowledgeRepo: IKnowledgeRepository,
      ) => {
        return new VectorRAGAdapter(llmProvider, knowledgeRepo);
      },
      inject: [LLM_PROVIDER_PORT, KNOWLEDGE_REPOSITORY_PORT],
    },
  ],
  exports: [KNOWLEDGE_BASE_PORT, KNOWLEDGE_REPOSITORY_PORT],
})
export class KnowledgeModule {}
