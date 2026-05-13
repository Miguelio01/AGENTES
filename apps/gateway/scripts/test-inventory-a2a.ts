import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrchestratorService } from '../src/modules/orchestrator/orchestrator.service';
import { Message } from '@agentes/domain';

async function testInventoryA2A() {
  console.log('⏳ Creando contexto de la aplicación...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const orchestrator = app.get(OrchestratorService);

  const testMessages = [
    "Hola Fresquitoh",
    "Sumercé, ¿tiene 1 kilo de fresas?",
    "¿Qué tipo de fertilizantes usan en la finca? ¿Son orgánicos?"
  ];

  console.log('\n🚀 INICIANDO PRUEBA DE AGENCIA DE AGENTES (A2A)\n');

  const senderId = 'test-user-real-999';

  for (const content of testMessages) {
    console.log(`\n👤 USUARIO: "${content}"`);
    
    const message = Message.create({
      content,
      role: 'user',
      channel: 'telegram'
    });

    // Simular recepción de mensaje
    await orchestrator.handleIncomingMessage(
      message,
      senderId,
      async (reply) => {
        console.log(`\n🤖 FRESQUITOH: "${reply.content}"`);
      },
      async (isTyping) => {
        if (isTyping) console.log('... Consultando a la Agencia de Agentes ...');
      }
    );
  }

  console.log('\n✅ Prueba finalizada.');
  await app.close();
  process.exit(0);
}

testInventoryA2A().catch(err => {
  console.error('❌ Error en la prueba:', err);
  process.exit(1);
});
