import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsService } from './clients.service';
import { ClientSchema, MongoClientRepository } from '@agentes/infrastructure';
import { CLIENT_REPOSITORY_PORT } from '@agentes/domain';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Client', schema: ClientSchema }]),
  ],
  providers: [
    ClientsService,
    {
      provide: CLIENT_REPOSITORY_PORT,
      useFactory: (model: Model<any>) => new MongoClientRepository(model),
      inject: [getModelToken('Client')],
    },
  ],
  exports: [ClientsService]
})
export class ClientsModule {}
