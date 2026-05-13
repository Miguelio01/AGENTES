const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function check() {
  const credentials = JSON.parse(fs.readFileSync('google-credentials.json'));
  const spreadsheetId = '1Pwqx9uTlF3tE3gwJpchjEzly2BGe689vq-U9bPHULsI';
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    console.log('--- Hoja: Inventario ---');
    const inv = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Inventario '!A1:J2",
    });
    console.log('Headers:', inv.data.values[0]);
    console.log('Row 1:', inv.data.values[1]);

    console.log('\n--- Hoja: costos ---');
    const costs = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "costos!A1:J2",
    });
    console.log('Headers:', costs.data.values[0]);
    console.log('Row 1:', costs.data.values[1]);
  } catch (e) {
    console.error(e);
  }
}
check();
