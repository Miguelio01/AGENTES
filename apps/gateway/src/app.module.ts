import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './shared/config/config.validator';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsAdminController } from './modules/clients/clients-admin.controller';
import { AgentsModule } from './modules/agents/agents.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ClientsModule } from './modules/clients/clients.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { AiModule } from './modules/ai/ai.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { FinanceModule } from './modules/finance/finance.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UserToViewInterceptor } from './shared/interceptors/user-to-view.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    AgentsModule,
    SessionsModule,
    ClientsModule,
    OrdersModule,
    ChannelsModule,
    AiModule,
    MetricsModule,
    OrchestratorModule,
    FinanceModule,
    RemindersModule,
  ],
  controllers: [AppController, ClientsAdminController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: UserToViewInterceptor,
    },
  ],
})
export class AppModule {}
