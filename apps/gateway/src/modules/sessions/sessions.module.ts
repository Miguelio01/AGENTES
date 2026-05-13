import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionSchema, MongoSessionRepository } from '@agentes/infrastructure';
import { SESSION_REPOSITORY_PORT } from '@agentes/domain';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Session', schema: SessionSchema }]),
  ],
  providers: [
    SessionsService,
    {
      provide: SESSION_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoSessionRepository(model),
      inject: [getModelToken('Session')],
    },
  ],
  controllers: [SessionsController],
  exports: [SessionsService],
})
export class SessionsModule {}
