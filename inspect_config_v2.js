const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function inspectConfig() {
  const credentialsPath = path.join(__dirname, 'apps/gateway/google-credentials.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('Credentials not found');
    return;
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsPath));
  const inventoryId = '1Pwqx9uTlF3tE3gwJpchjEzly2BGe689vq-U9bPHULsI';
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: inventoryId,
      range: 'Configuracion!A1:B10',
    });
    console.log('--- CONFIGURACIÓN ACTUAL ---');
    res.data.values.forEach(row => console.log(`${row[0]}: ${row[1]}`));
  } catch (e) {
    console.error('Error:', e.message);
  }
}
inspectConfig();
