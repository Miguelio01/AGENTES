import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrchestratorService } from '../src/modules/orchestrator/orchestrator.service';
import { SessionsService } from '../src/modules/sessions/sessions.service';
import { Message, Session } from '@agentes/domain';

async function runSimulation() {
  console.log('🚜 INICIANDO SIMULACIÓN DE FLUJO FRESCOH!...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const orchestrator = app.get(OrchestratorService);
  const sessionsService = app.get(SessionsService);

  const testSenderId = 'CLIENTE-PRUEBA-001';

  // 1. Asegurar que la sesión esté en el estado correcto para la prueba
  let session = await sessionsService.findActiveByClientId(testSenderId);
  if (!session) {
    session = Session.create({ clientId: testSenderId, agentId: 'fresco-consultor' });
    await sessionsService.create(session);
  }
  
  console.log('📍 Poniendo sesión en estado: AWAITING_PAYMENT_PROOF');
  session.setFlowState('AWAITING_PAYMENT_PROOF');
  await sessionsService.update(session);

  // 2. Simular el mensaje del comprobante
  const paymentMessage = Message.create({
    content: 'Listo sumercé, ya le hice la transferencia. Aquí le mando el comprobante.',
    role: 'user',
    channel: 'whatsapp'
  });

  console.log('📩 Enviando mensaje simulado al orquestador...');
  
  await orchestrator.handleIncomingMessage(
    paymentMessage,
    testSenderId,
    async (reply) => {
      console.log(`\n🤖 RESPUESTA DE FRESQUITOH EN WHATSAPP: \n"${reply.content}"\n`);
    },
    async (typing) => {
      // Mock typing
    }
  );

  console.log('📢 ¡REVISA TU TELEGRAM, MIGUEL! Debería haberte llegado la notificación de pago.');
  
  // Esperar un momento para que la Saga procese el evento antes de cerrar
  setTimeout(() => app.close(), 5000);
}

runSimulation().catch(err => {
  console.error('❌ Error en simulación:', err);
});
