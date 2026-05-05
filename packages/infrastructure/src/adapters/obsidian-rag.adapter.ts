import { IKnowledgeBase, KnowledgeResult } from '@agentes/domain';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Adaptador de conocimiento basado en archivos Markdown.
 * Diseñado para ser portátil y compatible con Obsidian si se desea.
 */
export class ObsidianRAGAdapter implements IKnowledgeBase {
  constructor(private readonly vaultPath: string) {}

  async search(query: string, limit: number = 3): Promise<KnowledgeResult[]> {
    console.log(`Searching brain at ${this.vaultPath} for: ${query}`);
    
    if (!this.vaultPath || !fs.existsSync(this.vaultPath)) {
      console.warn(`Brain path ${this.vaultPath} does not exist.`);
      return [];
    }

    try {
      const results: KnowledgeResult[] = [];
      const files = this.getAllFiles(this.vaultPath).filter(f => f.endsWith('.md'));
      
      // Búsqueda básica por palabras clave (será mejorada con LightRAG pronto)
      const keyword = query.toLowerCase();
      const matchedFiles = files.filter(file => {
        const content = fs.readFileSync(file, 'utf-8').toLowerCase();
        return content.includes(keyword) || path.basename(file).toLowerCase().includes(keyword);
      }).slice(0, limit);

      for (const file of matchedFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        results.push({
          content,
          source: path.relative(this.vaultPath, file),
          score: 1.0,
        });
      }
      
      return results;
    } catch (error) {
      console.error('Error reading brain knowledge:', error);
      return [];
    }
  }

  async getDocument(filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.vaultPath, filePath);
      if (!fs.existsSync(fullPath)) return null;
      return fs.readFileSync(fullPath, 'utf-8');
    } catch (err) {
      return null;
    }
  }

  async addKnowledge(title: string, content: string, metadata?: Record<string, any>): Promise<void> {
    try {
      if (!fs.existsSync(this.vaultPath)) {
        fs.mkdirSync(this.vaultPath, { recursive: true });
      }

      const fileName = `${this.sanitizeFileName(title)}.md`;
      const filePath = path.join(this.vaultPath, fileName);

      let fileContent = '';
      if (metadata) {
        fileContent += '---\n';
        for (const [key, value] of Object.entries(metadata)) {
          fileContent += `${key}: ${value}\n`;
        }
        fileContent += '---\n\n';
      }
      fileContent += content;

      fs.writeFileSync(filePath, fileContent, 'utf-8');
      console.log(`✅ New knowledge added: ${fileName}`);
    } catch (error) {
      console.error('Error adding knowledge:', error);
      throw error;
    }
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

  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }
}
