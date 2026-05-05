const axios = require('axios');

async function simulateSagaNotification() {
  const token = '8344112771:AAG8_SxxzrDm_8OpRRWtic7xGZts4_XTOHM';
  const chatId = '1592838626';
  
  const adminMessage = `📦 *NUEVO PAGO POR CONFIRMAR*

*Cliente:* 573058634572@s.whatsapp.net
*Pedido:* ORD-PROBA-001
*Monto:* $32.000 (Domicilio incluido)

*Soporte:* [Ver imagen en WhatsApp]

Responde con: "Aprobar ORD-PROBA-001" para confirmar el pedido y descontar del inventario de Google Sheets.`;

  try {
    console.log('--- SIMULANDO NOTIFICACIÓN DE LA SAGA A TELEGRAM ---');
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: adminMessage,
      parse_mode: 'Markdown'
    });
    console.log('✅ Notificación simulada enviada. ¡Mira tu Telegram!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

simulateSagaNotification();
