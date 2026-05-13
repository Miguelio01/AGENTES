import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KNOWLEDGE_BASE_PORT } from '@agentes/domain';
import { ObsidianRAGAdapter } from '@agentes/infrastructure';
import * as path from 'path';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KNOWLEDGE_BASE_PORT,
      useFactory: (configService: ConfigService) => {
        const brainPath = path.resolve(
          process.cwd(),
          configService.get<string>('OBSIDIAN_VAULT_PATH') || '../../brain',
        );
        return new ObsidianRAGAdapter(brainPath);
      },
      inject: [ConfigService],
    },
  ],
  exports: [KNOWLEDGE_BASE_PORT],
})
export class KnowledgeModule {}
