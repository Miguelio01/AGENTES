import { Message } from './packages/domain/src/entities/message.entity';
import { LLM_PROVIDER_PORT } from './packages/domain/src/ports/llm.provider.port';
import { KNOWLEDGE_BASE_PORT } from './packages/domain/src/ports/knowledge.base.port';
import { ObsidianRAGAdapter } from './packages/infrastructure/src/adapters/obsidian-rag.adapter';
import { OllamaProvider } from './packages/infrastructure/src/adapters/ollama.adapter';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: 'apps/gateway/.env' });

async function testAgentLogic() {
  console.log('🧪 Iniciando prueba de lógica para Fresquitoh...\n');

  // 1. Setup Adaptadores
  const brainPath = path.resolve(process.env.OBSIDIAN_VAULT_PATH || './brain');
  const knowledgeBase = new ObsidianRAGAdapter(brainPath);
  const llmProvider = new OllamaProvider(
    process.env.OLLAMA_URL || 'http://localhost:11434',
    process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b'
  );

  // 2. Simular llegada de un mensaje
  const userMessage = "Hola, ¿quién eres y qué venden?";
  console.log(`👤 Usuario: ${userMessage}`);

  // 3. Buscar en el cerebro
  const context = await knowledgeBase.search("identidad empresa");
  const knowledgeContext = context.map(r => r.content).join('\n\n');

  // 4. Construir Prompt con Identidad
  const systemPrompt = `
    Eres un asistente de IA. Tu base de conocimiento actual es:
    ${knowledgeContext}

    Instrucciones:
    - Responde siguiendo estrictamente tu identidad corporativa.
    - Sé amable y profesional.
  `;

  const messages = [
    Message.create({ role: 'system', content: systemPrompt, channel: 'test' }),
    Message.create({ role: 'user', content: userMessage, channel: 'test' })
  ];

  // 5. Generar Respuesta
  console.log('🤖 Fresquitoh pensando...');
  const response = await llmProvider.generateResponse(messages);

  console.log('\n--- RESPUESTA DE FRESQUITOH ---');
  console.log(response.content);
  console.log('-------------------------------\n');
}

testAgentLogic().catch(console.error);
