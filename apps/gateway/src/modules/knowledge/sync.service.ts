import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { KNOWLEDGE_REPOSITORY_PORT, LLM_PROVIDER_PORT } from '@agentes/domain';
import type { IKnowledgeRepository, ILLMProvider } from '@agentes/domain';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class KnowledgeSyncService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeSyncService.name);
  private readonly vaultPath: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(KNOWLEDGE_REPOSITORY_PORT)
    private readonly knowledgeRepo: IKnowledgeRepository,
    @Inject(LLM_PROVIDER_PORT)
    private readonly llmProvider: ILLMProvider,
  ) {
    this.vaultPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('OBSIDIAN_VAULT_PATH') || '../../brain',
    );
  }

  async onModuleInit() {
    this.logger.log(`🚀 Knowledge Sync initialized for: ${this.vaultPath}`);
    // Sincronización inicial al arrancar
    this.syncKnowledge().catch((err) =>
      this.logger.error(`Initial sync failed: ${err.message}`),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    this.logger.log('⏰ Starting scheduled knowledge sync...');
    await this.syncKnowledge();
  }

  async syncKnowledge() {
    if (!fs.existsSync(this.vaultPath)) {
      this.logger.warn(
        `Vault path ${this.vaultPath} does not exist. Skipping sync.`,
      );
      return;
    }

    const files = this.getAllFiles(this.vaultPath).filter((f) =>
      f.endsWith('.md'),
    );
    this.logger.log(`Found ${files.length} markdown files in brain.`);

    for (const file of files) {
      try {
        await this.processFile(file);
      } catch (error: any) {
        this.logger.error(`Error processing file ${file}: ${error.message}`);
      }
    }

    this.logger.log('✅ Knowledge sync completed.');
  }

  private async processFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(this.vaultPath, filePath);
    const checksum = crypto.createHash('md5').update(content).digest('hex');

    // Buscar si ya existe y si ha cambiado
    const existingChunks = await this.knowledgeRepo.findBySource(relativePath);
    const hasChanged =
      existingChunks.length === 0 || existingChunks[0].checksum !== checksum;

    if (!hasChanged) {
      return;
    }

    this.logger.log(`📄 File changed or new: ${relativePath}. Re-indexing...`);

    // Borrar versiones antiguas
    await this.knowledgeRepo.deleteBySource(relativePath);

    // Fragmentación básica (por ahora el archivo completo como un chunk si no es muy grande)
    // TODO: Implementar chunking semántico real
    const chunks = this.chunkText(content);

    for (const chunkContent of chunks) {
      const embedding = await this.llmProvider.generateEmbeddings(chunkContent);
      await this.knowledgeRepo.save({
        content: chunkContent,
        source: relativePath,
        embedding,
        checksum,
        updatedAt: new Date(),
      });
    }
  }

  private chunkText(text: string, maxLength: number = 800): string[] {
    // Si es corto, devolver completo
    if (text.length <= maxLength) return [text];

    // Fragmentación por párrafos con margen de seguridad para tokens
    const paragraphs = text.split('\n\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const p of paragraphs) {
      // Si un solo párrafo es más grande que el límite, lo cortamos por líneas
      if (p.length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());

        const lines = p.split('\n');
        let lineChunk = '';
        for (const line of lines) {
          if ((lineChunk + line).length > maxLength) {
            chunks.push(lineChunk.trim());
            lineChunk = line + '\n';
          } else {
            lineChunk += line + '\n';
          }
        }
        currentChunk = lineChunk;
        continue;
      }

      if ((currentChunk + p).length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = p + '\n\n';
      } else {
        currentChunk += p + '\n\n';
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  private getAllFiles(dirPath: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
      const name = path.join(dirPath, file);
      if (fs.statSync(name).isDirectory()) {
        this.getAllFiles(name, fileList);
      } else {
        fileList.push(name);
      }
    });
    return fileList;
  }
}
