import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentSchema, MongoAgentRepository } from '@agentes/infrastructure';
import { AGENT_REPOSITORY_PORT } from '@agentes/domain';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Agent', schema: AgentSchema }]),
  ],
  providers: [
    AgentsService,
    {
      provide: AGENT_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoAgentRepository(model),
      inject: [getModelToken('Agent')],
    },
  ],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
