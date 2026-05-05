const { google } = require('googleapis');
const path = require('path');

async function updateIds() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../../apps/gateway/google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1Pwqx9uTlF3tE3gwJpchjEzly2BGe689vq-U9bPHULsI';

  const newIds = [
    ['PROD-TIL-01'],
    ['PROD-HUE-JB'],
    ['PROD-HUE-GR'],
    ['FRU-ARA-500'],
    ['FRU-FRE-500'],
    ['FRU-MOR-500'],
    ['FRU-FRA-125'],
    ['FRU-UCH-500']
  ];

  try {
    console.log('--- ACTUALIZANDO IDs EN "Inventario " ---');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Inventario '!A2:A9",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newIds },
    });

    console.log('--- ACTUALIZANDO IDs EN "costos" ---');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "costos!A2:A9",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newIds },
    });

    console.log('✅ IDs actualizados correctamente en ambas hojas.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

updateIds();
