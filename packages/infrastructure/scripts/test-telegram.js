const axios = require('axios');

async function testTelegram() {
  const token = '8344112771:AAG8_SxxzrDm_8OpRRWtic7xGZts4_XTOHM';
  const chatId = '1592838626';
  const message = '🚜 ¡Hola patrón Miguel! Soy Fresquitoh reportándose. Mi conexión con su cuenta es exitosa. ¡Listo para trabajar en la finca! 🍓';

  try {
    console.log('--- ENVIANDO MENSAJE DE PRUEBA A TELEGRAM ---');
    const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });

    if (response.data.ok) {
      console.log('✅ Mensaje enviado con éxito. ¡Revise su Telegram, sumercé!');
    } else {
      console.error('❌ Error al enviar:', response.data);
    }
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    if (err.response) console.error(err.response.data);
  }
}

testTelegram();
