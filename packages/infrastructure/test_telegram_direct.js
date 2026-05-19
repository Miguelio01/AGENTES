const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno desde la raíz de apps/gateway
dotenv.config({ path: path.join(__dirname, '../apps/gateway/.env') });

async function testTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.TELEGRAM_ADMIN_ID;

  if (!token || !adminId) {
    console.error('❌ Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_ID en el .env');
    return;
  }

  console.log(`🚀 Probando conexión con el bot... (AdminID: ${adminId})`);
  const bot = new Telegraf(token);

  try {
    const me = await bot.telegram.getMe();
    console.log(`✅ Bot conectado: @${me.username}`);

    console.log('📤 Intentando enviar mensaje de prueba...');
    await bot.telegram.sendMessage(adminId, '🚜 *PRUEBA TÉCNICA:* Miguel, si recibes este mensaje, la conexión del bot está funcionando perfectamente y el error 429 fue temporal.', { parse_mode: 'Markdown' });
    console.log('✅ Mensaje enviado con éxito.');
  } catch (e) {
    console.error('❌ Error en la prueba:', e.message);
    if (e.response) {
      console.error('Detalles:', JSON.stringify(e.response, null, 2));
    }
  }
}

testTelegram();
