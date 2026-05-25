import axios from 'axios';

const GATEWAY_URL = 'http://localhost:3000';
const ADK_URL = 'http://localhost:8000';

async function testVoiceQuality() {
  console.log('🧪 Iniciando Pruebas de Calidad de Voz - Fresquitoh\n');

  const testCases = [
    {
      name: 'Saludo Inicial',
      message: 'Hola, ¿qué tienen para hoy?',
    },
    {
      name: 'Consulta de Precios',
      message: '¿A cómo tiene la tilapia y los huevos?',
    },
    {
      name: 'Cierre de Venta',
      message: 'Listo, mándeme 2 kilos de tilapia y una caja de huevos jumbo. ¿Cuánto sería con el envío?',
    },
    {
      name: 'Duda de Pago',
      message: '¿Tienen Nequi? ¿Cómo les pago?',
    }
  ];

  for (const tc of testCases) {
    console.log(`--- Escenario: ${tc.name} ---`);
    console.log(`Usuario: "${tc.message}"`);
    
    try {
      // Probar vía ADK (que es el cerebro actual)
      const response = await axios.post(`${ADK_URL}/run`, {
        user_id: 'test-user',
        session_id: 'test-session',
        message: tc.message
      });
      
      console.log(`Fresquitoh: "${response.data.reply}"`);
      console.log(`Agente: ${response.data.metadata.agent} | Emoción: ${response.data.metadata.emotion}`);
    } catch (error: any) {
      console.log(`❌ Error en prueba: ${error.message}`);
    }
    console.log('\n');
  }
}

testVoiceQuality();
