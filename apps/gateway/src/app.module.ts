import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validate } from './shared/config/config.validator';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentsModule } from './modules/agents/agents.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ClientsModule } from './modules/clients/clients.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { AiModule } from './modules/ai/ai.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { FinanceModule } from './modules/finance/finance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    EventEmitterModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AgentsModule,
    SessionsModule,
    ClientsModule,
    OrdersModule,
    ChannelsModule,
    AiModule,
    MetricsModule,
    OrchestratorModule,
    FinanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
